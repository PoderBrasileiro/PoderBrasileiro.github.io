// Coleta os cargos e gera os JSON que o site lê (public/data/).
//
//   npm run coletar
//
// Fontes:
//   - Senado Federal, Dados Abertos ........ senadores em exercício e votações
//   - IBGE, API de malhas e localidades .... mapa e lista de UFs
//   - Wikipédia em português ............... governadores e ministros
//   - data/manual.json ..................... presidente e vice
//
// Governadores e ministros não têm API oficial. A Wikipédia é a fonte mais
// atualizada que existe (registra renúncia e interino no mesmo dia), mas é
// uma tabela escrita por gente: se o formato dela mudar, o parser quebra.
// Por isso as checagens no fim — com contagem errada o script aborta e os
// arquivos antigos ficam como estavam.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tabelaPartidos, normalizarPartido } from './partidos.mjs';

const RAIZ = new URL('..', import.meta.url);
const SAIDA = new URL('public/data/', RAIZ);
const UA = 'PoderBR/0.1 (projeto pessoal; dados publicos)';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

async function json(url, opts = {}) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, ...opts });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return r.json();
}

async function lerJson(caminho) {
  return JSON.parse(await readFile(new URL(caminho, RAIZ), 'utf8'));
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------- wikitexto ----------

async function wikitexto(pagina) {
  const u = 'https://pt.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'parse', page: pagina, prop: 'wikitext', format: 'json', redirects: '1',
  });
  const j = await json(u);
  if (!j.parse) throw new Error(`Wikipédia: página "${pagina}" não encontrada`);
  return j.parse.wikitext['*'];
}

function secao(texto, titulo) {
  const i = texto.indexOf(`== ${titulo} ==`);
  if (i < 0) throw new Error(`Wikipédia: seção "${titulo}" sumiu`);
  const j = texto.indexOf('\n== ', i + 5);
  return texto.slice(i, j < 0 ? undefined : j);
}

// Tira referências e predefinições ({{...}}, inclusive aninhadas). As notas de
// rodapé citam ex-governadores com link, e sem isso eles viram falso positivo.
function limpar(t) {
  t = t.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  let antes;
  do { antes = t; t = t.replace(/\{\{[^{}]*\}\}/g, ''); } while (t !== antes);
  return t;
}

const link = (s) => {
  const m = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  return m ? { alvo: m[1].trim(), texto: (m[2] ?? m[1]).trim() } : null;
};

const arquivo = (s) => s.match(/\[\[(?:Ficheiro|Arquivo|Imagem|File):([^|\]]+)/i)?.[1].trim() ?? null;

const fotoCommons = (nome) => nome
  ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(nome.replace(/ /g, '_'))}?width=240`
  : null;

const urlWiki = (titulo) => `https://pt.wikipedia.org/wiki/${encodeURIComponent(titulo.replace(/ /g, '_'))}`;

function dataPorExtenso(s) {
  const m = s.match(/(\d{1,2})\.?º? de ([a-zç]+) de (\d{4})/i);
  if (!m) return null;
  const mes = MESES.indexOf(m[2].toLowerCase());
  if (mes < 0) return null;
  return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ---------- IBGE ----------

async function coletarIbge() {
  const estados = await json('https://servicodados.ibge.gov.br/api/v1/localidades/estados');
  const ufs = estados.map((e) => ({
    codigo: String(e.id), sigla: e.sigla, nome: e.nome, regiao: e.regiao.nome,
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

  const malha = await json('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?' + new URLSearchParams({
    formato: 'application/vnd.geo+json', qualidade: 'minima', intrarregiao: 'UF',
  }), { headers: { 'User-Agent': UA } });
  const porCodigo = new Map(ufs.map((u) => [u.codigo, u]));
  for (const f of malha.features) {
    const uf = porCodigo.get(String(f.properties.codarea));
    f.properties = { sigla: uf.sigla, nome: uf.nome };
  }
  return { ufs, malha };
}

// ---------- Senado ----------

async function coletarSenadores() {
  const j = await json('https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json');
  return j.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map((p) => {
    const id = p.IdentificacaoParlamentar;
    return {
      id: `senador-${id.CodigoParlamentar}`,
      codigoSenado: Number(id.CodigoParlamentar),
      cargo: 'senador',
      nome: id.NomeParlamentar,
      nomeCompleto: id.NomeCompletoParlamentar,
      uf: id.UfParlamentar,
      partido: normalizarPartido(id.SiglaPartidoParlamentar),
      foto: id.UrlFotoParlamentar?.replace(/^http:/, 'https:') ?? null,
      desde: p.Mandato?.PrimeiraLegislaturaDoMandato?.DataInicio ?? null,
      mandatoAte: (p.Mandato?.SegundaLegislaturaDoMandato ?? p.Mandato?.PrimeiraLegislaturaDoMandato)?.DataFim ?? null,
      titular: p.Mandato?.DescricaoParticipacao ?? null,
      links: { oficial: id.UrlPaginaParlamentar?.replace(/^http:/, 'https:') ?? null },
    };
  });
}

// Alinhamento em votação nominal. A régua é simples e conferível: só entram
// as votações em que a maioria do PT e a maioria do PL ficaram em lados
// opostos, e conta-se de que lado cada senador votou. Não mede ideologia —
// mede com quem a pessoa votou quando os dois polos discordaram.
async function coletarVotos(senadores) {
  const POLO_ESQ = 'PT';
  const POLO_DIR = 'PL';
  const hoje = new Date();
  const inicio = new Date(hoje); inicio.setMonth(inicio.getMonth() - 18);
  const iso = (d) => d.toISOString().slice(0, 10);

  const votacoes = [];
  for (let de = new Date(inicio); de < hoje;) {
    const ate = new Date(de); ate.setDate(ate.getDate() + 59);
    const fim = ate < hoje ? ate : hoje;
    try {
      const lote = await json(`https://legis.senado.leg.br/dadosabertos/votacao?dataInicio=${iso(de)}&dataFim=${iso(fim)}`);
      if (Array.isArray(lote)) votacoes.push(...lote);
    } catch (e) {
      console.warn(`  votações ${iso(de)}..${iso(fim)}: ${e.message}`);
    }
    de = new Date(fim); de.setDate(de.getDate() + 1);
  }

  const maioria = (votos, partido) => {
    let sim = 0, nao = 0;
    for (const v of votos) {
      if (normalizarPartido(v.siglaPartidoParlamentar) !== partido) continue;
      if (v.siglaVotoParlamentar === 'Sim') sim++;
      else if (v.siglaVotoParlamentar === 'Não') nao++;
    }
    if (sim === nao) return null;
    return sim > nao ? 'Sim' : 'Não';
  };

  const placar = new Map(senadores.map((s) => [s.codigoSenado, { comEsquerda: 0, comDireita: 0 }]));
  let divididas = 0;
  for (const vt of votacoes) {
    const votos = vt.votos ?? [];
    const esq = maioria(votos, POLO_ESQ);
    const dir = maioria(votos, POLO_DIR);
    if (!esq || !dir || esq === dir) continue;
    divididas++;
    for (const v of votos) {
      const p = placar.get(Number(v.codigoParlamentar));
      if (!p) continue;
      if (v.siglaVotoParlamentar === esq) p.comEsquerda++;
      else if (v.siglaVotoParlamentar === dir) p.comDireita++;
    }
  }
  for (const s of senadores) {
    const p = placar.get(s.codigoSenado);
    if (p.comEsquerda + p.comDireita > 0) s.votos = p;
  }
  return {
    poloEsquerda: POLO_ESQ, poloDireita: POLO_DIR,
    de: iso(inicio), ate: iso(hoje),
    votacoesNominais: votacoes.filter((v) => (v.votos ?? []).length > 0).length,
    votacoesDivididas: divididas,
  };
}

// ---------- governadores ----------

async function coletarGovernadores(ufs) {
  const pagina = 'Lista de governadores das unidades federativas do Brasil';
  const tabela = limpar(secao(await wikitexto(pagina), 'Atuais governadores'));
  const porNome = new Map(ufs.map((u) => [u.nome, u.sigla]));
  const out = [];

  for (const linha of tabela.split(/\n\|-/)) {
    // A célula da UF é a única com o link "(lista)"; linhas extras de rowspan
    // (mandato-tampão, por exemplo) não têm e são puladas.
    if (!/Lista de governador/.test(linha)) continue;
    const mUf = linha.match(/'''\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*<br/);
    const uf = mUf && porNome.get((mUf[2] ?? mUf[1]).trim());
    // O brasão do estado também vem em negrito, daí o lookahead.
    const mGov = linha.match(/'''\[\[(?!Ficheiro|Arquivo|Imagem|File)([^\]]+)\]\]'''/i);
    if (!uf || !mGov) { console.warn('  governador: linha não reconhecida:', linha.slice(0, 90).replace(/\n/g, ' ')); continue; }

    const [alvo, texto] = mGov[1].split('|').map((s) => s.trim());
    const depois = linha.slice(mGov.index + mGov[0].length);
    const fotos = [...linha.matchAll(/\[\[(?:Ficheiro|Arquivo|Imagem|File):([^|\]]+)/gi)].map((m) => m[1].trim());
    // Célula do partido: "[[Nome por extenso]]<br>SIGLA" ou só "[[...|Nome]]".
    const celPartido = depois.split(/\n\|/).find((c) => link(c)) ?? '';
    const sigla = celPartido.match(/<br\s*\/?>\s*([A-Za-zÀ-ú]{2,})/)?.[1] ?? link(celPartido)?.texto ?? null;

    out.push({
      id: `governador-${uf.toLowerCase()}`,
      cargo: 'governador',
      nome: texto ?? alvo,
      uf,
      partido: normalizarPartido(sigla),
      foto: fotoCommons(fotos[1]),   // fotos[0] é o brasão do estado
      desde: dataPorExtenso(depois),
      interino: /interin/i.test(depois.slice(0, 80)),
      links: { wikipedia: urlWiki(alvo) },
    });
  }
  return out;
}

// ---------- ministros ----------

// Quem ocupa cada pasta vem da página oficial do Planalto. Ela só tem cargo e
// nome; partido, foto e sigla da pasta vêm da tabela da Wikipédia, e SÓ quando
// o titular de lá é a mesma pessoa. A tabela da Wikipédia fica meses sem
// atualizar — em outubro de 2026 ainda listava ministros que tinham saído em
// abril — então nunca é ela quem diz quem é o ministro.
async function tabelaWikiMinistros() {
  const tabela = limpar(secao(await wikitexto('Ministérios do Brasil'), 'Atuais ministérios e pastas'));
  const out = [];
  for (const linha of tabela.split(/\n\|-/)) {
    if (!/^\s*!\s*\d+\s*\n/.test(linha)) continue;
    const celulas = linha.split(/\n\|/).slice(1).map((c) => c.trim());
    const pasta = link(celulas[0] ?? '');
    const iTitular = celulas.findIndex((c, i) => i >= 2 && /^\[\[(?!Ficheiro|Arquivo|Imagem|File)/i.test(c));
    const titular = iTitular >= 0 ? link(celulas[iTitular]) : null;
    if (!pasta || !titular) continue;
    const iFoto = celulas.findIndex((c, i) => i > iTitular && arquivo(c));
    const celPartido = celulas[(iFoto >= 0 ? iFoto : iTitular) + 1] ?? '';
    out.push({
      pasta: pasta.texto,
      siglaPasta: celulas[1] || null,
      nome: titular.texto,
      alvo: titular.alvo,
      partido: normalizarPartido(link(celPartido)?.texto ?? celPartido),
      foto: fotoCommons(iFoto >= 0 ? arquivo(celulas[iFoto]) : null),
    });
  }
  return out;
}

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const tokens = (s) => slug(s).split('-').filter((t) => t && !PARTICULAS.has(t));
// "Wellington Dias" bate com "José Wellington Barroso de Araujo Dias".
function mesmaPessoa(curto, completo) {
  const c = new Set(tokens(completo));
  const t = tokens(curto);
  return t.length >= 2 && t.every((x) => c.has(x));
}

async function coletarMinistros() {
  const url = 'https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  const html = await r.text();
  const corpo = html.slice(html.indexOf('id="parent-fieldname-text"'));
  const texto = (h) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const atualizadoEm = html.match(/Atualizado em<\/span>\s*<span class="value">([^<]+)</)?.[1] ?? null;

  let wiki = [];
  try { wiki = await tabelaWikiMinistros(); } catch (e) { console.warn('  tabela da Wikipédia: ' + e.message); }

  const out = [];
  for (const m of corpo.matchAll(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const titulo = texto(m[1]);
    const nomeCompleto = texto(m[2]);
    if (!titulo || !nomeCompleto) continue;
    const pasta = titulo
      .replace(/^Ministr[oa] de Estado (Chefe )?/i, '')
      .replace(/^d[aeo]s? /i, '')
      .replace(/ da Presidência da República$/i, '');
    const sp = slug(pasta);
    // A pessoa é procurada na tabela inteira, não só na linha da pasta: os
    // nomes das pastas diferem em preposição entre as duas fontes.
    const chave = tokens(pasta).join('-');
    const wPasta = wiki.find((x) => {
      const cx = tokens(x.pasta).join('-');
      return cx === chave || cx.startsWith(chave) || chave.startsWith(cx);
    });
    const w = wiki.find((x) => mesmaPessoa(x.nome, nomeCompleto));
    const igual = Boolean(w);
    out.push({
      id: `ministro-${sp}`,
      cargo: 'ministro',
      nome: igual ? w.nome : nomeCompleto,
      nomeCompleto,
      pasta: pasta[0].toUpperCase() + pasta.slice(1),
      siglaPasta: wPasta?.siglaPasta ?? null,
      // undefined = a fonte não diz; null = sem partido. São coisas diferentes,
      // e o site mostra as duas de jeito diferente.
      partido: igual ? w.partido : undefined,
      foto: igual ? w.foto : null,
      links: { oficial: url, ...(igual ? { wikipedia: urlWiki(w.alvo) } : {}) },
    });
  }
  return { ministros: out, atualizadoEm };
}

// ---------- presidente e vice ----------

async function coletarPresidencia() {
  const manual = await lerJson('data/manual.json');
  const out = [];
  for (const cargo of ['presidente', 'vice']) {
    const m = manual[cargo];
    let foto = null;
    try {
      const j = await json('https://pt.wikipedia.org/w/api.php?' + new URLSearchParams({
        action: 'query', prop: 'pageimages', pithumbsize: '240', titles: m.wiki, format: 'json', redirects: '1',
      }));
      foto = Object.values(j.query.pages)[0]?.thumbnail?.source ?? null;
    } catch (e) { console.warn(`  foto de ${m.nome}: ${e.message}`); }
    out.push({
      id: cargo, cargo, nome: m.apelido ?? m.nome, nomeCompleto: m.nome,
      partido: normalizarPartido(m.partido), foto, desde: m.desde,
      links: { wikipedia: urlWiki(m.wiki) },
    });
  }
  return out;
}

// ---------- Câmara dos Deputados ----------

async function coletarDeputados() {
  const j = await json('https://dadosabertos.camara.leg.br/api/v2/deputados?itens=1000&ordem=ASC&ordenarPor=nome');
  return j.dados.map((d) => ({
    id: `deputado-${d.id}`,
    cargo: 'deputado',
    nome: d.nome,
    uf: d.siglaUf,
    partido: normalizarPartido(d.siglaPartido),
    foto: d.urlFoto ?? null,
    links: { oficial: `https://www.camara.leg.br/deputados/${d.id}` },
  }));
}

// ---------- STF ----------

// Não há API nem página do STF que aceite requisição automática (devolve 403);
// a composição vem da predefinição que a Wikipédia usa no artigo do tribunal.
async function coletarStf() {
  const bruto = await wikitexto('Predefinição:Composição atual do Supremo Tribunal Federal do Brasil');
  const out = [];
  for (const linhaBruta of bruto.split(/\n\|-/)) {
    const linha = limpar(linhaBruta);
    const celulas = linha.split(/\n\|/).slice(1).map((c) => c.trim());
    if (!/^\d+$/.test(celulas[0] ?? '')) continue;
    const semFoto = (celulas[1] ?? '').replace(/\[\[(?:Ficheiro|Arquivo|Imagem|File):[^\]]*\]\]/gi, '');
    const ministro = link(semFoto);
    if (!ministro) continue;   // cadeira vaga
    const cor = linhaBruta.match(/background:\s*(#[0-9a-f]+)/i)?.[1].toLowerCase();
    out.push({
      id: `stf-${slug(ministro.alvo)}`,
      cargo: 'stf',
      nome: ministro.alvo.replace(/\s*\(.*\)$/, ''),
      partido: null,
      foto: fotoCommons(arquivo(celulas[1])),
      indicadoPor: link(celulas[4] ?? '')?.texto ?? null,
      desde: dataPorExtenso(celulas[5] ?? ''),
      funcao: cor === '#fcc' || cor === '#ffcccc' ? 'presidente' : cor === '#ffe0c1' ? 'vice-presidente' : null,
      links: { wikipedia: urlWiki(ministro.alvo) },
    });
  }
  return out;
}

// ---------- principal ----------

console.log('IBGE...');
const { ufs, malha } = await coletarIbge();
console.log('Senado...');
const senadores = await coletarSenadores();
console.log('Votações do Senado...');
const votos = await coletarVotos(senadores);
console.log('Governadores (Wikipédia)...');
const governadores = await coletarGovernadores(ufs);
console.log('Ministros (Wikipédia)...');
// O gov.br devolve 429 pros servidores do GitHub Actions (funciona de casa).
// Sem isto a coleta inteira morria nos ministros e nada mais era atualizado;
// agora os ministros ficam como estavam na última coleta boa e o resto segue.
let ministros, ministrosAtualizadoEm;
try {
  ({ ministros, atualizadoEm: ministrosAtualizadoEm } = await coletarMinistros());
} catch (e) {
  const anterior = await lerJson('public/data/brasil.json').catch(() => null);
  ministros = anterior?.pessoas.filter((p) => p.cargo === 'ministro') ?? [];
  ministrosAtualizadoEm = anterior?.ministrosAtualizadoEm ?? null;
  console.warn(`  Planalto indisponível (${e.message}): mantidos os ${ministros.length} ministros da coleta anterior.`);
}
console.log('Presidência...');
const presidencia = await coletarPresidencia();
console.log('Câmara dos Deputados...');
const deputados = await coletarDeputados();
console.log('STF (Wikipédia)...');
const stf = await coletarStf();

const erros = [];
if (ufs.length !== 27) erros.push(`UFs: ${ufs.length}, esperado 27`);
if (malha.features.length !== 27) erros.push(`malha: ${malha.features.length} polígonos, esperado 27`);
if (governadores.length !== 27) erros.push(`governadores: ${governadores.length}, esperado 27`);
if (senadores.length < 75 || senadores.length > 81) erros.push(`senadores: ${senadores.length}, esperado ~81`);
if (ministros.length < 30) erros.push(`ministros: ${ministros.length}, esperado 30+`);
if (deputados.length < 500 || deputados.length > 513) erros.push(`deputados: ${deputados.length}, esperado ~513`);
if (stf.length < 8 || stf.length > 11) erros.push(`STF: ${stf.length} ministros, esperado até 11`);
if (erros.length) {
  console.error('\nABORTADO — nada foi gravado:\n  ' + erros.join('\n  '));
  process.exit(1);
}

const pessoas = [...presidencia, ...ministros, ...governadores, ...senadores, ...deputados, ...stf];
const semEscala = [...new Set(pessoas.map((p) => p.partido).filter((s) => s && !tabelaPartidos.partidos[s]))];
// Correções à mão (data/manual.json): partido que nenhuma fonte informa.
const manual = await lerJson('data/manual.json');
for (const p of pessoas) {
  const chave = [p.nomeCompleto, p.nome].find((n) => n && n in (manual.partidos ?? {}));
  if (chave) p.partido = normalizarPartido(manual.partidos[chave]);
}
const semPartido = ministros.filter((m) => m.partido === undefined).map((m) => m.nome);
if (semPartido.length) console.warn(`\nMinistros com partido não identificado (${semPartido.length}): ${semPartido.join('; ')}`);
if (semEscala.length) console.warn(`\nPartidos sem posição em data/partidos.json: ${semEscala.join(', ')}`);

await mkdir(SAIDA, { recursive: true });
const gravar = (nome, dados) => writeFile(new URL(nome, SAIDA), JSON.stringify(dados));
await gravar('brasil.json', {
  geradoEm: new Date().toISOString(),
  ufs, pessoas, votos, ministrosAtualizadoEm,
  partidos: tabelaPartidos.partidos,
  fontePartidos: tabelaPartidos._fonte,
});
await gravar('malha.json', malha);

console.log(`\nOK: ${presidencia.length} presidência, ${ministros.length} ministros, ${governadores.length} governadores, ${senadores.length} senadores.`);
console.log(`Votações: ${votos.votacoesNominais} nominais, ${votos.votacoesDivididas} com ${votos.poloEsquerda} e ${votos.poloDireita} em lados opostos.`);
