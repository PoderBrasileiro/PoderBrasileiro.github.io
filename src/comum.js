// Ajudantes usados pelas três visualizações e pelo painel.

import * as d3 from 'd3';

export const CARGOS = {
  presidente: { rotulo: 'Presidente da República', curto: 'Presidente', raio: 11 },
  vice: { rotulo: 'Vice-presidente da República', curto: 'Vice-presidente', raio: 9 },
  ministro: { rotulo: 'Ministro(a) de Estado', curto: 'Ministro(a)', raio: 5.5 },
  governador: { rotulo: 'Governador(a)', curto: 'Governador(a)', raio: 7.5 },
  senador: { rotulo: 'Senador(a)', curto: 'Senador(a)', raio: 5 },
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
export function escalaEspectro() {
  return d3.scaleLinear()
    .domain([0, 5, 10])
    .range([css('--esq'), css('--meio'), css('--dir')])
    .interpolate(d3.interpolateRgb)
    .clamp(true);
}

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
  if (pessoa.partido === undefined) return 'partido não informado';
  return pessoa.partido ?? 'sem partido';
}

export function ondeAtua(pessoa, dados) {
  if (pessoa.cargo === 'ministro') return pessoa.pasta;
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
