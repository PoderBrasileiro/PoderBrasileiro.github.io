// Aba Mundo: quem governa cada país, em dois modos de leitura.
//
//   Tempo no poder — quantos anos a mesma pessoa está no cargo. É a métrica
//     com cobertura quase completa (192 de 195) e não depende de juízo de
//     valor: ou a pessoa está lá há 3 anos, ou há 40.
//   Espectro — a nota de 0 a 10 do Global Party Survey, onde existe. Cobre
//     menos e envelhece, por isso não é o padrão.

import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { h, trocar, escalaEspectro, mostrarDica, esconderDica, fmtNum } from './comum.js';

const L = 900, A = 460;

// Monarca hereditário e presidente que não sai são histórias diferentes, e
// o tempo no cargo sozinho embaralha as duas: o rei da Suécia está lá há 53
// anos sem nunca ter disputado eleição.
export const ehMonarquia = (p) => /monarqui|monarch/i.test(p.forma ?? '');

export const anosNoCargo = (desde) => (desde ? (Date.now() - Date.parse(desde)) / 31557600000 : null);

// Quem manda de fato: onde o chefe de governo tem partido, é ele; senão, o
// chefe de Estado. Em presidencialismo são a mesma pessoa.
export const mandaNoPais = (p) => (p.governo?.partido ? p.governo : p.estado ?? p.governo);

// Degradê de um tom só, claro para escuro, como manda uma escala de magnitude.
// Os cortes são 4, 10 e 20 anos: um mandato, dois ou três, e "está lá faz
// tempo demais para ter sido só eleição".
const CORTES = [0, 4, 10, 20, 50];
export function corDoTempo(anos, escuro) {
  if (anos == null) return null;
  // Um tom só, do mais claro ao mais forte. O primeiro passo precisa ser
  // visível contra o fundo, senão país recém-eleito some do mapa.
  const tons = escuro
    ? ['#5d5a4e', '#887d45', '#b39a3c', '#d9b835', '#ffd84a']
    : ['#e3dcc2', '#cdb87e', '#ad9340', '#86681b', '#53400a'];
  const i = CORTES.findIndex((c, k) => anos < (CORTES[k + 1] ?? Infinity));
  return tons[Math.min(i, tons.length - 1)];
}

export function criarMundo(raiz, dados, { aoEscolherPais, aoVerBrasil }) {
  const paises = dados.mundo?.paises ?? [];
  const porNum = new Map(paises.map((p) => [p.num, p]));

  let modo = 'tempo';
  const svg = d3.create('svg').attr('viewBox', `0 0 ${L} ${A}`).attr('role', 'img')
    .attr('aria-label', 'Mapa-múndi. A aba Lista traz os mesmos dados em tabela.');
  const defs = svg.append('defs');
  const p = defs.append('pattern').attr('id', 'hachura-mundo').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  p.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'var(--fundo-2)');
  p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', 'var(--texto-3)').attr('stroke-width', 2);

  // Natural Earth em TopoJSON; a projeção corta a Antártida, que não tem país.
  const malha = feature(dados.mundoMalha, dados.mundoMalha.objects.countries);
  const visiveis = { ...malha, features: malha.features.filter((f) => String(f.id) !== '010') };
  const caminho = d3.geoPath(d3.geoNaturalEarth1().fitSize([L, A], visiveis));

  const formas = svg.append('g').selectAll('path').data(visiveis.features).join('path')
    .attr('class', 'pais')
    .attr('d', caminho)
    .on('pointermove', (ev, f) => {
      const d = porNum.get(Number(f.id));
      if (!d) return mostrarDica(ev, [f.properties.name, 'fora da lista de países soberanos']);
      const c = mandaNoPais(d);
      const anos = anosNoCargo(d.estado?.desde ?? d.governo?.desde);
      mostrarDica(ev, [d.nome, c?.nome ?? 'sem dado',
        modo === 'tempo'
          ? (anos == null ? 'tempo no cargo não informado' : `há ${fmtNum(anos, 0)} ano${anos >= 2 ? 's' : ''} no cargo`)
          : (c?.posicao != null ? `posição ${fmtNum(c.posicao, 1)} de 10` : c?.posicaoRotulo ?? 'sem posição conhecida')]);
    })
    .on('pointerleave', esconderDica)
    .on('click', (ev, f) => { const d = porNum.get(Number(f.id)); if (d) aoEscolherPais(d.iso); });

  const chaves = h('div', { class: 'mundo-modos', role: 'group', 'aria-label': 'O que a cor mostra' },
    h('button', { 'data-modo': 'tempo', 'aria-selected': 'true' }, 'Tempo no poder'),
    h('button', { 'data-modo': 'espectro', 'aria-selected': 'false' }, 'Esquerda e direita'));
  for (const b of chaves.children) {
    b.addEventListener('click', () => {
      modo = b.dataset.modo;
      for (const o of chaves.children) o.setAttribute('aria-selected', String(o === b));
      pintar();
    });
  }

  const atalho = h('button', { class: 'federal-item', onclick: aoVerBrasil },
    h('span', {}, h('small', {}, 'Em profundidade'), h('b', {}, 'Ver o Brasil por dentro')));

  raiz.append(h('div', { class: 'mundo-topo' }, chaves, atalho), svg.node());

  function pintar() {
    const escuro = getComputedStyle(document.documentElement).colorScheme.includes('dark');
    const esp = escalaEspectro();
    formas.attr('fill', (f) => {
      const d = porNum.get(Number(f.id));
      if (!d) return 'var(--fundo-2)';
      if (modo === 'tempo') return corDoTempo(anosNoCargo(d.estado?.desde ?? d.governo?.desde), escuro) ?? 'url(#hachura-mundo)';
      const pos = mandaNoPais(d)?.posicao;
      return pos == null ? 'url(#hachura-mundo)' : esp(pos);
    });
    raiz.dispatchEvent(new CustomEvent('modo', { detail: modo, bubbles: true }));
  }

  return {
    get modo() { return modo; },
    pintar,
    selecionar({ pais }) {
      formas.classed('ativa', (f) => porNum.get(Number(f.id))?.iso === pais);
      formas.filter((f) => porNum.get(Number(f.id))?.iso === pais).raise();
    },
  };
}
