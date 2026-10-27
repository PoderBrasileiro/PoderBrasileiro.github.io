// Quem governa cada estado, província ou região — onde esse dado existe.
//
//   npm run subnacional
//
// Fonte: Wikidata. A chave é o código ISO 3166-2 (P300), o mesmo "BR-SP" que
// a Natural Earth põe em cada divisão do mapa. É por causa desse código que
// as duas bases se encontram sem precisar casar nome com nome — e casar nome
// de província entre bases é exatamente o tipo de coisa que erra em silêncio.
//
// Só o chefe de GOVERNO da divisão (P6): governador, premiê, ministro-chefe.
// Chefe de Estado subnacional é quase sempre figura cerimonial nomeada de
// cima (o lieutenant governor canadense, o governador australiano), e botar
// os dois juntos faria a cor do mapa depender de qual viesse primeiro.
//
// COBERTURA DESIGUAL, e isso precisa aparecer na tela: a Wikidata tem os 27
// estados brasileiros e os 50 americanos, mas quase nada da África. E
// envelhece: governador que saiu sem alguém fechar a declaração continua lá.
// Por isso cada divisão carrega a data de posse e o link do item.

import { writeFile } from 'node:fs/promises';
import { consultar, qid, buscarPartidos, faixaDoPartido } from './espectro.mjs';

const SAIDA = new URL('../public/data/subnacional.json', import.meta.url);

console.log('Wikidata: chefes de governo das divisões...');
// Em lotes por letra inicial do código. De uma vez só são 1.700 linhas com
// quatro rótulos cada, e a resposta chegava cortada no meio — o parse morria
// com "controle inválido" ou "faltou vírgula", que é truncamento, não dado
// estragado. Em pedaços de seis letras cabe, e um lote que falhar não leva os
// outros junto.
const LOTES = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWXYZ'];
const linhas = [];
for (const letras of LOTES) {
  process.stdout.write(`  ${letras}... `);
  const r = await consultar(`
SELECT ?iso ?divLabel ?pessoa ?pessoaLabel ?partido ?partidoLabel ?desde WHERE {
  ?div wdt:P300 ?iso .
  FILTER(CONTAINS("${letras}", SUBSTR(?iso, 1, 1)))
  ?div p:P6 ?decl .
  ?decl ps:P6 ?pessoa .
  FILTER NOT EXISTS { ?decl pq:P582 ?fim }
  OPTIONAL { ?decl pq:P580 ?desde }
  OPTIONAL {
    ?pessoa p:P102 ?fp . ?fp ps:P102 ?partido .
    FILTER NOT EXISTS { ?fp pq:P582 ?f2 }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }
}`);
  console.log(`${r.length} linhas`);
  linhas.push(...r);
}

const divisoes = new Map();
for (const l of linhas) {
  const iso = l.iso.value.toUpperCase();
  if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(iso)) continue;
  const desde = l.desde?.value.slice(0, 10) ?? null;
  const atual = divisoes.get(iso);
  const pessoa = `https://www.wikidata.org/wiki/${qid(l.pessoa.value)}`;

  // Mais de uma declaração aberta no mesmo cargo quer dizer que alguém esqueceu
  // de fechar a anterior. Fica a posse mais recente, que é a que tem chance de
  // ser a de hoje.
  if (atual && atual.wikidata !== pessoa) {
    if (!desde || (atual.desde && atual.desde >= desde)) continue;
    divisoes.set(iso, { iso, nome: l.divLabel.value, pessoa: l.pessoaLabel.value, wikidata: pessoa, desde, _opcoes: [] });
  } else if (!atual) {
    divisoes.set(iso, { iso, nome: l.divLabel.value, pessoa: l.pessoaLabel.value, wikidata: pessoa, desde, _opcoes: [] });
  }
  if (l.partido && divisoes.get(iso).wikidata === pessoa) {
    divisoes.get(iso)._opcoes.push({ qid: qid(l.partido.value), nome: l.partidoLabel.value });
  }
}

console.log('Partidos: alinhamento e ideologia...');
const qids = [...new Set([...divisoes.values()].flatMap((d) => d._opcoes).map((o) => o.qid))];
const partidos = await buscarPartidos(qids);

for (const d of divisoes.values()) {
  // Mesma regra dos países: entre as filiações da pessoa, fica a que tem
  // posição conhecida. Sem isso um partido regional sem dado podia vencer o
  // nacional que tem.
  const nota = (o) => {
    const a = partidos.get(o.qid);
    return (a?.alinhamento.size ? 4 : 0) + (a?.ideologia.size ? 2 : 0) + (a?.nomes.size ? 1 : 0);
  };
  const melhor = d._opcoes.slice().sort((x, y) => nota(y) - nota(x))[0] ?? null;
  delete d._opcoes;
  d.partido = melhor?.nome ?? null;
  if (!d.partido) { d.semPartido = true; continue; }
  const f = faixaDoPartido(partidos.get(melhor.qid));
  if (f) Object.assign(d, f);
}

const lista = [...divisoes.values()].sort((a, b) => a.iso.localeCompare(b.iso));
if (lista.length < 800) { console.error(`\nABORTADO — só ${lista.length} divisões, esperado ~1.700.`); process.exit(1); }

await writeFile(SAIDA, JSON.stringify({
  geradoEm: new Date().toISOString(),
  fonte: 'Wikidata',
  divisoes: Object.fromEntries(lista.map((d) => [d.iso, d])),
}));

const paises = new Set(lista.map((d) => d.iso.slice(0, 2)));
const comFaixa = lista.filter((d) => d.faixa).length;
console.log(`\nOK: ${lista.length} divisões em ${paises.size} países; ${comFaixa} com faixa no espectro.`);
