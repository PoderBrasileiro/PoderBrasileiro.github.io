// Aba de PECs: lista das propostas de emenda à Constituição com o estágio em
// cada casa e o placar da votação nominal mais recente.

import { h, trocar, fmtData, semAcento } from './comum.js';
import { ETAPAS, etapaDe } from './etapas.js';
export { ETAPAS, etapaDe };

// Fita de etapas: mostra onde a PEC está no caminho até virar emenda.
export function trilha(pec) {
  const atual = etapaDe(pec);
  const ordem = ETAPAS[atual].ordem;
  return h('span', { class: 'trilha', 'aria-hidden': 'true' },
    Object.entries(ETAPAS).sort((a, b) => a[1].ordem - b[1].ordem)
      .map(([k, v]) => h('i', { class: `trilha-passo${v.ordem < ordem ? ' feito' : v.ordem === ordem ? ' agora' : ''}`, 'data-etapa': k })));
}

export const selo = (pec) => {
  const k = etapaDe(pec);
  return h('span', { class: 'selo selo-etapa', 'data-etapa': k, title: ETAPAS[k].explica },
    h('i', { 'aria-hidden': 'true' }, ETAPAS[k].icone), ETAPAS[k].rotulo);
};

// O Senado registra o motivo de quem não votou em siglas próprias.
export const ROTULO_VOTO = {
  Sim: 'Sim', 'Não': 'Não', 'Abstenção': 'Abstenção', 'Obstrução': 'Obstrução',
  'Artigo 17': 'Presidente da sessão (não vota)',
  'Presidente (art. 51 RISF)': 'Presidente da sessão (não vota)',
  'P-NRV': 'Presente, não registrou voto',
  AP: 'Ausente em atividade parlamentar',
  MIS: 'Ausente em missão',
  LS: 'Licença saúde',
  LP: 'Licença particular',
  NCom: 'Não compareceu',
  NA: 'Não anotado',
};
const ORDEM = ['Sim', 'Não', 'Abstenção', 'Obstrução'];
export const tiposDeVoto = (votos) => Object.keys(votos)
  .sort((a, b) => (ORDEM.indexOf(a) + 1 || 99) - (ORDEM.indexOf(b) + 1 || 99) || votos[b].length - votos[a].length);

export const placarCurto = (v) => `Sim ${v.placar.Sim ?? 0} · Não ${v.placar['Não'] ?? 0}`;

export function estagioCurto(pec) {
  const e = pec.estagio;
  if (e.situacao) return `${e.situacao}${e.orgao ? ` (${e.orgao})` : ''}`;
  const v = pec.votacoes[0];
  return v ? `Última votação em plenário: ${v.resultado ?? 'Sem resultado informado'}` : 'Sem situação informada';
}

export function criarPecs(raiz, dados, { aoEscolherPec }) {
  const lista = h('div', { class: 'pecs' });
  const soNominais = h('input', { type: 'checkbox', checked: true });
  const filtro = h('label', { class: 'pecs-filtro' }, soNominais, ' Só as que tiveram votação nominal em plenário');
  const aviso = h('p', { class: 'fraco' }, 'Carregando…');
  const legenda = h('div', { class: 'pecs-legenda' },
    Object.entries(ETAPAS).sort((a, b) => a[1].ordem - b[1].ordem).map(([k, v]) =>
      h('span', { class: 'selo selo-etapa', 'data-etapa': k, title: v.explica }, h('i', { 'aria-hidden': 'true' }, v.icone), v.rotulo)));
  // Busca no número, na ementa e na situação: achar "saúde" ou "14/2021".
  const busca = h('input', { type: 'search', class: 'filtro', placeholder: 'Buscar por número ou assunto…', 'aria-label': 'Buscar PEC' });
  raiz.append(aviso, legenda, h('div', { class: 'pecs-controles' }, busca, filtro), lista);

  function desenhar() {
    const d = dados.pecs;
    if (d === undefined) return;
    if (!d) { aviso.textContent = 'Dados de PECs indisponíveis. Rode "npm run pecs".'; filtro.hidden = true; return; }
    aviso.textContent = `PECs com movimento desde ${fmtData(d.de)}, pelos dados abertos da Câmara e do Senado. A mesma proposta aparece uma vez por casa.`;
    const termos = semAcento(busca.value).split(/s+/).filter(Boolean);
    const visiveis = d.pecs.filter((p) => {
      if (soNominais.checked && !p.votacoes.length) return false;
      if (!termos.length) return true;
      const texto = semAcento([p.titulo, p.ementa, p.casa, estagioCurto(p), ETAPAS[etapaDe(p)].rotulo].join(' '));
      return termos.every((t) => texto.includes(t));
    });
    if (!visiveis.length) return trocar(lista, h('p', { class: 'fraco' }, 'Nenhuma PEC encontrada.'));
    trocar(lista, visiveis.map((p) => {
      const v = p.votacoes[0];
      return h('button', { class: 'pec', 'data-pec': p.id, 'data-etapa': etapaDe(p), onclick: () => aoEscolherPec(p.id) },
        h('span', { class: 'pec-topo' }, h('b', {}, p.titulo), h('span', { class: 'selo' }, p.casa)),
        trilha(p),
        selo(p),
        h('span', { class: 'pec-ementa' }, p.ementa),
        h('small', {}, estagioCurto(p)),
        v ? h('small', {}, `${fmtData(v.data)} · ${placarCurto(v)}${v.resultado ? ` · ${v.resultado}` : ''}`) : null);
    }));
  }
  soNominais.addEventListener('change', desenhar);
  busca.addEventListener('input', desenhar);

  return {
    atualizar: desenhar,
    selecionar({ pec }) {
      for (const el of lista.children) el.classList.toggle('ativa', el.dataset.pec === pec);
    },
  };
}
