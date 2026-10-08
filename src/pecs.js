// Aba de PECs: lista das propostas de emenda à Constituição com o estágio em
// cada casa e o placar da votação nominal mais recente.

import { h, trocar, fmtData } from './comum.js';

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
  return v ? `Última votação em plenário: ${v.resultado ?? 'sem resultado informado'}` : 'Sem situação informada';
}

// Em que pé a PEC está, em linguagem de gente. O caminho é sempre o mesmo:
// comissão → plenário da casa → a outra casa → promulgação. Cada etapa tem
// nome, ícone e cor próprios — a cor nunca aparece sozinha.
export const ETAPAS = {
  promulgada: { rotulo: 'Virou emenda à Constituição', icone: '✓', ordem: 4, explica: 'Aprovada nas duas casas, em dois turnos, e promulgada. Já faz parte da Constituição.' },
  'outra-casa': { rotulo: 'Passou numa casa, está na outra', icone: '→', ordem: 3, explica: 'Aprovada em dois turnos numa casa e enviada à outra, onde o processo recomeça.' },
  plenario: { rotulo: 'Pronta para o plenário', icone: '●', ordem: 2, explica: 'Já passou pela comissão e espera a vez de ser votada pelos deputados ou senadores.' },
  comissao: { rotulo: 'Em comissão', icone: '○', ordem: 1, explica: 'Ainda em análise de comissão: relator, parecer, admissibilidade. A maioria das PECs para aqui.' },
};

export function etapaDe(pec) {
  const s = (pec.estagio.situacao ?? '').toLowerCase();
  if (/norma jur|promulga/.test(s)) return 'promulgada';
  if (/apreciação pelo senado|apreciação pela câmara|remetid/.test(s)) return 'outra-casa';
  if (/pronta para pauta|chancela/.test(s)) return 'plenario';
  if (s) return 'comissao';
  // O Senado não informa situação; o texto da sessão é o que resta.
  const t = (pec.estagio.tramitacao ?? '').toLowerCase();
  if (/promulga/.test(t)) return 'promulgada';
  if (/à câmara|a câmara|vai à|remetid/.test(t)) return 'outra-casa';
  return pec.votacoes.length ? 'plenario' : 'comissao';
}

export function criarPecs(raiz, dados, { aoEscolherPec }) {
  const lista = h('div', { class: 'pecs' });
  const soNominais = h('input', { type: 'checkbox', checked: true });
  const filtro = h('label', { class: 'pecs-filtro' }, soNominais, ' Só as que tiveram votação nominal em plenário');
  const aviso = h('p', { class: 'fraco' }, 'Carregando…');
  const legenda = h('div', { class: 'pecs-legenda' },
    Object.entries(ETAPAS).sort((a, b) => a[1].ordem - b[1].ordem).map(([k, v]) =>
      h('span', { class: 'selo selo-etapa', 'data-etapa': k, title: v.explica }, h('i', { 'aria-hidden': 'true' }, v.icone), v.rotulo)));
  raiz.append(aviso, legenda, filtro, lista);

  function desenhar() {
    const d = dados.pecs;
    if (d === undefined) return;
    if (!d) { aviso.textContent = 'Dados de PECs indisponíveis. Rode "npm run pecs".'; filtro.hidden = true; return; }
    aviso.textContent = `PECs com movimento desde ${fmtData(d.de)}, segundo os dados abertos da Câmara e do Senado. Cada casa numera e informa a PEC do seu jeito, então a mesma proposta pode aparecer duas vezes — uma por casa.`;
    const visiveis = d.pecs.filter((p) => !soNominais.checked || p.votacoes.length);
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

  return {
    atualizar: desenhar,
    selecionar({ pec }) {
      for (const el of lista.children) el.classList.toggle('ativa', el.dataset.pec === pec);
    },
  };
}
