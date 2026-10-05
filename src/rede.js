// Rede de poder: árvore radial de bolinhas.
//
//   República ─┬─ Presidente ─┬─ Vice
//              │              └─ ministros
//              └─ regiões ─ UFs ─┬─ governador
//                                └─ senadores
//
// Tamanho da bolinha = cargo; cor = posição do partido.

import * as d3 from 'd3';
import { CARGOS, corDe, defsHachura, mostrarDica, esconderDica, textoPartido, ondeAtua } from './comum.js';

const R = 360;

function montarArvore(dados) {
  const folha = (p) => ({ tipo: 'pessoa', pessoa: p });
  const presidente = dados.pessoaPorId.get('presidente');
  const executivo = {
    ...folha(presidente),
    children: dados.pessoas.filter((p) => p.cargo === 'vice' || p.cargo === 'ministro').map(folha),
  };
  const regioes = d3.groups(dados.ufs, (u) => u.regiao).map(([regiao, ufs]) => ({
    tipo: 'grupo', rotulo: regiao,
    children: ufs.map((u) => ({
      tipo: 'uf', rotulo: u.sigla, uf: u,
      children: dados.pessoas
        .filter((p) => p.uf === u.sigla)
        .sort((a, b) => (a.cargo === 'governador' ? -1 : 1) - (b.cargo === 'governador' ? -1 : 1))
        .map(folha),
    })),
  }));
  return { tipo: 'raiz', rotulo: 'República', children: [executivo, ...regioes] };
}

export function criarRede(raiz, dados, { aoEscolherPessoa, aoEscolherUf }) {
  const arvore = d3.hierarchy(montarArvore(dados));
  d3.tree().size([2 * Math.PI, R]).separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / a.depth)(arvore);

  // O Executivo tem um nível a menos que os estados; sem isto os ministros
  // ficariam a meio caminho do centro, embolados.
  arvore.each((n) => {
    if (n.data.tipo === 'pessoa' && n.data.pessoa.cargo !== 'presidente') n.y = R;
    if (n.data.tipo === 'pessoa' && n.data.pessoa.cargo === 'presidente') n.y = R * 0.45;
  });

  const lado = (R + 70) * 2;
  const svg = d3.create('svg').attr('viewBox', [-lado / 2, -lado / 2, lado, lado]).attr('role', 'img')
    .attr('aria-label', 'Árvore radial do poder: do centro saem o Executivo federal e as cinco regiões, com estados, governadores e senadores. A aba Lista traz os mesmos dados em tabela.');
  defsHachura(svg);
  const palco = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.8, 6]).on('zoom', (ev) => palco.attr('transform', ev.transform)));

  const xy = (n) => [n.y * Math.cos(n.x - Math.PI / 2), n.y * Math.sin(n.x - Math.PI / 2)];

  palco.append('g').attr('class', 'elos').selectAll('path').data(arvore.links()).join('path')
    .attr('d', d3.linkRadial().angle((n) => n.x).radius((n) => n.y));

  const nos = palco.append('g').selectAll('g').data(arvore.descendants()).join('g')
    .attr('class', (n) => `no no-${n.data.tipo}`)
    .attr('transform', (n) => `translate(${xy(n)})`);

  const raioDe = (n) => (n.data.tipo === 'pessoa' ? CARGOS[n.data.pessoa.cargo].raio : n.data.tipo === 'raiz' ? 6 : 3.5);

  // Alvo de clique maior que a marca: bolinha de 5px é difícil de acertar.
  nos.filter((n) => n.data.tipo !== 'grupo' && n.data.tipo !== 'raiz').append('circle')
    .attr('class', 'alvo').attr('r', (n) => Math.max(raioDe(n) + 4, 10));

  const marcas = nos.append('circle').attr('class', 'marca').attr('r', raioDe);

  nos.filter((n) => n.data.tipo !== 'pessoa' || n.data.pessoa.cargo === 'presidente')
    .append('text')
    .attr('dy', '0.32em')
    .each(function (n) {
      const t = d3.select(this);
      if (n.data.tipo === 'raiz') return t.attr('y', -14).attr('text-anchor', 'middle').text(n.data.rotulo);
      if (n.data.tipo === 'pessoa') return t.attr('y', -18).attr('text-anchor', 'middle').text(n.data.pessoa.nome);
      const esquerda = n.x > Math.PI;
      const graus = (n.x * 180) / Math.PI - 90;
      t.attr('transform', `rotate(${esquerda ? graus + 180 : graus})`)
        .attr('x', esquerda ? -8 : 8)
        .attr('text-anchor', esquerda ? 'end' : 'start')
        .text(n.data.rotulo);
    });

  nos.filter((n) => n.data.tipo === 'pessoa')
    .on('pointermove', (ev, n) => {
      const p = n.data.pessoa;
      mostrarDica(ev, [p.nome, `${CARGOS[p.cargo].curto} · ${ondeAtua(p, dados)}`, textoPartido(p)]);
    })
    .on('pointerleave', esconderDica)
    .on('click', (ev, n) => aoEscolherPessoa(n.data.pessoa.id));

  nos.filter((n) => n.data.tipo === 'uf')
    .on('pointermove', (ev, n) => mostrarDica(ev, [n.data.uf.nome, 'ver governador e senadores']))
    .on('pointerleave', esconderDica)
    .on('click', (ev, n) => aoEscolherUf(n.data.uf.sigla));

  raiz.append(svg.node());

  return {
    pintar(escala) {
      marcas.filter((n) => n.data.tipo === 'pessoa').attr('fill', (n) => corDe(n.data.pessoa, dados, escala));
    },
    selecionar({ pessoa, uf }) {
      nos.classed('ativo', (n) => (n.data.tipo === 'pessoa' && n.data.pessoa.id === pessoa)
        || (n.data.tipo === 'uf' && n.data.uf.sigla === uf));
    },
  };
}
