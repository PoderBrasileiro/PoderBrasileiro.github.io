// Posta no X as novidades: votação nominal de PEC e resultado de 2º turno.
//
//   npm run postar             posta o que for novo (precisa das 4 chaves)
//   npm run postar -- --semear marca tudo que existe hoje como já postado
//
// Sem as chaves no ambiente o script só mostra o que postaria (ensaio).
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// No GitHub elas ficam em Settings → Secrets and variables → Actions.
//
// O que já foi postado fica em data/postados.json, que o workflow commita.
// Um post só entra nessa lista depois que o X confirma — se a postagem
// falhar, a próxima rodada tenta de novo em vez de perder a notícia.
//
// MAX_POR_RODADA existe porque uma lista de "já postados" perdida ou zerada
// faria o script despejar dezenas de posts antigos de uma vez.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
import { ETAPAS, etapaDe } from '../src/etapas.js';
import * as bluesky from './bluesky.mjs';
import { paginaDoCartao, paginaDaPauta } from './pauta.mjs';

const RAIZ = new URL('..', import.meta.url);
const ESTADO = 'data/postados.json';
const SITE = (process.env.SITE_URL ?? 'https://poderbrasileiro.github.io/').replace(/\/?$/, '/');
const MAX_POR_RODADA = 6;
const LIMITE = 280;
const TAMANHO_LINK = 23;   // o X conta qualquer link como 23 caracteres

const ler = async (caminho, padrao) => {
  try { return JSON.parse(await readFile(new URL(caminho, RAIZ), 'utf8')); } catch { return padrao; }
};
// O X conta qualquer link como 23 caracteres, não pelo tamanho real dele.
const contarComoNoX = (texto) => [...texto.replace(/https?:\/\/\S+/g, 'x'.repeat(TAMANHO_LINK))].length;
const dataBr = (iso) => iso.slice(0, 10).split('-').reverse().join('/');
const comPartido = (c) => `${c.nome} (${c.partido ?? 'sem partido'})`;

// Monta o texto cortando o trecho livre pra caber, sem estourar o limite.
function montar(fixo, livre, link, tags = []) {
  const marcas = tags.filter(Boolean).slice(0, MAX_TAGS).join(' ');
  const sobra = LIMITE - fixo.length - TAMANHO_LINK - marcas.length - 6;
  const trecho = livre && sobra > 20 ? (livre.length > sobra ? `${livre.slice(0, sobra - 1).trimEnd()}…` : livre) : '';
  return [fixo, trecho, [link, marcas].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
}

// Marcadores. Três é o teto de propósito: mais que isso o X trata como spam e
// entrega menos. Vão sempre no fim, depois do link, e nunca no meio da frase —
// hashtag no meio do texto atrapalha quem usa leitor de tela.
const MAX_TAGS = 3;
const TAG_CASA = { Senado: '#Senado', 'Câmara': '#Câmara' };
const TAG_GRUPO = {
  senador: ['#Senado', '#Congresso'],
  deputado: ['#Câmara', '#Congresso'],
  ministro: ['#Governo', '#Esplanada'],
  governador: ['#Governadores', '#Brasil'],
  prefeito: ['#Prefeitos', '#Municípios'],
};
// "#MinasGerais" alcança gente; "#MG" é ambíguo demais pra servir de marcador.
const tagDoEstado = (uf) => {
  const nome = brasil?.ufs.find((u) => u.sigla === uf)?.nome;
  return nome ? `#${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '')}` : null;
};

// ---------- o que há pra postar ----------

// Troca de gente nos cargos de cima, comparando os dois últimos registros do
// histórico. Prefeito fica de fora de propósito: são 5.569, e uma renúncia em
// cidade pequena não é assunto de um perfil sobre a rede de poder do país.
function trocasDeCargo(historico) {
  const [antes, agora] = (historico?.dias ?? []).slice(-2);
  if (!antes?.cargos || !agora?.cargos || antes.data === agora.data) return [];
  const itens = [];
  const comparar = (mapaAntes, mapaAgora, rotulo) => {
    for (const [chave, novo] of Object.entries(mapaAgora ?? {})) {
      const velho = mapaAntes?.[chave];
      if (!velho || velho.id === novo.id) continue;
      const cargo = typeof rotulo === 'function' ? rotulo(chave) : rotulo;
      itens.push({
        id: `troca:${chave}:${novo.id}`, data: agora.data,
        texto: montar(`${cargo}: ${novo.nome}${novo.partido ? ` (${novo.partido})` : ''} no lugar de ${velho.nome}${velho.partido ? ` (${velho.partido})` : ''}.`,
          '', `${SITE}#p=${encodeURIComponent(novo.id)}`,
          chave.length === 2 ? [tagDoEstado(chave), '#Governadores'] : ['#Governo', '#Esplanada']),
      });
    }
  };
  comparar({ p: antes.cargos.presidente }, { p: agora.cargos.presidente }, 'Presidência da República');
  comparar({ v: antes.cargos.vice }, { v: agora.cargos.vice }, 'Vice-presidência');
  comparar(antes.cargos.ministros, agora.cargos.ministros, (pasta) => `Ministério — ${pasta}`);
  comparar(antes.cargos.governadores, agora.cargos.governadores, (uf) => `Governo de ${uf}`);
  return itens;
}

function novidades(pecs, eleicao, historico, estado) {
  const itens = [...trocasDeCargo(historico)];

  for (const pec of pecs?.pecs ?? []) {
    // A PEC andou de etapa: é o que diz se ela está perto de virar emenda.
    const etapa = etapaDe(pec);
    const antes = estado.etapas[pec.id];
    estado.etapas[pec.id] = etapa;
    if (antes && antes !== etapa && ETAPAS[etapa].ordem > ETAPAS[antes].ordem) {
      itens.push({
        id: `etapa:${pec.id}:${etapa}`, data: pec.estagio.data ?? new Date().toISOString().slice(0, 10),
        texto: montar(`${pec.titulo} avançou: ${ETAPAS[etapa].rotulo.toLowerCase()}.`,
          pec.ementa, `${SITE}#pec=${encodeURIComponent(pec.id)}`,
          ['#PEC', TAG_CASA[pec.casa], '#Congresso']),
      });
    }

    for (const v of pec.votacoes) {
      const id = `pec:${pec.id}:${v.data}:${v.descricao.length}`;
      const resultado = v.resultado ? v.resultado.toUpperCase() : 'VOTADA';
      itens.push({
        id, data: v.data,
        texto: montar(
          `${pec.titulo} — ${resultado} no plenário ${pec.casa === 'Senado' ? 'do Senado' : 'da Câmara'} em ${dataBr(v.data)}.\nSim ${v.placar.Sim ?? 0} · Não ${v.placar['Não'] ?? 0}`,
          pec.ementa, `Veja como cada parlamentar votou: ${SITE}#pecs`,
          ['#PEC', TAG_CASA[pec.casa], '#Congresso']),
      });
    }
  }

  // 2º turno: só vira post quando a disputa que estava pendente tem eleito.
  if (eleicao) {
    const disputas = [['presidente', 'Presidência da República', eleicao.presidente],
      ...Object.entries(eleicao.porUf).map(([uf, u]) => [`governador:${uf}`, `Governo de ${uf}`, u.governador])];
    for (const [chave, rotulo, d] of disputas) {
      const id = `2turno:${chave}`;
      if (d.status === 'segundo-turno') { estado.pendentes[id] = true; continue; }
      if (!estado.pendentes[id]) continue;   // decidida no 1º turno: não é novidade
      const e = d.eleito;
      itens.push({
        id, data: eleicao.geradoEm.slice(0, 10), resolve: id,
        texto: montar(`2º turno — ${rotulo}: eleito(a) ${comPartido(e)}${e.pct ? `, com ${e.pct}% dos votos válidos` : ''}.`,
          e.vice ? `Vice: ${e.vice.nome}.` : '', `Quem fica e quem sai em 2027: ${SITE}#rede`,
        ['#Eleições2026', '#SegundoTurno', chave.startsWith('governador:') ? tagDoEstado(chave.slice(11)) : null]),
      });
    }
  }
  return itens.filter((i) => !estado.postados.includes(i.id)).sort((a, b) => a.data.localeCompare(b.data));
}

// ---------- X (OAuth 1.0a) ----------

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// Assina e chama a API. Sem `corpo` é um GET (usado só pra conferir as chaves).
async function chamarX(url, chaves, corpo = null, tipo = 'application/json') {
  const oauth = {
    oauth_consumer_key: chaves.key, oauth_token: chaves.token,
    oauth_nonce: randomBytes(16).toString('hex'), oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_signature_method: 'HMAC-SHA1', oauth_version: '1.0',
  };
  // Corpo JSON não entra na assinatura; só os parâmetros oauth.
  const metodo = corpo ? 'POST' : 'GET';
  const base = [metodo, pct(url), pct(Object.keys(oauth).sort().map((k) => `${pct(k)}=${pct(oauth[k])}`).join('&'))].join('&');
  oauth.oauth_signature = createHmac('sha1', `${pct(chaves.secret)}&${pct(chaves.tokenSecret)}`).update(base).digest('base64');
  const r = await fetch(url, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': tipo } : {}), Authorization: `OAuth ${Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(', ')}` },
    ...(corpo ? { body: Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo) } : {}),
  });
  if (!r.ok) throw new Error(`X respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).data;
}

// Sobe uma imagem e devolve o media_id. O endpoint de mídia é o v1.1 (o v2
// não cobre isso) e o corpo multipart não entra na assinatura, como o JSON.
async function subirImagem(png, chaves, descricao) {
  const limite = '----poderbr' + Math.random().toString(36).slice(2);
  const cabeca = Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="media"; filename="card.png"\r\nContent-Type: image/png\r\n\r\n`);
  const corpo = Buffer.concat([cabeca, png, Buffer.from(`\r\n--${limite}--\r\n`)]);
  const r = await chamarX('https://upload.twitter.com/1.1/media/upload.json', chaves, corpo, `multipart/form-data; boundary=${limite}`);
  const id = r?.media_id_string;
  // Texto alternativo: sem ele a imagem não diz nada a quem usa leitor de tela.
  if (id && descricao) {
    await chamarX('https://upload.twitter.com/1.1/media/metadata/create.json', chaves,
      { media_id: id, alt_text: { text: descricao.slice(0, 1000) } }).catch((e) => console.warn(`  alt_text: ${e.message}`));
  }
  return id;
}

async function postarNoX(texto, chaves, imagem = null) {
  const media = imagem ? await subirImagem(imagem.png, chaves, imagem.alt) : null;
  const corpo = { text: texto, ...(media ? { media: { media_ids: [media] } } : {}) };
  return (await chamarX('https://api.x.com/2/tweets', chaves, corpo))?.id;
}

// ---------- principal ----------

const estado = { postados: [], pendentes: {}, etapas: {}, composicao: {}, feitos: {}, ...(await ler(ESTADO, {})) };
// Os 43 itens antigos valem pros três canais: são votações de 2025 que não
// devem reaparecer em lugar nenhum.
for (const canal of ['x', 'bsky', 'relatorio']) estado.feitos[canal] ??= [...estado.postados];
const brasil = await ler('public/data/brasil.json', null);
const pecs = await ler('public/data/pecs.json', null);
const eleicao = await ler('public/data/eleicao2026.json', null);
const historico = await ler('public/data/historico.json', null);
const fila = novidades(pecs, eleicao, historico, estado);
const gravar = () => writeFile(new URL(ESTADO, RAIZ), JSON.stringify(estado, null, 1) + '\n');

if (process.argv.includes('--semear')) {
  const ids = fila.filter((i) => !i.resolve).map((i) => i.id);
  estado.postados.push(...ids);
  for (const canal of ['x', 'bsky', 'relatorio']) estado.feitos[canal].push(...ids);
  await gravar();
  console.log(`Semeado: ${estado.postados.length} itens marcados como já postados; ${Object.keys(estado.pendentes).length} disputas de 2º turno acompanhadas.`);
  process.exit(0);
}

const chaves = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const ensaio = !Object.values(chaves).every(Boolean);
if (ensaio) console.log('Chaves do X ausentes: ENSAIO, nada será postado.\n');

// Confere as chaves sem postar nada.
if (process.argv.includes('--verificar')) {
  if (ensaio) { console.error('Faltam chaves: ' + Object.keys(chaves).filter((k) => !chaves[k]).join(', ')); process.exit(1); }
  const eu = await chamarX('https://api.x.com/2/users/me', chaves);
  console.log(`Chaves OK — conta @${eu.username} (${eu.name}).`);
  process.exit(0);
}

// Cartão da composição de uma casa, com a imagem do plenário.
async function cartao(cargo) {
  const { cartaoComposicao } = await import('./imagens.mjs');
  const { png, balanco: b, titulo } = cartaoComposicao(cargo);
  return {
    png,
    alt: `Gráfico do ${titulo}: ${b.gente.length} cadeiras em semicírculo, uma por parlamentar, coloridas da esquerda (vermelho) para a direita (azul) conforme a posição do partido. ${b.esq}% de esquerda e ${b.dir}% de direita entre os ${b.conhecidos} com partido conhecido.`,
    balanco: b, titulo,
  };
}

// Post de estreia, uma vez só.
if (process.argv.includes('--apresentacao')) {
  const img = await cartao('senador');
  const texto = montar('Este perfil publica, de forma automática, o que o Congresso vota e o que a eleição muda no poder — a partir de dados públicos da Câmara, do Senado e do TSE.',
    'Mapa dos 5.569 municípios, os três poderes e a transição para 2027:', SITE);
  console.log(texto + '\n');
  if (ensaio) process.exit(0);
  console.log(`postado: https://x.com/i/status/${await postarNoX(texto, chaves, img)}`);
  process.exit(0);
}

// Composição de uma casa hoje, com o gráfico do plenário.
if (process.argv.some((a) => a.startsWith('--composicao'))) {
  const cargo = process.argv.includes('--composicao-camara') ? 'deputado' : 'senador';
  const img = await cartao(cargo);
  const b = img.balanco;
  const texto = montar(`${img.titulo} hoje: ${b.dir}% de direita e ${b.esq}% de esquerda${b.centro ? `, ${b.centro}% no centro` : ''}.`,
    `Contagem de cabeças pela posição do partido de cada um dos ${b.gente.length}, segundo classificação de cientistas políticos. Quem é quem, cadeira por cadeira:`,
    `${SITE}#rede`, TAG_GRUPO[cargo]);
  console.log(texto + '\n');
  if (ensaio) process.exit(0);
  console.log(`postado: https://x.com/i/status/${await postarNoX(texto, chaves, img)}`);
  process.exit(0);
}
// ---------- a pauta do dia ----------

// Dia parado: entra um retrato de um dos grupos, em rodízio. É o que mantém o
// perfil vivo fora de sessão legislativa sem inventar notícia — o conteúdo é o
// mesmo dado do site, e o rodízio evita repetir o grupo.
const repetir = process.argv.includes('--repetir');
const RODIZIO = ['senador', 'deputado', 'governador', 'ministro', 'prefeito'];
const DIAS_ENTRE_RETRATOS = 2;
const hoje = new Date().toISOString().slice(0, 10);

async function retratoDoDia() {
  const ultimo = estado.composicao.quando;
  const faz = ultimo ? (Date.parse(hoje) - Date.parse(ultimo)) / 864e5 : 99;
  if (faz < DIAS_ENTRE_RETRATOS && !repetir) { console.log(`Retrato: o último foi há ${faz} dia(s); espera ${DIAS_ENTRE_RETRATOS}.`); return null; }
  const cargo = RODIZIO[(RODIZIO.indexOf(estado.composicao.cargo) + 1) % RODIZIO.length];
  const { cartaoDoGrupo } = await import('./imagens.mjs');
  const { png, balanco: b, titulo } = cartaoDoGrupo(cargo);
  return {
    id: `retrato:${cargo}:${hoje}`, data: hoje, cargo,
    texto: montar(`${titulo} hoje: ${b.dir}% de direita e ${b.esq}% de esquerda.`,
      `Contagem de cabeças pela posição do partido, entre os ${b.conhecidos.toLocaleString('pt-BR')} com partido conhecido.`, `${SITE}#rede`,
      TAG_GRUPO[cargo]),
    imagem: {
      png, arquivo: `${cargo}.png`, destino: '#rede',
      titulo: `${titulo} hoje`,
      descricao: `${b.dir}% de direita e ${b.esq}% de esquerda, entre os ${b.conhecidos.toLocaleString('pt-BR')} com partido conhecido.`,
      alt: `Gráfico — ${titulo}: ${b.gente.length} pessoas ordenadas da esquerda (vermelho) para a direita (azul) pela posição do partido. ${b.esq}% de esquerda e ${b.dir}% de direita.`,
    },
  };
}

// Os quatro posts de estreia, feitos uma vez só. Entram na pauta como
// qualquer outro item, pra sair pelo mesmo caminho.
async function postsDeEstreia() {
  const { cartaoFuturo, cartaoContagem, cartaoSite } = await import('./imagens.mjs');
  const itens = [];

  // 1. O fixado: o que é o site.
  const capa = cartaoSite();
  itens.push({
    id: 'estreia:fixado', data: hoje, fixar: true,
    texto: montar('Quem ocupa o poder no Brasil, num quadro só: presidente, ministros, STF, governadores, senadores, deputados e os prefeitos das 5.569 cidades.',
      'Dados públicos, atualizados todo dia. Sem vínculo com governo ou partido.',
      SITE, ['#Brasil', '#Congresso']),
    imagem: {
      png: capa, arquivo: 'poderbr.png', destino: '',
      titulo: 'Quem ocupa o poder no Brasil',
      descricao: 'Presidente, ministros, STF, governadores, senadores, deputados e os prefeitos das 5.569 cidades, num quadro só.',
      alt: 'Cartão do PoderBR: o título “Quem ocupa o poder no Brasil” sobre o semicírculo do Senado, com 81 cadeiras da esquerda (vermelho) para a direita (azul).',
    },
  });

  // 2 e 3. Como cada casa fica depois da posse.
  for (const cargo of ['senador', 'deputado']) {
    const f = cartaoFuturo(cargo);
    const delta = f.balanco.dir - f.hoje.dir;
    const mudou = delta === 0
      ? 'Praticamente o mesmo de hoje.'
      : `${delta > 0 ? 'Mais' : 'Menos'} à direita que hoje, que está em ${f.hoje.dir}%.`;
    itens.push({
      id: `estreia:2027-${cargo}`, data: hoje,
      texto: montar(`${f.titulo}: ${f.balanco.dir}% de direita e ${f.balanco.esq}% de esquerda a partir de fevereiro de 2027.`,
        `${mudou} ${cargo === 'senador' ? 'São 54 eleitos em 2026 mais 27 com mandato até 2031.' : 'Os 513 trocam de uma vez.'} Cadeira por cadeira:`,
        `${SITE}#rede`, cargo === 'senador' ? ['#Senado', '#Eleições2026'] : ['#Câmara', '#Eleições2026']),
      imagem: {
        png: f.png, arquivo: `2027-${cargo}.png`, destino: '#rede',
        titulo: f.titulo,
        descricao: `${f.balanco.dir}% de direita e ${f.balanco.esq}% de esquerda a partir de fevereiro de 2027. Hoje: ${f.hoje.dir}% e ${f.hoje.esq}%.`,
        alt: `Gráfico — ${f.titulo}: ${f.balanco.gente.length} cadeiras em semicírculo, da esquerda (vermelho) para a direita (azul) pela posição do partido. ${f.balanco.esq}% de esquerda e ${f.balanco.dir}% de direita.`,
      },
    });
  }

  // 4. Quanto falta pro 2º turno.
  const c = cartaoContagem();
  if (c) {
    itens.push({
      id: `estreia:contagem-${hoje}`, data: hoje,
      texto: montar(`Faltam ${c.dias} dias para o 2º turno, em ${c.quando}.`,
        `${c.candidatos.map((x) => `${x.nome} (${x.partido}) ${x.pct}%`).join(' e ')} no 1º turno. No site dá pra ver quem fica e quem sai do poder em 2027, estado por estado:`,
        `${SITE}#rede`, ['#Eleições2026', '#SegundoTurno']),
      imagem: {
        png: c.png, arquivo: 'contagem.png', destino: '#rede',
        titulo: `Faltam ${c.dias} dias para o 2º turno`,
        descricao: `${c.quando}, urnas das 8h às 17h. ${c.candidatos.map((x) => `${x.nome} (${x.partido}) ${x.pct}%`).join(' e ')} no 1º turno.`,
        alt: `Cartão: faltam ${c.dias} dias para o 2º turno, em ${c.quando}. ${c.candidatos.map((x) => `${x.nome} do ${x.partido} teve ${x.pct}%`).join(' e ')} no 1º turno.`,
      },
    });
  }
  return itens;
}

const pauta = fila.slice(0, MAX_POR_RODADA);
if (process.argv.includes('--estreia')) {
  pauta.length = 0;
  pauta.push(...await postsDeEstreia());
} else if (!pauta.length) {
  console.log('Sem novidade hoje.');
  const r = await retratoDoDia().catch((e) => { console.error(`retrato falhou: ${e.message}`); return null; });
  if (r) pauta.push(r);
} else if (fila.length > MAX_POR_RODADA) {
  console.warn(`${fila.length} itens na fila; só os ${MAX_POR_RODADA} mais antigos vão nesta rodada.`);
}

const novos = (canal) => (repetir ? pauta : pauta.filter((p) => !(estado.feitos[canal] ?? []).includes(p.id)));
const marcar = (canal, item) => {
  (estado.feitos[canal] ??= []).push(item.id);
  if (item.resolve) delete estado.pendentes[item.resolve];
  if (item.cargo) estado.composicao = { cargo: item.cargo, quando: hoje };
};

// ---------- relatório pra postar à mão ----------

// Junta o texto e as imagens do dia num arquivo só, pra copiar e colar. É o
// caminho de quem não paga a API: daqui não sai nada publicado.
if (process.argv.includes('--relatorio')) {
  const itens = novos('relatorio');
  await mkdir(new URL('relatorios/', RAIZ), { recursive: true });
  await mkdir(new URL('public/cartoes/', RAIZ), { recursive: true });

  const TIPOS = { retrato: 'Retrato do dia', pec: 'Votação de PEC', etapa: 'PEC avançou', troca: 'Troca de cargo', '2turno': 'Resultado do 2º turno', estreia: 'Estreia' };
  const paraPagina = [];
  const linhas = [`# Pauta de ${dataBr(hoje)}`, '', `Mais fácil pela página: ${SITE}pauta/`, ''];
  if (!itens.length) linhas.push('Nada para postar hoje.', '', `Último retrato: ${estado.composicao.quando ?? '—'}.`);

  for (const [n, item] of itens.entries()) {
    const tipo = TIPOS[item.id.split(':')[0]] ?? item.id.split(':')[0];
    // O link do post vira o da página do cartão: a imagem entra pela prévia,
    // sem ninguém precisar baixar e anexar nada.
    if (item.imagem) {
      await writeFile(new URL(`public/cartoes/${item.imagem.arquivo}`, RAIZ), item.imagem.png);
      const slug = item.imagem.arquivo.replace(/\.png$/, '');
      const url = await paginaDoCartao({
        slug,
        titulo: item.imagem.titulo ?? tipo,
        descricao: item.imagem.descricao ?? item.texto.split('\n')[0],
        imagem: item.imagem.arquivo,
        alt: item.imagem.alt,
        destino: item.imagem.destino,
      }, SITE);
      item.texto = item.texto.replace(/https?:\/\/\S+/, url);
      item.previa = item.imagem.arquivo;
    }
    linhas.push(`## ${n + 1}. ${tipo}${item.fixar ? ' — fixe este no perfil' : ''}`, '',
      `${contarComoNoX(item.texto)} de 280 caracteres (o X conta todo link como 23)`, '',
      '~~~', item.texto, '~~~', '');
    if (item.previa) linhas.push('A imagem entra sozinha pela prévia do link; não precisa anexar.', '');
    paraPagina.push({ tipo, texto: item.texto, fixar: item.fixar, previa: item.previa, alt: item.imagem?.alt });
    marcar('relatorio', item);
  }

  linhas.push('---', '', 'Refeita sozinha todo dia. O que já apareceu aqui não volta em pautas futuras.');
  const texto = linhas.join('\n').replaceAll('~~~', '```') + '\n';
  await writeFile(new URL(`relatorios/${hoje}.md`, RAIZ), texto);
  await writeFile(new URL('PAUTA.md', RAIZ), texto);
  const endereco = await paginaDaPauta(paraPagina, { site: SITE, data: dataBr(hoje), proximoRetrato: estado.composicao.quando ?? '—' });
  await gravar();
  console.log(texto);
  console.log(`Pauta em ${endereco} (e em relatorios/${hoje}.md)`);
  process.exit(0);
}

// ---------- publicação automática ----------

let falhas = 0;

// Bluesky: API aberta e de graça, então é o canal padrão.
if (bluesky.temChaves()) {
  try {
    const sessao = await bluesky.entrar();
    for (const item of novos('bsky')) {
      console.log(`--- ${item.id}\n${item.texto}\n`);
      const url = await bluesky.postar(item.texto, sessao, item.imagem ?? null);
      marcar('bsky', item);
      console.log(`Bluesky: ${url}\n`);
    }
  } catch (e) { falhas++; console.error(`Bluesky falhou: ${e.message}\n`); }
} else {
  console.log('Sem BSKY_USUARIO/BSKY_SENHA: Bluesky fora.');
}

// X: só sai se a conta de API tiver crédito; sem chaves, fica em ensaio.
if (!ensaio) {
  for (const item of novos('x')) {
    try {
      const id = await postarNoX(item.texto, chaves, item.imagem ?? null);
      marcar('x', item);
      console.log(`X: https://x.com/i/status/${id}\n`);
    } catch (e) {
      falhas++;
      console.error(`X falhou: ${e.message}\n`);
      break;   // crédito ou chave: não adianta insistir nos próximos
    }
  }
} else {
  for (const item of pauta) console.log(`--- ${item.id}\n${item.texto}\n`);
}

await gravar();
if (falhas) process.exit(1);
