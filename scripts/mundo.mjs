// Quem governa cada país do mundo.
//
//   npm run mundo
//
// Fonte: Wikidata, que é a única base estruturada e livre que cobre o planeta
// inteiro. Dela saem o chefe de Estado, o chefe de governo, o partido de cada
// um e a posição desse partido no espectro.
//
// MUDANÇA DE RÉGUA, e é importante: no Brasil a posição é um número de 0 a 10
// vindo de um survey com cientistas políticos. Aqui é uma CATEGORIA
// ("centro-esquerda", "direita") editada na Wikidata. São coisas diferentes e
// não devem ser somadas nem comparadas como se fossem a mesma medida.
//
// LIMITE: a Wikidata é editada por voluntários. Em país com troca rápida de
// governo — golpe, renúncia, interino — ela pode estar desatualizada. Por isso
// cada país carrega o link do seu item, pra qualquer um conferir e corrigir.

import { writeFile, readFile } from 'node:fs/promises';
import { BANDAS, consultar, qid, buscarPartidos, faixaDoPartido, faixaDaNota } from './espectro.mjs';

const RAIZ = new URL('..', import.meta.url);
const UA = { 'User-Agent': 'GPL/0.1 (projeto pessoal; dados publicos)', Accept: 'application/sparql-results+json' };

// ---------- posição no espectro, pelo Global Party Survey ----------

// O GPS (Pippa Norris, 2019) é a única base com nota de esquerda-direita
// comparável entre países: survey com especialistas, 1.043 partidos em 163
// países, licença CC0. A escala vai de 0 (esquerda) a 10 (direita), a mesma
// direção do survey brasileiro — mas são estudos diferentes e não se somam.
const GPS = 'https://dataverse.harvard.edu/api/access/datafile/3788852';

const semAspas = (s) => (s ?? '').replace(/^"|"$/g, '').trim();
const chave = (s) => semAspas(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)/g, ' ').replace(/\b(party|partido|the|of|for)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

async function baixarSurvey() {
  const r = await fetch(GPS, { headers: { 'User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const linhas = (await r.text()).split('\n').filter(Boolean);
  const col = linhas[0].split('\t');
  const i = (n) => col.indexOf(n);
  // Por país, pra não casar um partido brasileiro com um nome igual lá fora.
  const porPais = new Map();
  for (const bruto of linhas.slice(1)) {
    const c = bruto.split('\t');
    const v4 = parseFloat(semAspas(c[i('V4_Scale')]));
    if (Number.isNaN(v4)) continue;
    const iso3 = semAspas(c[i('ISO')]);
    if (!porPais.has(iso3)) porPais.set(iso3, []);
    porPais.get(iso3).push({
      nome: semAspas(c[i('Partyname')]),
      sigla: semAspas(c[i('Partyabb')]),
      posicao: Math.round(v4 * 100) / 100,
      social: Math.round(parseFloat(semAspas(c[i('V6_Scale')])) * 100) / 100 || null,
    });
  }
  return porPais;
}

// Nome exato, sigla, e por fim um nome contendo o outro — sempre dentro do
// mesmo país, que é o que impede casamento absurdo entre homônimos.
function acharNoSurvey(cand, nomes, siglas) {
  const alvos = nomes.map(chave).filter(Boolean);
  const sig = siglas.map((s) => chave(s)).filter(Boolean);
  return cand.find((p) => alvos.includes(chave(p.nome)))
    ?? cand.find((p) => sig.length && sig.includes(chave(p.sigla)))
    ?? cand.find((p) => alvos.some((a) => a.length > 6 && (chave(p.nome).includes(a) || a.includes(chave(p.nome)))))
    ?? null;
}

// Um país por linha de cargo. O partido pode vir repetido quando a pessoa
// também pertence a uma legenda supranacional (o Partido Popular Europeu, por
// exemplo); por isso o filtro de país no partido.
console.log('Wikidata: chefes de Estado e de governo...');
const linhas = await consultar(`
SELECT ?iso ?iso3 ?num ?paisLabel ?pais ?cargo ?pessoa ?pessoaLabel ?partido ?partidoLabel ?paisDoPartido ?formaLabel ?desde WHERE {
  ?pais wdt:P31 wd:Q3624078 ; wdt:P297 ?iso ; wdt:P298 ?iso3 ; wdt:P299 ?num .
  FILTER NOT EXISTS { ?pais wdt:P576 ?extinto }
  VALUES (?prop ?cargo) { (p:P35 "estado") (p:P6 "governo") }
  ?pais ?prop ?decl .
  ?decl ?ps ?pessoa .
  FILTER(?ps = ps:P35 || ?ps = ps:P6)
  FILTER NOT EXISTS { ?decl pq:P582 ?saiu }
  OPTIONAL { ?decl pq:P580 ?desde }
  OPTIONAL {
    ?pessoa p:P102 ?fp . ?fp ps:P102 ?partido .
    FILTER NOT EXISTS { ?fp pq:P582 ?fim }
    OPTIONAL { ?partido wdt:P17 ?paisDoPartido }
  }
  OPTIONAL { ?pais wdt:P122 ?forma }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }
}`);

const paises = new Map();
for (const l of linhas) {
  const iso = l.iso.value;
  const p = paises.get(iso) ?? {
    iso, iso3: l.iso3.value, num: Number(l.num.value), nome: l.paisLabel.value,
    wikidata: `https://www.wikidata.org/wiki/${qid(l.pais.value)}`,
  };
  const cargo = l.cargo.value;   // "estado" ou "governo"
  const pessoa = `https://www.wikidata.org/wiki/${qid(l.pessoa.value)}`;
  // A mesma pessoa vem em várias linhas, uma por filiação: Keir Starmer é do
  // Partido Trabalhista E do Partido Cooperativo, e von der Leyen é da CDU E
  // do Partido Popular Europeu. Guardamos TODAS e escolhemos depois, quando já
  // se sabe de qual delas existe posição no espectro — escolher aqui, pelo
  // nome, foi o que um dia pôs o Reino Unido no Partido Cooperativo.
  const atual = p[cargo];
  const c = atual?.wikidata === pessoa ? atual : {
    nome: l.pessoaLabel.value,
    wikidata: pessoa,
    partido: null,
    faixa: null,
    posicaoRotulo: null,
    desde: l.desde?.value.slice(0, 10) ?? null,
    _opcoes: [],
  };
  // Entre duas pessoas no mesmo cargo (dado contraditório na Wikidata), fica
  // a que tem filiação.
  if (!atual || c === atual || !atual._opcoes.length) p[cargo] = c;
  if (l.partido && p[cargo] === c) {
    c._opcoes.push({ qid: qid(l.partido.value), nome: l.partidoLabel.value, doPais: l.paisDoPartido?.value === l.pais.value });
  }
  p.forma = p.forma ?? l.formaLabel?.value ?? null;
  paises.set(iso, p);
}

console.log('Partidos: nome em inglês, alinhamento e ideologia...');
const qids = [...new Set([...paises.values()].flatMap((p) => [...(p.estado?._opcoes ?? []), ...(p.governo?._opcoes ?? [])]).map((o) => o.qid))];
const partidos = await buscarPartidos(qids);

console.log('Global Party Survey...');
let survey = new Map();
try { survey = await baixarSurvey(); } catch (e) { console.warn(`  survey indisponível (${e.message}): fica só a categoria da Wikidata.`); }

for (const p of paises.values()) {
  for (const cargo of ['estado', 'governo']) {
    const c = p[cargo];
    if (!c) continue;
    // Das filiações da pessoa, vale a que é do próprio país e sobre a qual se
    // sabe mais. Sem isso o Partido Cooperativo vencia o Trabalhista.
    const nota = (o) => {
      const x = partidos.get(o.qid);
      return (o.doPais ? 8 : 0) + (x?.alinhamento.size ? 4 : 0) + (x?.ideologia.size ? 2 : 0) + (x?.siglas.size ? 1 : 0);
    };
    const melhor = (c._opcoes ?? []).slice().sort((x, y) => nota(y) - nota(x))[0] ?? null;
    delete c._opcoes;
    c.partido = melhor?.nome ?? null;
    if (!c.partido) continue;
    const a = partidos.get(melhor.qid);

    // Ordem das fontes da faixa, da mais confiável pra menos:
    //
    //   1. alinhamento (P1387) — a Wikidata dizendo onde o partido está. É
    //      editado e corrigido, então acompanha partido que se move.
    //   2. nota do survey — medida de verdade, com especialistas, mas de 2019:
    //      o Partido Trabalhista britânico está lá com 2,13, do tempo do
    //      Corbyn, e hoje a Wikidata o põe em centro-esquerda. Por isso vem
    //      depois do alinhamento, e não antes.
    //   3. ideologia (P1142) — dedução a partir das correntes declaradas.
    //   4. arquivo manual — o resto, com motivo escrito.
    //
    // O painel diz qual delas foi usada em cada país. As duas primeiras valem
    // também pros governos estaduais, e por isso moram em espectro.mjs.
    const pelaWikidata = faixaDoPartido(a);
    if (pelaWikidata?.faixaFonte === 'alinhamento') Object.assign(c, pelaWikidata);

    const achado = acharNoSurvey(survey.get(p.iso3) ?? [], [...(a?.nomes ?? []), c.partido], [...(a?.siglas ?? [])]);
    if (achado) {
      c.posicao = achado.posicao;
      c.social = achado.social;
      c.partidoNoSurvey = achado.nome;
      if (!c.faixa) Object.assign(c, faixaDaNota(achado.posicao));
    }
    if (!c.faixa && pelaWikidata) Object.assign(c, pelaWikidata);
  }
  delete p.iso3;
}

// ---------- o que a Wikidata não resolve ----------

// "Governante sem partido" não é falta de dado: é um fato, e dos mais
// informativos. São 37 países, e por motivos bem diferentes — monarquia onde
// partido é proibido, junta ou governo de transição, parlamento sem partidos,
// governo colegiado de coalizão permanente, e presidente eleito sem filiação
// formal, comum na América Latina. Deixar tudo isso hachurado junto com "a
// Wikidata não preencheu" misturava duas coisas diferentes, então ganha
// categoria própria com cor própria no mapa.
const SEM_PARTIDO = /^(sem partido|independente|no party|nonpartisan)$/i;
for (const p of paises.values()) {
  for (const c of [p.estado, p.governo]) {
    if (!c) continue;
    if (!c.partido || SEM_PARTIDO.test(c.partido)) { c.partido = null; c.semPartido = true; }
  }
  p.semPartido = Boolean((p.governo ?? p.estado) && !p.governo?.partido && !p.estado?.partido);
}

// O arquivo manual faz duas coisas, e as duas precisam de motivo escrito.
//
//   faixa — a posição de um partido que a Wikidata não classifica, OU a de
//     quem governa sem filiação formal mas foi eleito por um partido ou
//     movimento conhecido. Putin não tem filiação desde 2012 e a Rússia ficava
//     sem cor, embora governe com a Rússia Unida; Kast renunciou ao Partido
//     Republicano ao assumir, e o Chile idem. "Sem filiação" não quer dizer
//     "sem lado", e o painel diz que a classificação é deste site.
//   semPartido — POR QUE não há partido. Monarquia absoluta, junta, parlamento
//     apartidário e presidente sem legenda são quatro histórias diferentes
//     pintadas da mesma cor, e sem isso a cor não dizia qual.
const manual = JSON.parse(await readFile(new URL('data/mundo-manual.json', RAIZ), 'utf8'));
const simples = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mesmoPartido = (a, b) => { const [x, y] = [simples(a), simples(b)]; return x === y || x.includes(y) || y.includes(x); };
let doManual = 0, comMotivo = 0;
for (const p of paises.values()) {
  const m = manual[p.iso];
  if (!m) continue;
  if (m.semPartido && p.semPartido) { p.motivoSemPartido = m.semPartido; comMotivo++; }
  if (!m.faixa) continue;
  for (const c of [p.estado, p.governo]) {
    if (!c || c.faixa) continue;
    // Com partido: só vale pro partido que o arquivo nomeia, pra uma troca de
    // governo não herdar em silêncio a classificação do governo anterior. A
    // comparação é frouxa porque a Wikidata devolve ora o nome em português,
    // ora o em inglês, e o arquivo foi escrito com um dos dois.
    if (c.partido && m.partido && !mesmoPartido(c.partido, m.partido)) continue;
    c.faixa = m.faixa;
    c.posicaoRotulo = BANDAS.find((b) => b.chave === m.faixa)?.rotulo ?? m.faixa;
    c.faixaFonte = 'manual';
    c.motivo = m.motivo;
    c.motivoFonte = m.fonte;
    doManual++;
  }
}

const lista = [...paises.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
// Em sistema presidencialista a mesma pessoa acumula os dois cargos.
for (const p of lista) p.acumula = Boolean(p.estado && p.governo && p.estado.nome === p.governo.nome);

if (lista.length < 150) { console.error(`\nABORTADO — só ${lista.length} países, esperado ~195.`); process.exit(1); }

// O mapa-múndi: Natural Earth pelo pacote world-atlas, domínio público. Fica
// em TopoJSON porque é cinco vezes menor que o GeoJSON equivalente; o
// navegador converte na hora de desenhar.
console.log('Mapa-múndi...');
try {
  const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json', { headers: UA, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  await writeFile(new URL('public/data/mundo-malha.json', RAIZ), await r.text());
} catch (e) {
  console.warn(`  mapa indisponível (${e.message}): fica o da coleta anterior.`);
}

await writeFile(new URL('public/data/mundo.json', RAIZ), JSON.stringify({
  geradoEm: new Date().toISOString(),
  fonte: 'Wikidata',
  paises: lista,
}));

const comFaixa = lista.filter((p) => p.governo?.faixa || p.estado?.faixa).length;
const semPartidos = lista.filter((p) => p.semPartido).length;
// Só avisa de quem ficou sem NADA: quem tem faixa já está explicado pelo
// partido que elegeu a pessoa, e não precisa do motivo escrito.
const semMotivo = lista.filter((p) => p.semPartido && !p.motivoSemPartido && !p.governo?.faixa && !p.estado?.faixa);
const comPartido = lista.filter((p) => p.governo?.partido || p.estado?.partido).length;
const comPosicao = lista.filter((p) => p.governo?.posicao != null || p.estado?.posicao != null).length;
console.log(`
OK: ${lista.length} países; ${comPartido} com partido, ${comPosicao} com nota do survey (0 a 10), ${comFaixa} com faixa (${doManual} do arquivo manual), ${semPartidos} governados por quem não tem partido (${comMotivo} com o motivo escrito).`);
if (semMotivo.length) console.log(`Sem motivo escrito em data/mundo-manual.json: ${semMotivo.map((p) => p.iso).join(' ')}`);
const cont = {};
for (const p of lista) { const f = p.governo?.faixa ?? p.estado?.faixa ?? (p.semPartido ? '(sem partido)' : '(sem faixa)'); cont[f] = (cont[f] ?? 0) + 1; }
console.log(Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · '));
