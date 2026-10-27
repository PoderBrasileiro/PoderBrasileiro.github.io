// Ajudantes de PEC. A aba de PECs saiu quando o site passou a ser do mundo; o
// que ficou é isto, usado na ficha de cada senador — como a pessoa votou em
// cada emenda. As etapas da tramitação continuam em etapas.js, de onde
// scripts/postar.mjs as lê pra pautar cada avanço.

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

export const placarCurto = (v) => `Sim ${v.placar.Sim ?? 0} · Não ${v.placar['Não'] ?? 0}`;
