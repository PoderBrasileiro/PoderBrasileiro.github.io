// Ajudantes usados pelas três visualizações e pelo painel.

import * as d3 from 'd3';

export const CARGOS = {
  presidente: { rotulo: 'Presidente da República', curto: 'Presidente', raio: 11 },
  vice: { rotulo: 'Vice-presidente da República', curto: 'Vice-presidente', raio: 9 },
  ministro: { rotulo: 'Ministro(a) de Estado', curto: 'Ministro(a)', raio: 5.5 },
  governador: { rotulo: 'Governador(a)', curto: 'Governador(a)', raio: 7.5 },
  senador: { rotulo: 'Senador(a)', curto: 'Senador(a)', raio: 5 },
  deputado: { rotulo: 'Deputado(a) federal', curto: 'Deputado(a) federal', raio: 4 },
  stf: { rotulo: 'Ministro(a) do Supremo Tribunal Federal', curto: 'Ministro(a) do STF', raio: 7 },
  eleito: { rotulo: 'Eleito(a) em 2026, assume em 2027', curto: 'Eleito(a) em 2026', raio: 5 },
  prefeito: { rotulo: 'Prefeito(a) eleito(a) em 2024', curto: 'Prefeito(a)', raio: 4 },
};

// Cria elemento sem innerHTML: título de notícia e nome vêm de fonte externa.
export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  return el;
}

const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

// Divergente: vermelho (esquerda) — cinza neutro — azul (direita), com 5 no
// meio da régua. As cores saem do CSS pra acompanhar tema claro/escuro.
// A cor satura em 2 e em 8, não em 0 e 10: nenhum partido com gente em cargo
// chega perto das pontas da régua, e no domínio inteiro tudo saía cinzento.
// O 5 continua sendo o cinza do meio, e o número exato está sempre na ficha.
export function escalaEspectro() {
  return d3.scaleLinear()
    .domain([2, 5, 8])
    .range([css('--esq'), css('--meio'), css('--dir')])
    .interpolate(d3.interpolateRgb)
    .clamp(true);
}

// As cinco faixas do espectro. Os cortes são escolha deste site, não do
// artigo: ele dá uma nota de 0 a 10 por partido e não divide em faixas. Foram
// postos onde a distribuição real tem folga — não há partido com gente em
// cargo entre 5,3 e 6,3, por exemplo —, e não em quintos iguais da régua.
export const FAIXAS = [
  { chave: 'esquerda', rotulo: 'Esquerda', ate: 3 },
  { chave: 'centro-esquerda', rotulo: 'Centro-esquerda', ate: 4.5 },
  { chave: 'centro', rotulo: 'Centro', ate: 5.5 },
  { chave: 'centro-direita', rotulo: 'Centro-direita', ate: 7 },
  { chave: 'direita', rotulo: 'Direita', ate: Infinity },
];

export const faixaDe = (posicao) => (posicao == null ? null : FAIXAS.find((f) => posicao < f.ate));

export function posicaoDe(pessoa, dados) {
  return pessoa.partido ? dados.partidos[pessoa.partido]?.posicao ?? null : null;
}

// Devolve um valor de `fill` pronto pra SVG. Sem partido e sem dado NÃO
// ganham cor da régua: cinza do meio diria "centro", que é outra coisa.
export function corDe(pessoa, dados, escala) {
  const pos = posicaoDe(pessoa, dados);
  return pos == null ? 'url(#hachura)' : escala(pos);
}

export function textoPartido(pessoa) {
  if (pessoa.cargo === 'stf') return 'sem partido (magistrado)';
  if (pessoa.partido === undefined) return 'partido não informado';
  return pessoa.partido ?? 'sem partido';
}

export function ondeAtua(pessoa, dados) {
  if (pessoa.cargo === 'ministro') return pessoa.pasta;
  if (pessoa.cargo === 'stf') return 'Supremo Tribunal Federal';
  if (pessoa.cargo === 'eleito') return `${CARGO_ELEITO[pessoa.cargoEleito]} · ${dados.ufPorSigla.get(pessoa.uf)?.nome ?? pessoa.uf}`;
  if (pessoa.cargo === 'prefeito') return `${pessoa.municipio} (${pessoa.uf})`;
  if (pessoa.uf) return dados.ufPorSigla.get(pessoa.uf)?.nome ?? pessoa.uf;
  return 'Brasil';
}

export const fmtNum = (n, casas = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function fmtData(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// <defs> com a hachura de "sem partido / sem dado", pra colar em cada SVG.
export function defsHachura(svg) {
  const p = svg.append('defs').append('pattern')
    .attr('id', 'hachura').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  p.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'var(--fundo-2)');
  p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6)
    .attr('stroke', 'var(--texto-3)').attr('stroke-width', 2);
}

// Dica flutuante única, compartilhada.
const dica = () => document.getElementById('dica');
export function mostrarDica(evento, linhas) {
  const el = dica();
  el.replaceChildren(...linhas.map((l, i) => h(i === 0 ? 'strong' : 'span', {}, l)));
  el.hidden = false;
  const margem = 14;
  const { innerWidth: w, innerHeight: a } = window;
  const r = el.getBoundingClientRect();
  let x = evento.clientX + margem, y = evento.clientY + margem;
  if (x + r.width > w - 8) x = evento.clientX - r.width - margem;
  if (y + r.height > a - 8) y = evento.clientY - r.height - margem;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}
export function esconderDica() { dica().hidden = true; }

// replaceChildren que aceita lista aninhada e ignora null — o nativo
// transformaria os dois em texto ("[object HTMLButtonElement]", "null").
export function trocar(el, ...filhos) {
  el.replaceChildren(...filhos.flat(Infinity).filter((f) => f != null && f !== false));
}

// ---------- transição 2027 (resultado da eleição de 2026) ----------

export const SITUACOES = {
  fica: { icone: '↻', rotulo: 'Fica em 2027' },
  sai: { icone: '→', rotulo: 'Sai em 2027' },
  muda: { icone: '⇄', rotulo: 'Muda de cargo' },
  'segundo-turno': { icone: '②', rotulo: 'No 2º turno' },
  depende: { icone: '?', rotulo: 'Em aberto' },
};

export const CARGO_ELEITO = { governador: 'Governador(a) eleito(a)', senador: 'Senador(a) eleito(a)', deputado: 'Deputado(a) federal eleito(a)' };

export const destinoDe = (pessoa, dados) => dados.eleicao?.destino?.[pessoa.id] ?? null;

// Etiqueta curta com o ícone da situação; null pra quem não tem (STF, prefeitos).
export function selo(pessoa, dados) {
  const d = destinoDe(pessoa, dados);
  if (!d) return null;
  const s = SITUACOES[d.situacao];
  return h('span', { class: `selo selo-${d.situacao}`, title: d.texto }, h('i', { 'aria-hidden': 'true' }, s.icone), s.rotulo);
}
