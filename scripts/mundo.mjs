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
const UA = { 'User-Agent': 'PoderBR/0.1 (projeto pessoal; dados publicos)', Accept: 'application/sparql-results+json' };

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
SELECT ?iso ?num ?paisLabel ?pais ?cargo ?pessoa ?pessoaLabel ?partido ?partidoLabel ?paisDoPartido ?espectro ?formaLabel ?desde WHERE {
  ?pais wdt:P31 wd:Q3624078 ; wdt:P297 ?iso ; wdt:P299 ?num .
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
    iso, num: Number(l.num.value), nome: l.paisLabel.value,
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

const lista = [...paises.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
// Em sistema presidencialista a mesma pessoa acumula os dois cargos.
for (const p of lista) p.acumula = Boolean(p.estado && p.governo && p.estado.nome === p.governo.nome);

if (lista.length < 150) { console.error(`\nABORTADO — só ${lista.length} países, esperado ~195.`); process.exit(1); }

await writeFile(new URL('public/data/mundo.json', RAIZ), JSON.stringify({
  geradoEm: new Date().toISOString(),
  fonte: 'Wikidata',
  paises: lista,
}));

const comFaixa = lista.filter((p) => p.governo?.faixa || p.estado?.faixa).length;
const comPartido = lista.filter((p) => p.governo?.partido || p.estado?.partido).length;
console.log(`\nOK: ${lista.length} países; ${comPartido} com partido, ${comFaixa} com posição no espectro.`);
const cont = {};
for (const p of lista) { const f = (p.governo?.faixa ?? p.estado?.faixa) ?? '(sem)'; cont[f] = (cont[f] ?? 0) + 1; }
console.log(Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · '));
