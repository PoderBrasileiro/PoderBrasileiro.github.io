// Transição 2027: cruza o resultado oficial da eleição de 2026 (TSE) com quem
// ocupa cada cargo hoje e diz, pessoa por pessoa, o que acontece em 2027.
//
//   npm run eleicao        (rode "npm run coletar" antes)
//
// Gera public/data/eleicao2026.json com:
//   - presidente: eleito, ou os dois do 2º turno
//   - porUf: governador (eleito ou 2º turno), senadores e deputados eleitos
//   - destino: pra cada pessoa de brasil.json, uma de cinco situações:
//       fica | sai | muda | segundo-turno | depende
//
// Enquanto houver 2º turno pendente o arquivo muda — por isso entra na
// atualização diária. Depois da posse (jan/fev de 2027) perde o sentido.
//
// O ponto frágil é casar a pessoa de hoje com o candidato do TSE: são fontes
// diferentes, com nomes escritos de jeitos diferentes. O casamento usa o nome
// completo quando existe e o nome de urna/parlamentar como reserva, sempre no
// mesmo estado. Quem não casa aparece como "sai" — um erro de casamento vira
// um "sai" falso. O resumo no fim lista os números pra dar pra desconfiar.

import { readFile, writeFile } from 'node:fs/promises';
import { normalizarPartido } from './partidos.mjs';

const RAIZ = new URL('..', import.meta.url);
const BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
const ELEICAO_FEDERAL = '6257';    // presidente
const ELEICAO_ESTADUAL = '6259';   // governador, senador, deputados
const SEGUNDO_TURNO = { [ELEICAO_FEDERAL]: '6258', [ELEICAO_ESTADUAL]: '6260' };
const DATA_2T = '25/10';
const UA = { 'User-Agent': 'PoderBR/0.1 (projeto pessoal; dados publicos)' };
const CARGO = { presidente: '0001', governador: '0003', senador: '0005', deputado: '0006' };
const NOME_CARGO = { presidente: 'presidente', governador: 'governador(a)', senador: 'senador(a)', deputado: 'deputado(a) federal' };

async function json(url) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 3) throw new Error(`${e.message} em ${url}`);
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}
const lerJson = async (caminho, padrao) => {
  try { return JSON.parse(await readFile(new URL(caminho, RAIZ), 'utf8')); } catch { return padrao; }
};

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del']);
const capitalizar = (s) => s.toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean)
  .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.replace(/(^|[-'.(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'))))
  .join(' ');

// ---------- resultado do TSE ----------

async function disputa(eleicao, abr, cargo) {
  const arq = (e) => `${BASE}/${e}/dados/${abr}/${abr}-c${CARGO[cargo]}-e${e.padStart(6, '0')}-u.json`;
  const ler = (j) => j.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand.map((c) => ({
    cargo, uf: abr.toUpperCase(),
    nome: capitalizar(c.nmu), nomeCompleto: capitalizar(c.nm),
    chaveUrna: norm(c.nmu), chaveCompleta: norm(c.nm),
    partido: normalizarPartido(p.sg),
    pct: c.pvap ?? null,
    vice: c.vs?.filter((v) => v.tp === 'v').map((v) => ({ nome: capitalizar(v.nmu), chaveUrna: norm(v.nmu), chaveCompleta: norm(v.nm), partido: normalizarPartido(v.sgp) }))[0] ?? null,
    eleito: /^Eleito/i.test(c.st),
    segundoTurno: /2º turno/i.test(c.st),
  }))));
  const t1 = await json(arq(eleicao));
  if (!t1) throw new Error(`sem resultado de ${cargo} em ${abr}`);
  let cands = ler(t1);
  // Se o 2º turno já foi apurado, ele decide quem é o eleito.
  if (cands.some((c) => c.segundoTurno)) {
    const t2 = await json(arq(SEGUNDO_TURNO[eleicao]));
    const vencedor = t2 && ler(t2).find((c) => c.eleito);
    if (vencedor) cands = cands.map((c) => ({ ...c, segundoTurno: false, eleito: c.chaveCompleta === vencedor.chaveCompleta }));
  }
  return cands;
}

const brasil = await lerJson('public/data/brasil.json');
if (!brasil) { console.error('Rode "npm run coletar" antes.'); process.exit(1); }

console.log('Resultado da eleição de 2026 (TSE)...');
const todos = [...await disputa(ELEICAO_FEDERAL, 'br', 'presidente')];
for (const u of brasil.ufs) {
  for (const cargo of ['governador', 'senador', 'deputado']) todos.push(...await disputa(ELEICAO_ESTADUAL, u.sigla.toLowerCase(), cargo));
}

// ---------- nome civil dos deputados (a lista da Câmara só traz o parlamentar) ----------

const CACHE_NOMES = 'data/cache-nomes-deputados.json';
const nomesCivis = await lerJson(CACHE_NOMES, {});
const semNome = brasil.pessoas.filter((p) => p.cargo === 'deputado' && !nomesCivis[p.id]);
if (semNome.length) {
  console.log(`Nome civil de ${semNome.length} deputados (Câmara)...`);
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < semNome.length) {
      const p = semNome[i++];
      const j = await json(`https://dadosabertos.camara.leg.br/api/v2/deputados/${p.id.replace('deputado-', '')}`).catch(() => null);
      if (j?.dados?.nomeCivil) nomesCivis[p.id] = j.dados.nomeCivil;
    }
  }));
  await writeFile(new URL(CACHE_NOMES, RAIZ), JSON.stringify(nomesCivis, null, 0));
}

// ---------- casar quem está no cargo com o candidato ----------

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const tokens = (s) => norm(s).split(' ').filter((t) => t && !PARTICULAS.has(t));

// Devolve todas as candidaturas de 2026 da pessoa (normalmente uma ou nenhuma).
function candidaturasDe(p) {
  const completo = norm(p.nomeCompleto ?? nomesCivis[p.id]);
  const urna = norm(p.nome);
  const noLugar = todos.filter((c) => !p.uf || c.uf === p.uf || c.uf === 'BR');
  if (completo) {
    const exato = todos.filter((c) => c.chaveCompleta === completo);
    if (exato.length) return exato;
  }
  const porUrna = noLugar.filter((c) => c.chaveUrna === urna);
  if (porUrna.length) return porUrna;
  // Reserva pra quem só tem nome curto (governadores vêm da Wikipédia):
  // todas as palavras do nome dentro do nome completo, e só se der um único.
  const t = tokens(p.nome);
  if (t.length < 2) return [];
  const parecidos = noLugar.filter((c) => { const alvo = new Set(tokens(c.nomeCompleto)); return t.every((x) => alvo.has(x)); });
  return new Set(parecidos.map((c) => c.chaveCompleta)).size === 1 ? parecidos : [];
}

const presidenciais = todos.filter((c) => c.cargo === 'presidente');
const finalistas = presidenciais.filter((c) => c.segundoTurno);
const presidenteEleito = presidenciais.find((c) => c.eleito) ?? null;
const rotuloCand = (c) => `${c.nome} (${c.partido ?? 'sem partido'})`;
const disputaGov = (uf) => {
  const cs = todos.filter((c) => c.cargo === 'governador' && c.uf === uf);
  return { eleito: cs.find((c) => c.eleito) ?? null, finalistas: cs.filter((c) => c.segundoTurno) };
};
const onde = (c) => (c.cargo === 'presidente' ? '' : ` por ${c.uf}`);

function destinoDe(p) {
  if (p.cargo === 'stf') return null;   // cargo sem eleição
  const cands = candidaturasDe(p);
  const ganhou = cands.find((c) => c.eleito);
  const finalista = cands.find((c) => c.segundoTurno);

  if (finalista) {
    const rival = todos.find((c) => c.cargo === finalista.cargo && c.uf === finalista.uf && c.segundoTurno && c.chaveCompleta !== finalista.chaveCompleta);
    return { situacao: 'segundo-turno', texto: `Disputa o 2º turno para ${NOME_CARGO[finalista.cargo]}${onde(finalista)} em ${DATA_2T}${rival ? `, contra ${rotuloCand(rival)}` : ''}.` };
  }
  if (ganhou && ganhou.cargo !== p.cargo) {
    return { situacao: 'muda', texto: `Eleito(a) ${NOME_CARGO[ganhou.cargo]}${onde(ganhou)}. Deixa o cargo atual.` };
  }

  if (p.cargo === 'presidente') {
    return ganhou ? { situacao: 'fica', texto: 'Reeleito.' }
      : { situacao: 'sai', texto: presidenteEleito ? `Sucessor eleito: ${rotuloCand(presidenteEleito)}.` : 'Não está no 2º turno.' };
  }
  if (p.cargo === 'vice') {
    // O nome do vice em data/manual.json é o de uso, não o civil completo.
    const chaves = new Set([norm(p.nomeCompleto), norm(p.nome)]);
    const chapa = presidenciais.find((c) => c.vice && (chaves.has(c.vice.chaveCompleta) || chaves.has(c.vice.chaveUrna)));
    if (chapa?.eleito) return { situacao: 'fica', texto: `Reeleito na chapa de ${chapa.nome}.` };
    if (chapa?.segundoTurno) return { situacao: 'segundo-turno', texto: `É o vice na chapa de ${chapa.nome}, que disputa o 2º turno em ${DATA_2T}.` };
    const novoVice = (presidenteEleito ?? null)?.vice;
    return { situacao: 'sai', texto: novoVice ? `Vice eleito: ${novoVice.nome} (${novoVice.partido ?? 'sem partido'}).`
      : `Não está em nenhuma das chapas do 2º turno. O próximo vice será ${finalistas.map((c) => c.vice && `${c.vice.nome} (chapa de ${c.nome})`).filter(Boolean).join(' ou ')}.` };
  }
  if (p.cargo === 'ministro') {
    if (presidenteEleito) {
      const mesmo = norm(brasil.pessoas.find((x) => x.cargo === 'presidente').nomeCompleto) === presidenteEleito.chaveCompleta;
      return mesmo ? { situacao: 'depende', texto: 'O presidente foi reeleito; quem fica no ministério é escolha dele.' }
        : { situacao: 'sai', texto: `O ministério muda com o novo presidente, ${presidenteEleito.nome}.` };
    }
    return { situacao: 'depende', texto: `Ministro é escolha do presidente: depende de quem vencer o 2º turno em ${DATA_2T}.` };
  }
  if (p.cargo === 'governador') {
    if (ganhou) return { situacao: 'fica', texto: 'Reeleito(a) governador(a).' };
    const d = disputaGov(p.uf);
    const tentou = cands.some((c) => c.cargo === 'governador');
    return { situacao: 'sai', texto: (tentou ? 'Não se reelegeu. ' : 'Não concorreu à reeleição. ')
      + (d.eleito ? `Governador(a) eleito(a): ${rotuloCand(d.eleito)}.` : `O sucessor sai do 2º turno em ${DATA_2T}: ${d.finalistas.map(rotuloCand).join(' × ')}.`) };
  }
  if (p.cargo === 'senador') {
    if (ganhou) return { situacao: 'fica', texto: 'Reeleito(a) senador(a), com mandato até 2035.' };
    if (p.mandatoAte && p.mandatoAte > '2028') return { situacao: 'fica', texto: `Mandato vai até ${p.mandatoAte.slice(0, 4)}; a cadeira não estava em disputa.` };
    return { situacao: 'sai', texto: cands.some((c) => c.cargo === 'senador') ? 'Mandato termina em 31/1/2027 e não se reelegeu.' : 'Mandato termina em 31/1/2027 e não concorreu ao Senado.' };
  }
  if (p.cargo === 'deputado') {
    if (ganhou) return { situacao: 'fica', texto: 'Reeleito(a) deputado(a) federal.' };
    return { situacao: 'sai', texto: cands.some((c) => c.cargo === 'deputado') ? 'Não se reelegeu; mandato termina em 31/1/2027.' : 'Não concorreu à Câmara em 2026 (ou não foi localizado no resultado); mandato termina em 31/1/2027.' };
  }
  return null;
}

const destino = {};
for (const p of brasil.pessoas) { const d = destinoDe(p); if (d) destino[p.id] = d; }

// ---------- quem chega ----------

const publico = (c) => ({ nome: c.nome, partido: c.partido, pct: c.pct, ...(c.vice ? { vice: { nome: c.vice.nome, partido: c.vice.partido } } : {}) });
const chavesHoje = (cargo) => new Set(brasil.pessoas.filter((p) => p.cargo === cargo).flatMap((p) => candidaturasDe(p).map((c) => c.chaveCompleta)));
const jaSenador = chavesHoje('senador');
const jaDeputado = chavesHoje('deputado');
const jaGovernador = chavesHoje('governador');

const porUf = {};
for (const u of brasil.ufs) {
  const d = disputaGov(u.sigla);
  const eleitos = (cargo, ja) => todos.filter((c) => c.cargo === cargo && c.uf === u.sigla && c.eleito)
    .map((c) => ({ ...publico(c), novo: !ja.has(c.chaveCompleta) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  porUf[u.sigla] = {
    governador: d.eleito ? { status: 'eleito', eleito: { ...publico(d.eleito), novo: !jaGovernador.has(d.eleito.chaveCompleta) } }
      : { status: 'segundo-turno', candidatos: d.finalistas.map(publico) },
    senadores: eleitos('senador', jaSenador),
    deputados: eleitos('deputado', jaDeputado),
  };
}

const saida = {
  geradoEm: new Date().toISOString(),
  segundoTurnoEm: DATA_2T,
  presidente: presidenteEleito ? { status: 'eleito', eleito: publico(presidenteEleito) } : { status: 'segundo-turno', candidatos: finalistas.map(publico) },
  porUf, destino,
};

// Sanidade: 27 governos decididos ou em 2º turno, 54 senadores, 513 deputados.
const nSen = Object.values(porUf).reduce((n, u) => n + u.senadores.length, 0);
const nDep = Object.values(porUf).reduce((n, u) => n + u.deputados.length, 0);
const govRuins = Object.entries(porUf).filter(([, u]) => u.governador.status === 'segundo-turno' && u.governador.candidatos.length !== 2).map(([uf]) => uf);
const erros = [];
if (nSen !== 54) erros.push(`senadores eleitos: ${nSen}, esperado 54`);
if (nDep !== 513) erros.push(`deputados eleitos: ${nDep}, esperado 513`);
if (govRuins.length) erros.push(`governo sem eleito nem dois finalistas: ${govRuins.join(', ')}`);
if (!presidenteEleito && finalistas.length !== 2) erros.push('presidente: nem eleito nem dois finalistas');
if (erros.length) { console.error('\nABORTADO — nada foi gravado:\n  ' + erros.join('\n  ')); process.exit(1); }

await writeFile(new URL('public/data/eleicao2026.json', RAIZ), JSON.stringify(saida));

const conta = (cargo) => {
  const c = {};
  for (const p of brasil.pessoas.filter((x) => x.cargo === cargo)) { const s = destino[p.id]?.situacao ?? '-'; c[s] = (c[s] ?? 0) + 1; }
  return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ');
};
console.log(`\nPresidente: ${presidenteEleito ? rotuloCand(presidenteEleito) : finalistas.map((c) => `${rotuloCand(c)} ${c.pct}%`).join(' × ')}`);
console.log(`Governos: ${Object.values(porUf).filter((u) => u.governador.status === 'eleito').length} decididos, ${Object.values(porUf).filter((u) => u.governador.status === 'segundo-turno').length} em 2º turno`);
for (const c of ['governador', 'senador', 'deputado', 'ministro']) console.log(`${c.padEnd(11)} ${conta(c)}`);
console.log(`Deputados eleitos que já são deputados: ${Object.values(porUf).reduce((n, u) => n + u.deputados.filter((d) => !d.novo).length, 0)} de 513`);
