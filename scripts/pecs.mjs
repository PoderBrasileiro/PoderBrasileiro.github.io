// PECs: em que estágio cada uma está e como cada parlamentar votou.
//
//   npm run pecs
//
// Fontes: Dados Abertos da Câmara e do Senado. Entram as PECs com movimento
// nos últimos MESES meses; de cada uma, só as votações NOMINAIS de plenário
// (as simbólicas não registram voto individual, então não há o que mostrar).
//
// Câmara e Senado numeram a mesma PEC de formas diferentes e as APIs não
// ligam uma à outra. Por isso a PEC aparece uma vez por casa, com o estágio
// que AQUELA casa informa — o site não tenta adivinhar que são a mesma.

import { writeFile } from 'node:fs/promises';

const SAIDA = new URL('../public/data/pecs.json', import.meta.url);
const MESES = 18;
const CAMARA = 'https://dadosabertos.camara.leg.br/api/v2';
const SENADO = 'https://legis.senado.leg.br/dadosabertos';
const H = { headers: { Accept: 'application/json', 'User-Agent': 'PoderBR/0.1 (projeto pessoal; dados publicos)' } };

async function json(url) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...H, signal: AbortSignal.timeout(40000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= 3) throw new Error(`${e.message} em ${url}`);
      await new Promise((ok) => setTimeout(ok, 2000 * (i + 1)));
    }
  }
}

const iso = (d) => d.toISOString().slice(0, 10);
const hoje = new Date();
const inicio = new Date(hoje); inicio.setMonth(inicio.getMonth() - MESES);

// Quem votou, uma vez só: id -> [nome, partido, UF]. Os votos guardam só o id.
const nomes = {};
const placarDe = (votos) => Object.fromEntries(Object.entries(votos).map(([k, v]) => [k, v.length]));

// ---------- Câmara ----------

async function pecsDaCamara() {
  const lista = [];
  for (let pagina = 1; pagina < 50; pagina++) {
    const p = await json(`${CAMARA}/proposicoes?siglaTipo=PEC&dataInicio=${iso(inicio)}&itens=100&pagina=${pagina}&ordem=DESC&ordenarPor=id`);
    if (!p?.dados?.length) break;
    lista.push(...p.dados);
  }
  const out = [];
  for (const item of lista) {
    const det = (await json(`${CAMARA}/proposicoes/${item.id}`))?.dados;
    const st = det?.statusProposicao ?? {};
    const vots = ((await json(`${CAMARA}/proposicoes/${item.id}/votacoes`))?.dados ?? [])
      .filter((v) => v.siglaOrgao === 'PLEN' && v.data >= iso(inicio));
    const votacoes = [];
    for (const v of vots) {
      const brutos = (await json(`${CAMARA}/votacoes/${v.id}/votos`))?.dados ?? [];
      if (!brutos.length) continue;   // votação simbólica
      const votos = {};
      for (const b of brutos) {
        const d = b.deputado_;
        const id = `deputado-${d.id}`;
        nomes[id] = [d.nome, d.siglaPartido, d.siglaUf];
        (votos[b.tipoVoto] ??= []).push(id);
      }
      votacoes.push({ data: v.data, descricao: v.descricao, resultado: v.aprovacao === 1 ? 'aprovada' : v.aprovacao === 0 ? 'rejeitada' : null, placar: placarDe(votos), votos });
    }
    votacoes.sort((a, b) => b.data.localeCompare(a.data));
    out.push({
      id: `camara-${item.id}`,
      casa: 'Câmara',
      titulo: `PEC ${item.numero}/${item.ano}`,
      ementa: item.ementa,
      estagio: { situacao: st.descricaoSituacao ?? null, tramitacao: st.descricaoTramitacao ?? null, orgao: st.siglaOrgao ?? null, data: st.dataHora?.slice(0, 10) ?? null },
      link: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${item.id}`,
      votacoes,
    });
  }
  return out;
}

// ---------- Senado ----------

const RESULTADO_SENADO = { A: 'aprovada', R: 'rejeitada' };

async function pecsDoSenado() {
  const porPec = new Map();
  for (let de = new Date(inicio); de < hoje;) {
    const ate = new Date(de); ate.setDate(ate.getDate() + 59);
    const fim = ate < hoje ? ate : hoje;
    const lote = await json(`${SENADO}/votacao?dataInicio=${iso(de)}&dataFim=${iso(fim)}`).catch(() => null);
    for (const v of Array.isArray(lote) ? lote : []) {
      if (v.sigla !== 'PEC' || !(v.votos ?? []).length) continue;
      const votos = {};
      for (const b of v.votos) {
        const id = `senador-${b.codigoParlamentar}`;
        nomes[id] = [b.nomeParlamentar, b.siglaPartidoParlamentar, b.siglaUFParlamentar];
        (votos[b.siglaVotoParlamentar] ??= []).push(id);
      }
      const pec = porPec.get(v.identificacao) ?? {
        id: `senado-${v.codigoMateria}`,
        casa: 'Senado',
        titulo: v.identificacao,
        ementa: v.ementa,
        // O Senado não entrega a situação num campo; fica o último informe da sessão.
        estagio: { situacao: null, tramitacao: null, orgao: null, data: null },
        link: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${v.codigoMateria}`,
        votacoes: [],
      };
      pec.votacoes.push({ data: v.dataSessao, descricao: v.descricaoVotacao, resultado: RESULTADO_SENADO[v.resultadoVotacao] ?? null, placar: placarDe(votos), votos });
      if (!pec.estagio.data || v.dataSessao > pec.estagio.data) {
        pec.estagio = { situacao: null, tramitacao: (v.informeLegislativo?.texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 600) || null, orgao: 'Plenário do Senado', data: v.dataSessao };
      }
      porPec.set(v.identificacao, pec);
    }
    de = new Date(fim); de.setDate(de.getDate() + 1);
  }
  for (const p of porPec.values()) p.votacoes.sort((a, b) => b.data.localeCompare(a.data));
  return [...porPec.values()];
}

console.log('PECs da Câmara...');
const camara = await pecsDaCamara();
console.log('PECs do Senado...');
const senado = await pecsDoSenado();

const pecs = [...camara, ...senado].sort((a, b) =>
  (b.votacoes[0]?.data ?? b.estagio.data ?? '').localeCompare(a.votacoes[0]?.data ?? a.estagio.data ?? ''));
if (!camara.length) { console.error('ABORTADO — a Câmara não devolveu nenhuma PEC. Nada foi gravado.'); process.exit(1); }

await writeFile(SAIDA, JSON.stringify({ geradoEm: hoje.toISOString(), de: iso(inicio), nomes, pecs }));
const comVoto = pecs.filter((p) => p.votacoes.length);
console.log(`\nOK: ${camara.length} PECs da Câmara, ${senado.length} do Senado; ${comVoto.length} com votação nominal (${comVoto.reduce((n, p) => n + p.votacoes.length, 0)} votações).`);
