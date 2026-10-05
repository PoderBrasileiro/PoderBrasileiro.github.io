// Mapa do Brasil: cada UF pintada pela posição do partido do governador.

import * as d3 from 'd3';
import { h, corDe, defsHachura, mostrarDica, esconderDica, textoPartido } from './comum.js';

const L = 720, A = 680;

// O IBGE entrega alguns polígonos com os anéis no sentido que o d3-geo lê
// como "o planeta inteiro menos o estado". Área maior que meio globo denuncia.
function corrigirSentido(malha) {
  for (const f of malha.features) {
    if (d3.geoArea(f) <= 2 * Math.PI) continue;
    const g = f.geometry;
    if (g.type === 'Polygon') g.coordinates.forEach((anel) => anel.reverse());
    else g.coordinates.forEach((pol) => pol.forEach((anel) => anel.reverse()));
  }
}

export function criarMapa(raiz, dados, { aoEscolherUf, aoEscolherPessoa, aoVerMinistros }) {
  corrigirSentido(dados.malha);

  // Faixa do governo federal, que não tem lugar no mapa.
  const federal = h('div', { class: 'federal' });
  for (const id of ['presidente', 'vice']) {
    const p = dados.pessoaPorId.get(id);
    federal.append(h('button', { class: 'federal-item', 'data-id': id, onclick: () => aoEscolherPessoa(id) },
      h('span', { class: 'bolinha' }),
      h('span', {}, h('small', {}, id === 'presidente' ? 'Presidente' : 'Vice-presidente'), h('b', {}, p.nome))));
  }
  const nMin = dados.pessoas.filter((p) => p.cargo === 'ministro').length;
  federal.append(h('button', { class: 'federal-item', onclick: aoVerMinistros },
    h('span', {}, h('small', {}, 'Esplanada'), h('b', {}, `${nMin} ministros`))));

  const svg = d3.create('svg').attr('viewBox', `0 0 ${L} ${A}`).attr('role', 'img')
    .attr('aria-label', 'Mapa do Brasil por unidade federativa. Use a lista de siglas abaixo para navegar pelo teclado.');
  defsHachura(svg);
  const projecao = d3.geoMercator().fitSize([L, A], dados.malha);
  const caminho = d3.geoPath(projecao);

  const estados = svg.append('g').selectAll('path').data(dados.malha.features).join('path')
    .attr('class', 'uf')
    .attr('d', caminho)
    .on('pointermove', (ev, f) => {
      const g = dados.governadorPorUf.get(f.properties.sigla);
      mostrarDica(ev, [f.properties.nome, g ? `${g.nome} · ${textoPartido(g)}` : 'governador não encontrado']);
    })
    .on('pointerleave', esconderDica)
    .on('click', (ev, f) => aoEscolherUf(f.properties.sigla));

  // Sigla só onde cabe; os estados pequenos ficam por conta dos botões abaixo.
  svg.append('g').attr('class', 'uf-rotulos').selectAll('text')
    .data(dados.malha.features.filter((f) => caminho.area(f) > 900)).join('text')
    .attr('transform', (f) => `translate(${caminho.centroid(f)})`)
    .attr('dy', '0.35em')
    .text((f) => f.properties.sigla);

  const botoes = h('div', { class: 'ufs' }, dados.ufs.map((u) =>
    h('button', { 'data-uf': u.sigla, title: u.nome, onclick: () => aoEscolherUf(u.sigla) }, u.sigla)));

  raiz.append(federal, svg.node(), botoes);

  return {
    pintar(escala) {
      estados.attr('fill', (f) => {
        const g = dados.governadorPorUf.get(f.properties.sigla);
        return g ? corDe(g, dados, escala) : 'url(#hachura)';
      });
      for (const el of federal.querySelectorAll('[data-id]')) {
        const p = dados.pessoaPorId.get(el.dataset.id);
        const pos = dados.partidos[p.partido]?.posicao;
        el.querySelector('.bolinha').style.background = pos == null ? 'var(--texto-3)' : escala(pos);
      }
    },
    selecionar({ uf }) {
      estados.classed('ativa', (f) => f.properties.sigla === uf);
      estados.filter((f) => f.properties.sigla === uf).raise();
      for (const b of botoes.children) b.setAttribute('aria-pressed', String(b.dataset.uf === uf));
    },
  };
}
