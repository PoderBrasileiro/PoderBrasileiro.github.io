// Busca notícias que citam cada político junto de termos de investigação.
//
//   npm run noticias            todo mundo
//   npm run noticias -- 10      só os 10 primeiros (teste)
//
// Fonte: GDELT DOC API, que é aberta e permite republicar título + link.
// (O RSS do Google Notícias seria mais fácil, mas os termos dele proíbem uso
// fora de leitor de feed pessoal — por isso o site só LINKA pra busca do
// Google, não copia os resultados.)
//
// O GDELT aceita 1 requisição a cada 5s e devolve 429 com facilidade. O script
// é lento de propósito (~15 min pra todos) e, quando uma busca falha, mantém o
// que já estava gravado pra aquela pessoa em vez de apagar.
//
// IMPORTANTE: o resultado é busca textual por nome. Pega homônimo, pega matéria
// em que a pessoa só é citada, e não diz nada sobre culpa. O site avisa isso.

import { readFile, writeFile } from 'node:fs/promises';

const DADOS = new URL('../public/data/', import.meta.url);
const TERMOS = '(investigação OR inquérito OR denúncia OR "Polícia Federal" OR "Ministério Público")';
const INTERVALO_MS = 6500;
const MAX_POR_PESSOA = 8;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ler = async (nome, padrao) => {
  try { return JSON.parse(await readFile(new URL(nome, DADOS), 'utf8')); } catch { return padrao; }
};

async function buscar(nome) {
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({
    query: `"${nome}" ${TERMOS} sourcecountry:BR`,
    mode: 'artlist', format: 'json', sort: 'datedesc', timespan: '3m',
    maxrecords: String(MAX_POR_PESSOA),
  });
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(url);
    if (r.status === 429) { await dormir(INTERVALO_MS * (tentativa + 2)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const texto = await r.text();
    let j;
    try { j = JSON.parse(texto); } catch { throw new Error(texto.slice(0, 80)); }
    return (j.articles ?? []).map((a) => ({
      titulo: a.title,
      url: a.url,
      fonte: a.domain,
      data: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}` : null,
    }));
  }
  throw new Error('429 (limite do GDELT)');
}

const brasil = await ler('brasil.json');
if (!brasil) { console.error('Rode "npm run coletar" antes.'); process.exit(1); }
const anterior = await ler('noticias.json', { porId: {} });
const limite = Number(process.argv[2]) || brasil.pessoas.length;

const porId = { ...anterior.porId };
let ok = 0, falhas = 0;
for (const p of brasil.pessoas.slice(0, limite)) {
  try {
    porId[p.id] = { nome: p.nome, buscadoEm: new Date().toISOString(), itens: await buscar(p.nome) };
    ok++;
    console.log(`${p.nome}: ${porId[p.id].itens.length}`);
  } catch (e) {
    falhas++;
    console.warn(`${p.nome}: falhou (${e.message})`);
  }
  await dormir(INTERVALO_MS);
}

// Quem saiu do cargo não fica com notícia órfã no arquivo.
const vivos = new Set(brasil.pessoas.map((p) => p.id));
for (const id of Object.keys(porId)) if (!vivos.has(id)) delete porId[id];

await writeFile(new URL('noticias.json', DADOS), JSON.stringify({ geradoEm: new Date().toISOString(), termos: TERMOS, porId }));
console.log(`\n${ok} buscas ok, ${falhas} falharam.`);
