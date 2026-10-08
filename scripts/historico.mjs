// Guarda a composição de cada grupo, um registro por dia.
//
//   npm run historico      (roda depois de "npm run coletar")
//
// Acumula em public/data/historico.json, que o workflow commita. Começou a
// ser guardado quando este script entrou — não há como recuperar o passado,
// e é justamente por isso que ele existe desde já.
//
// Guarda o número de cabeças de cada lado, não a porcentagem: com o número
// dá pra recalcular qualquer porcentagem depois, e o contrário não.

import { readFile, writeFile } from 'node:fs/promises';
import { tabelaPartidos } from './partidos.mjs';

const DADOS = new URL('../public/data/', import.meta.url);
const CARGOS = ['ministro', 'senador', 'deputado', 'governador'];
const MAX_DIAS = 1100;   // três anos; além disso o arquivo cresce sem servir

const ler = async (nome, padrao) => {
  try { return JSON.parse(await readFile(new URL(nome, DADOS), 'utf8')); } catch { return padrao; }
};

const brasil = await ler('brasil.json');
if (!brasil) { console.error('Rode "npm run coletar" antes.'); process.exit(1); }

const posicaoDe = (p) => (p.partido ? tabelaPartidos.partidos[p.partido]?.posicao ?? null : null);

const hoje = brasil.geradoEm.slice(0, 10);
const registro = { data: hoje, grupos: {} };
for (const cargo of CARGOS) {
  const gente = brasil.pessoas.filter((p) => p.cargo === cargo);
  const pos = gente.map(posicaoDe).filter((x) => x != null);
  registro.grupos[cargo] = {
    total: gente.length,
    esq: pos.filter((x) => x < 5).length,
    centro: pos.filter((x) => x === 5).length,
    dir: pos.filter((x) => x > 5).length,
  };
  // Bancada por partido: é o que permite ver uma migração partidária depois.
  registro.grupos[cargo].partidos = Object.fromEntries(
    Object.entries(gente.reduce((c, p) => { const k = p.partido ?? '(sem partido)'; c[k] = (c[k] ?? 0) + 1; return c; }, {}))
      .sort((a, b) => b[1] - a[1]));
}

const anterior = await ler('historico.json', { dias: [] });
// Um registro por dia: rodar duas vezes no mesmo dia só atualiza o do dia.
const dias = [...anterior.dias.filter((d) => d.data !== hoje), registro]
  .sort((a, b) => a.data.localeCompare(b.data))
  .slice(-MAX_DIAS);

await writeFile(new URL('historico.json', DADOS), JSON.stringify({ geradoEm: new Date().toISOString(), cargos: CARGOS, dias }));

const r = registro.grupos;
console.log(`OK: ${dias.length} dia(s) guardado(s); hoje ${hoje}.`);
for (const c of CARGOS) console.log(`  ${c.padEnd(11)} ${r[c].esq} esq · ${r[c].centro} centro · ${r[c].dir} dir (de ${r[c].total})`);
