// Deputados estaduais e distritais eleitos em 2026.
//
//   npm run estaduais
//
// Fonte: resultado oficial do TSE, um arquivo por estado. São 1.059 pessoas,
// a camada do poder que faltava entre o Congresso e as prefeituras.
//
// LIMITE: são os ELEITOS, que assumem em 1º de fevereiro de 2027. Quem está
// na assembleia hoje não entra: não existe fonte única para isso — cada
// assembleia publica do seu jeito, quando publica.

import { readFile, writeFile } from 'node:fs/promises';
import { normalizarPartido, tabelaPartidos } from './partidos.mjs';

const RAIZ = new URL('..', import.meta.url);
const BASE = 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados';
const UA = { 'User-Agent': 'PoderBR/0.1 (projeto pessoal; dados publicos)' };
// O Distrito Federal elege deputados distritais, com código de cargo próprio.
const CARGO = (uf) => (uf === 'df' ? '0008' : '0007');

async function json(url) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 3) throw new Error(`${e.message} em ${url}`);
      await new Promise((ok) => setTimeout(ok, 2000 * (i + 1)));
    }
  }
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del']);
const capitalizar = (s) => s.toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean)
  .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.replace(/(^|[-'.(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'))))
  .join(' ');

const brasil = JSON.parse(await readFile(new URL('public/data/brasil.json', RAIZ), 'utf8'));

const porUf = {};
let total = 0;
for (const u of brasil.ufs) {
  const uf = u.sigla.toLowerCase();
  const d = await json(`${BASE}/${uf}/${uf}-c${CARGO(uf)}-e006259-u.json`);
  if (!d) { console.warn(`  ${u.sigla}: sem arquivo no TSE`); porUf[u.sigla] = []; continue; }
  const eleitos = d.carg[0].agr
    .flatMap((a) => a.par.flatMap((p) => p.cand.map((c) => ({ ...c, partido: p.sg }))))
    .filter((c) => /^Eleito/.test(c.st))
    .map((c) => ({
      id: `estadual-${c.sqcand}`,
      nome: capitalizar(c.nmu),
      nomeCompleto: capitalizar(c.nm),
      partido: normalizarPartido(c.partido),
      pct: c.pvap ?? null,
      // "Eleito por QP" é quem passou pelo quociente do próprio partido;
      // "por média" entrou pelas sobras. A distinção importa e é do TSE.
      como: /m[ée]dia/i.test(c.st) ? 'média' : 'quociente',
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  porUf[u.sigla] = eleitos;
  total += eleitos.length;
  process.stdout.write(`${u.sigla} ${eleitos.length}  `);
}
console.log();

if (total < 1000) { console.error(`\nABORTADO — só ${total} eleitos, esperado ~1.059. Nada foi gravado.`); process.exit(1); }

const semEscala = [...new Set(Object.values(porUf).flat().map((p) => p.partido).filter((s) => s && !tabelaPartidos.partidos[s]))];
await writeFile(new URL('public/data/estaduais.json', RAIZ), JSON.stringify({ geradoEm: new Date().toISOString(), eleicao: 2026, total, porUf }));
console.log(`\nOK: ${total} deputados estaduais e distritais eleitos em 2026.`);
if (semEscala.length) console.warn(`Partidos sem posição em data/partidos.json: ${semEscala.join(', ')}`);
