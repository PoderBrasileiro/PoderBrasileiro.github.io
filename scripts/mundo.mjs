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

const RAIZ = new URL('..', import.meta.url);
const UA = { 'User-Agent': 'GPL/0.1 (projeto pessoal; dados publicos)', Accept: 'application/sparql-results+json' };

// As cinco faixas, por índice: 0 esquerda ... 4 direita. É a mesma divisão
// que o site usa no Brasil, e os rótulos saem daqui pro painel.
const BANDAS = [
  { chave: 'esquerda', rotulo: 'Esquerda' },
  { chave: 'centro-esquerda', rotulo: 'Centro-esquerda' },
  { chave: 'centro', rotulo: 'Centro' },
  { chave: 'centro-direita', rotulo: 'Centro-direita' },
  { chave: 'direita', rotulo: 'Direita' },
];

// Identificadores, não rótulos: o texto da Wikidata muda de tradução, o Q não.
//
// P1387, "political alignment": é a própria Wikidata dizendo em que parte do
// espectro o partido está. Quando existe, é o que vale.
const ALINHAMENTO = {
  Q1129409: [0, 'Extrema-esquerda'],
  Q164597: [0, 'Esquerda'],
  Q737014: [1, 'Centro-esquerda'],
  Q6587194: [2, 'Centro'],
  Q844072: [3, 'Centro-direita'],
  Q76074: [4, 'Direita'],
  Q250598: [4, 'Direita libertária'],
  Q23018230: [4, 'Direita alternativa'],
  Q204481: [4, 'Extrema direita'],
  // "Partido pega-tudo" (Q1030814) descreve estratégia, não posição: fica fora.
};

// P1142, "political ideology": o desempate quando não há alinhamento. É o que
// faltava pra pintar os países de partido único — o Partido Comunista da China
// não tem P1387, mas tem comunismo e marxismo-leninismo em P1142.
//
// Fica de fora, de propósito, tudo que é ortogonal ao eixo esquerda-direita:
// autoritarismo, totalitarismo, populismo, estatismo, militarismo,
// nacionalismo étnico, federalismo, euroscepticismo. Um partido pode ser
// autoritário em qualquer parte do espectro, e tratar isso como "direita"
// seria trocar uma medida por outra sem avisar.
const IDEOLOGIA = {
  // esquerda
  Q6186: 0, Q7264: 0, Q211930: 0, Q7272: 0, Q389647: 0, Q189280: 0,
  Q11900614: 0, Q1202972: 0, Q8813: 0, Q590478: 0, Q979616: 0, Q375332: 0,
  Q14475917: 0, Q28319806: 0, Q904148: 0, Q6034: 0, Q1191637: 0,
  // centro-esquerda
  Q121254: 1, Q821102: 1, Q201712: 1, Q494792: 1, Q1080800: 1,
  // centro
  Q6216: 2, Q192125: 2, Q324530: 2,
  // centro-direita
  Q209158: 3, Q729119: 3, Q1043096: 3, Q617609: 3, Q162719: 3, Q660018: 3,
  Q794394: 3, Q7333466: 3, Q7169: 3,
  // direita
  Q1414298: 4, Q852739: 4, Q436860: 4, Q182121: 4, Q853562: 4, Q2019152: 4,
  Q281347: 4, Q1307223: 4, Q189746: 4, Q1140370: 4, Q3757343: 4, Q2366025: 4,
  Q1422634: 4, Q50685643: 4, Q6235: 4,
};

// Os cortes das cinco faixas, os mesmos de src/comum.js: esquerda até 3,
// centro-esquerda até 4,5, centro até 5,5, centro-direita até 7.
const CORTES = [3, 4.5, 5.5, 7, Infinity];

// Vários valores viram um: a média das bandas conhecidas, arredondada. Um
// partido com "social-democracia" e "progressismo" cai em centro-esquerda;
// um com "comunismo" e "marxismo-leninismo", em esquerda.
function bandaMedia(valores, mapa) {
  const notas = valores.map((q) => (Array.isArray(mapa[q]) ? mapa[q][0] : mapa[q])).filter((n) => n != null);
  if (!notas.length) return null;
  return Math.round(notas.reduce((a, b) => a + b, 0) / notas.length);
}

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

async function consultar(query) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({ query, format: 'json' }),
        { headers: UA, signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()).results.bindings;
    } catch (e) {
      if (i >= 2) throw new Error(`Wikidata: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 5000 * (i + 1)));
    }
  }
}

const qid = (uri) => uri.split('/').pop();

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

// Tudo que é do partido — nome em inglês, sigla, alinhamento e ideologia —
// numa consulta própria, por lotes de QID. Juntar isso à consulta principal
// multiplicava as linhas e a resposta vinha truncada.
console.log('Partidos: nome em inglês, alinhamento e ideologia...');
const qids = [...new Set([...paises.values()].flatMap((p) => [...(p.estado?._opcoes ?? []), ...(p.governo?._opcoes ?? [])]).map((o) => o.qid))];
const partidos = new Map();
const doPartido = (k) => {
  if (!partidos.has(k)) partidos.set(k, { nomes: new Set(), siglas: new Set(), alinhamento: new Set(), ideologia: new Set() });
  return partidos.get(k);
};
for (let i = 0; i < qids.length; i += 60) {
  const valores = qids.slice(i, i + 60).map((q) => `wd:${q}`).join(' ');
  const r = await consultar(`SELECT ?partido ?en ?sigla ?alinhamento ?ideologia WHERE {
    VALUES ?partido { ${valores} }
    OPTIONAL { ?partido rdfs:label ?en . FILTER(LANG(?en) = "en") }
    OPTIONAL { ?partido wdt:P1813 ?sigla }
    OPTIONAL { ?partido wdt:P1387 ?alinhamento }
    OPTIONAL { ?partido wdt:P1142 ?ideologia } }`).catch(() => []);
  for (const l of r) {
    const a = doPartido(qid(l.partido.value));
    if (l.en) a.nomes.add(l.en.value);
    if (l.sigla) a.siglas.add(l.sigla.value);
    if (l.alinhamento) a.alinhamento.add(qid(l.alinhamento.value));
    if (l.ideologia) a.ideologia.add(qid(l.ideologia.value));
  }
}

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
    const a = partidos.get(melhor.qid) ?? doPartido('vazio');

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
    // O painel diz qual delas foi usada em cada país.
    const alvos = [...a.alinhamento];
    const porAlinhamento = bandaMedia(alvos, ALINHAMENTO);
    if (porAlinhamento != null) {
      c.faixa = BANDAS[porAlinhamento].chave;
      // Com um valor só, vale o rótulo específico ("Extrema-esquerda"); com
      // vários, a média já não é nenhum deles, e fica o nome da faixa.
      const unico = alvos.filter((q) => ALINHAMENTO[q]);
      c.posicaoRotulo = unico.length === 1 ? ALINHAMENTO[unico[0]][1] : BANDAS[porAlinhamento].rotulo;
      c.faixaFonte = 'alinhamento';
    }
    const porIdeologia = bandaMedia([...a.ideologia], IDEOLOGIA);

    const achado = acharNoSurvey(survey.get(p.iso3) ?? [], [...a.nomes, c.partido], [...a.siglas]);
    if (achado) {
      c.posicao = achado.posicao;
      c.social = achado.social;
      c.partidoNoSurvey = achado.nome;
      if (!c.faixa) {
        const b = CORTES.findIndex((corte) => achado.posicao < corte);
        c.faixa = BANDAS[b].chave;
        c.posicaoRotulo = BANDAS[b].rotulo;
        c.faixaFonte = 'survey';
      }
    }
    if (!c.faixa && porIdeologia != null) {
      c.faixa = BANDAS[porIdeologia].chave;
      c.posicaoRotulo = BANDAS[porIdeologia].rotulo;
      c.faixaFonte = 'ideologia';
    }
  }
  delete p.iso3;
}

// ---------- o que a Wikidata não resolve ----------

// Um punhado de partidos no poder não tem nem alinhamento nem ideologia lá, e
// alguns deles governam país grande. data/mundo-manual.json preenche esses à
// mão, com motivo e fonte; o site mostra como classificação própria, separada.
const manual = JSON.parse(await readFile(new URL('data/mundo-manual.json', RAIZ), 'utf8'));
let doManual = 0;
for (const p of paises.values()) {
  const m = manual[p.iso];
  if (!m?.faixa) continue;
  for (const c of [p.estado, p.governo]) {
    if (!c?.partido || c.faixa) continue;
    c.faixa = m.faixa;
    c.posicaoRotulo = BANDAS.find((b) => b.chave === m.faixa)?.rotulo ?? m.faixa;
    c.faixaFonte = 'manual';
    c.motivo = m.motivo;
    c.motivoFonte = m.fonte;
    doManual++;
  }
}

// "Governante sem partido" não é falta de dado: é um fato, e dos mais
// informativos. São 37 países, e por três motivos bem diferentes — monarquia
// absoluta onde partido é proibido (Arábia Saudita, Catar), junta ou governo
// de transição (Mali, Haiti), e presidente eleito sem filiação formal por um
// movimento ou coligação, comum na América Latina (Chile, Colômbia, Bolívia).
// Nos três casos não existe posição de partido pra mostrar, e deixar isso
// hachurado junto com "a Wikidata não preencheu" misturava duas coisas
// diferentes. Ganha categoria própria, com cor própria no mapa.
const SEM_PARTIDO = /^(sem partido|independente|no party|nonpartisan)$/i;
for (const p of paises.values()) {
  for (const c of [p.estado, p.governo]) {
    if (!c) continue;
    if (!c.partido || SEM_PARTIDO.test(c.partido)) { c.partido = null; c.semPartido = true; }
  }
  p.semPartido = Boolean((p.governo ?? p.estado) && !p.governo?.partido && !p.estado?.partido);
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
const comPartido = lista.filter((p) => p.governo?.partido || p.estado?.partido).length;
const comPosicao = lista.filter((p) => p.governo?.posicao != null || p.estado?.posicao != null).length;
console.log(`
OK: ${lista.length} países; ${comPartido} com partido, ${comPosicao} com nota do survey (0 a 10), ${comFaixa} com faixa (${doManual} do arquivo manual), ${semPartidos} sem partidos.`);
const cont = {};
for (const p of lista) { const f = (p.governo?.faixa ?? p.estado?.faixa) ?? '(sem)'; cont[f] = (cont[f] ?? 0) + 1; }
console.log(Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · '));
