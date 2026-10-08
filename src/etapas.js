// Em que etapa uma PEC está. Usado pela tela e pelo script de postagem,
// por isso fica fora de pecs.js, que mexe no DOM.

// Em que pé a PEC está, em linguagem de gente. O caminho é sempre o mesmo:
// comissão → plenário da casa → a outra casa → promulgação. Cada etapa tem
// nome, ícone e cor próprios — a cor nunca aparece sozinha.
export const ETAPAS = {
  promulgada: { rotulo: 'Virou emenda à Constituição', icone: '✓', ordem: 4, explica: 'Aprovada nas duas casas e promulgada. Já faz parte da Constituição.' },
  'outra-casa': { rotulo: 'Passou numa casa, está na outra', icone: '→', ordem: 3, explica: 'Aprovada numa casa e enviada à outra, onde o processo recomeça.' },
  plenario: { rotulo: 'Pronta para o plenário', icone: '●', ordem: 2, explica: 'Passou pela comissão e espera a vez de ser votada.' },
  comissao: { rotulo: 'Em comissão', icone: '○', ordem: 1, explica: 'Em análise de comissão. A maioria das PECs para aqui.' },
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

