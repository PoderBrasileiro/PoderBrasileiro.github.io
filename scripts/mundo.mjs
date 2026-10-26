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

import { writeFile } from 'node:fs/promises';

const RAIZ = new URL('..', import.meta.url);
const UA = { 'User-Agent': 'GPL/0.1 (projeto pessoal; dados publicos)', Accept: 'application/sparql-results+json' };

// Identificadores, não rótulos: o texto da Wikidata muda de tradução, o Q não.
const FAIXA = {
  Q1129409: { faixa: 'esquerda', rotulo: 'Extrema-esquerda' },
  Q164597: { faixa: 'esquerda', rotulo: 'Esquerda' },
  Q737014: { faixa: 'centro-esquerda', rotulo: 'Centro-esquerda' },
  Q6587194: { faixa: 'centro', rotulo: 'Centro' },
  Q844072: { faixa: 'centro-direita', rotulo: 'Centro-direita' },
  Q76074: { faixa: 'direita', rotulo: 'Direita' },
  Q250598: { faixa: 'direita', rotulo: 'Direita libertária' },
  Q23018230: { faixa: 'direita', rotulo: 'Direita alternativa' },
  Q204481: { faixa: 'direita', rotulo: 'Extrema direita' },
  // "Partido pega-tudo" descreve estratégia, não posição: fica de fora.
};

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
SELECT ?iso ?iso3 ?num ?paisLabel ?pais ?cargo ?pessoa ?pessoaLabel ?partido ?partidoLabel ?paisDoPartido ?espectro ?formaLabel ?desde WHERE {
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
    OPTIONAL { ?partido wdt:P1387 ?espectro }
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
  const espectro = l.espectro ? FAIXA[qid(l.espectro.value)] : null;
  const atual = p[cargo];
  const novo = {
    nome: l.pessoaLabel.value,
    wikidata: `https://www.wikidata.org/wiki/${qid(l.pessoa.value)}`,
    partido: l.partidoLabel?.value ?? null,
    faixa: espectro?.faixa ?? null,
    posicaoRotulo: espectro?.rotulo ?? null,
    desde: l.desde?.value.slice(0, 10) ?? null,
    _qid: l.partido ? qid(l.partido.value) : null,
  };
  novo.doPais = l.paisDoPartido?.value === l.pais.value;
  p.forma = p.forma ?? l.formaLabel?.value ?? null;
  // Entre duas linhas da mesma pessoa, fica a que tem mais informação. O
  // partido do próprio país vence a legenda supranacional (o Partido Popular
  // Europeu, por exemplo, aparece junto do partido nacional).
  const peso = (x) => (x ? (x.doPais ? 4 : 0) + (x.faixa ? 2 : 0) + (x.partido ? 1 : 0) : -1);
  if (peso(novo) > peso(atual)) p[cargo] = novo;
  paises.set(iso, p);
}

// Nome em inglês e sigla de cada partido, numa consulta própria: juntar isso
// à consulta principal multiplicava as linhas e a resposta vinha truncada.
console.log('Nomes dos partidos em inglês...');
const qids = [...new Set([...paises.values()].flatMap((p) => [p.estado?._qid, p.governo?._qid]).filter(Boolean))];
const apelidos = new Map();
for (let i = 0; i < qids.length; i += 80) {
  const valores = qids.slice(i, i + 80).map((q) => `wd:${q}`).join(' ');
  const r = await consultar(`SELECT ?partido ?en ?sigla WHERE {
    VALUES ?partido { ${valores} }
    OPTIONAL { ?partido rdfs:label ?en . FILTER(LANG(?en) = "en") }
    OPTIONAL { ?partido wdt:P1813 ?sigla } }`).catch(() => []);
  for (const l of r) {
    const k = qid(l.partido.value);
    const a = apelidos.get(k) ?? { nomes: new Set(), siglas: new Set() };
    if (l.en) a.nomes.add(l.en.value);
    if (l.sigla) a.siglas.add(l.sigla.value);
    apelidos.set(k, a);
  }
}

console.log('Global Party Survey...');
let survey = new Map();
try { survey = await baixarSurvey(); } catch (e) { console.warn(`  survey indisponível (${e.message}): fica só a categoria da Wikidata.`); }

for (const p of paises.values()) {
  for (const cargo of ['estado', 'governo']) {
    const c = p[cargo];
    if (!c?.partido) { if (c) delete c._qid; continue; }
    const a = apelidos.get(c._qid) ?? { nomes: new Set(), siglas: new Set() };
    const achado = acharNoSurvey(survey.get(p.iso3) ?? [], [...a.nomes, c.partido], [...a.siglas]);
    if (achado) {
      c.posicao = achado.posicao;
      c.social = achado.social;
      c.partidoNoSurvey = achado.nome;
    }
    delete c._qid;
  }
  delete p.iso3;
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
const comPartido = lista.filter((p) => p.governo?.partido || p.estado?.partido).length;
const comPosicao = lista.filter((p) => p.governo?.posicao != null || p.estado?.posicao != null).length;
console.log(`
OK: ${lista.length} países; ${comPartido} com partido, ${comPosicao} com nota do survey (0 a 10), ${comFaixa} com categoria da Wikidata.`);
const cont = {};
for (const p of lista) { const f = (p.governo?.faixa ?? p.estado?.faixa) ?? '(sem)'; cont[f] = (cont[f] ?? 0) + 1; }
console.log(Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · '));
