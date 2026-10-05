// Coleta os prefeitos eleitos em 2024 e a malha municipal de cada estado.
//
//   npm run prefeitos
//
// Fonte: os arquivos de resultado oficial do TSE (resultados.tse.jus.br), um
// por município, e a API de malhas do IBGE. São ~5.600 requisições pequenas;
// leva alguns minutos. Não entra na atualização diária: o resultado de uma
// eleição não muda de um dia pro outro.
//
// LIMITE IMPORTANTE: isto é quem foi ELEITO em 2024, não necessariamente quem
// está no cargo hoje. Cassação, morte, renúncia, eleição suplementar e troca
// de partido depois da posse não aparecem aqui. O site diz isso na ficha.

import { writeFile, mkdir } from 'node:fs/promises';
import { normalizarPartido, tabelaPartidos } from './partidos.mjs';

const SAIDA = new URL('../public/data/', import.meta.url);
const BASE = 'https://resultados.tse.jus.br/oficial/ele2024';
const TURNO_1 = '619';
const TURNO_2 = '620';
const PARALELO = 8;
const UA = { 'User-Agent': 'PoderBR/0.1 (projeto pessoal; dados publicos)' };

async function json(url, tentativas = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tentativas - 1) throw new Error(`${e.message} em ${url}`);
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}

// "RICARDO NUNES" -> "Ricardo Nunes"; partículas ficam minúsculas.
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del']);
function capitalizar(s) {
  return s.toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.replace(/(^|[-'.(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'))))
    .join(' ');
}

const arquivo = (eleicao, uf, cod) => `${BASE}/${eleicao}/dados/${uf}/${uf}${cod}-c0011-e000${eleicao}-u.json`;

function eleito(resultado) {
  if (!resultado) return { status: 'sem-arquivo' };
  const cands = resultado.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand.map((c) => ({ ...c, partido: p.sg }))));
  const ganhou = cands.find((c) => c.st === 'Eleito');
  if (ganhou) return { status: 'eleito', cand: ganhou };
  // Sem eleito no 1º turno: ou houve 2º turno (o status vem "2º turno" ou
  // vazio, conforme a cidade), ou a eleição ficou anulada/sub judice.
  return { status: 'sem-eleito' };
}

async function prefeitoDe(uf, mun) {
  let r = eleito(await json(arquivo(TURNO_1, uf, mun.cd)));
  if (r.status === 'sem-eleito') r = eleito(await json(arquivo(TURNO_2, uf, mun.cd)));
  if (r.status !== 'eleito') return { ibge: mun.cdi, pendente: r.status };
  const vice = r.cand.vs?.find((v) => v.tp === 'v');
  return {
    ibge: mun.cdi,
    nome: capitalizar(r.cand.nmu),
    nomeCompleto: capitalizar(r.cand.nm),
    partido: normalizarPartido(r.cand.partido),
    vice: vice ? { nome: capitalizar(vice.nmu), partido: normalizarPartido(vice.sgp) } : null,
  };
}

// Roda `tarefa` sobre `itens` com no máximo PARALELO simultâneas.
async function emParalelo(itens, tarefa) {
  const out = new Array(itens.length);
  let proximo = 0;
  await Promise.all(Array.from({ length: PARALELO }, async () => {
    while (proximo < itens.length) { const i = proximo++; out[i] = await tarefa(itens[i]); }
  }));
  return out;
}

console.log('Lista de municípios (TSE e IBGE)...');
const cfg = await json(`${BASE}/${TURNO_1}/config/mun-e000${TURNO_1}-cm.json`);
const ibge = await json('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado');
const nomeIbge = new Map(ibge.map((m) => [String(m['municipio-id']), m['municipio-nome']]));

await mkdir(new URL('malhas/', SAIDA), { recursive: true });
const porUf = {};
const pendentes = [];
let total = 0;
for (const abr of cfg.abr) {
  const uf = abr.cd;
  const UF = uf.toUpperCase();
  const lista = await emParalelo(abr.mu, async (mun) => {
    const p = await prefeitoDe(uf, mun);
    return { ...p, municipio: nomeIbge.get(mun.cdi) ?? capitalizar(mun.nm) };
  });
  for (const p of lista) if (p.pendente) pendentes.push(`${p.municipio}/${UF} (${p.pendente})`);
  porUf[UF] = lista.sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt'));
  total += lista.filter((p) => !p.pendente).length;

  const malha = await json(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${UF}?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`);
  await writeFile(new URL(`malhas/${UF}.json`, SAIDA), JSON.stringify(malha));
  console.log(`${UF}: ${lista.length} municípios, ${malha.features.length} polígonos`);
}

if (total < 5400) {
  console.error(`\nABORTADO — só ${total} prefeitos encontrados, esperado ~5.560. Nada foi gravado em prefeitos.json.`);
  process.exit(1);
}

const todos = Object.values(porUf).flat().filter((p) => !p.pendente);
const semEscala = [...new Set(todos.map((p) => p.partido).filter((s) => s && !tabelaPartidos.partidos[s]))];
await writeFile(new URL('prefeitos.json', SAIDA), JSON.stringify({ geradoEm: new Date().toISOString(), eleicao: 2024, porUf }));

console.log(`\nOK: ${total} prefeitos em ${Object.keys(porUf).length} estados.`);
if (pendentes.length) console.warn(`Sem eleito no arquivo do TSE (${pendentes.length}): ${pendentes.join('; ')}`);
if (semEscala.length) console.warn(`Partidos sem posição em data/partidos.json: ${semEscala.join(', ')}`);
