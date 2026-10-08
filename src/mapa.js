// Mapa em dois níveis: o Brasil por UF (cor = partido do governador) e,
// ao escolher um estado, os municípios dele (cor = partido do prefeito).

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

export function criarMapa(raiz, dados, { aoEscolherUf, aoEscolherPessoa, aoVerMinistros, carregarMalhaUf }) {
  corrigirSentido(dados.malha);

  // Faixa do governo federal, que não tem lugar no mapa.
  const federal = h('div', { class: 'federal' });
  const voltar = h('button', { class: 'federal-item voltar-brasil', hidden: true, onclick: () => aoEscolherUf(null) }, '← Brasil');
  federal.append(voltar);
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
  const caminho = d3.geoPath(d3.geoMercator().fitSize([L, A], dados.malha));

  const gBrasil = svg.append('g');
  const gUf = svg.append('g').style('display', 'none');

  const estados = gBrasil.append('g').selectAll('path').data(dados.malha.features).join('path')
    .attr('class', 'uf')
    .attr('d', caminho)
    .on('pointermove', (ev, f) => {
      const g = dados.governadorPorUf.get(f.properties.sigla);
      mostrarDica(ev, [f.properties.nome, g ? `${g.nome} · ${textoPartido(g)}` : 'governador não encontrado']);
    })
    .on('pointerleave', esconderDica)
    .on('click', (ev, f) => aoEscolherUf(f.properties.sigla));

  // Sigla só onde cabe; os estados pequenos ficam por conta dos botões abaixo.
  gBrasil.append('g').attr('class', 'uf-rotulos').selectAll('text')
    .data(dados.malha.features.filter((f) => caminho.area(f) > 900)).join('text')
    .attr('transform', (f) => `translate(${caminho.centroid(f)})`)
    .attr('dy', '0.35em')
    .text((f) => f.properties.sigla);

  const botoes = h('div', { class: 'ufs' }, dados.ufs.map((u) =>
    h('button', { 'data-uf': u.sigla, title: u.nome, onclick: () => aoEscolherUf(u.sigla) }, u.sigla)));

  raiz.append(federal, svg.node(), botoes);

  // ---------- nível municipal ----------

  const malhas = new Map();   // UF -> Promise da malha
  let escala = null;
  let encaixeAtual = null;   // guardado pra animar a volta
  let ufAberta = null;        // UF cujos municípios estão desenhados
  let ufPedida = null;        // última UF pedida (a malha chega depois)
  let municipioAtivo = null;
  let municipios = null;

  const prefeitoDe = (f) => dados.pessoaPorId.get(`prefeito-${f.properties.codarea}`);

  function pintarMunicipios() {
    if (!municipios || !escala) return;
    municipios
      .attr('fill', (f) => { const p = prefeitoDe(f); return p ? corDe(p, dados, escala) : 'url(#hachura)'; })
      .classed('ativa', (f) => f.properties.codarea === municipioAtivo);
    municipios.filter((f) => f.properties.codarea === municipioAtivo).raise();
  }

  // Movimento da troca de nível: o Brasil se aproxima do estado escolhido e
  // some; o estado entra vindo de um pouco maior. Dá a sensação de descer um
  // degrau em vez de duas imagens trocadas de lugar.
  const RAPIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = (ms) => (RAPIDO ? 0 : ms);

  const DURACAO = 620;
  const SUAVE = d3.easeCubicInOut;

  // O transform que leva um ponto do mapa do Brasil a ficar onde ele está no
  // mapa só daquele estado. É o que faz o zoom ser contínuo: o estado não
  // troca de lugar, ele cresce do tamanho que tinha até encher a tela.
  function encaixe(uf, caminhoUf, malhaUf) {
    const f = dados.malha.features.find((x) => x.properties.sigla === uf);
    if (!f) return null;
    const [[x0, y0], [x1, y1]] = caminho.bounds(f);            // onde o estado está no Brasil
    const [[u0, v0], [u1, v1]] = caminhoUf.bounds(malhaUf);    // onde ele está sozinho
    const k = Math.min((x1 - x0) / (u1 - u0), (y1 - y0) / (v1 - v0));
    return {
      // Estado pequeno no mapa do país: é este transform aplicado ao mapa do
      // estado (começa miúdo, no lugar certo, e abre).
      doEstado: `translate(${(x0 + x1) / 2 - (k * (u0 + u1)) / 2},${(y0 + y1) / 2 - (k * (v0 + v1)) / 2}) scale(${k})`,
      // O inverso, aplicado ao mapa do país: ele se aproxima do estado.
      doPais: `translate(${L / 2 - (x0 + x1) / 2 / k},${A / 2 - (y0 + y1) / 2 / k}) scale(${1 / k})`,
    };
  }

  function mostrarBrasil() {
    const volta = encaixeAtual;
    ufAberta = null;
    encaixeAtual = null;
    municipios = null;
    voltar.hidden = true;
    gBrasil.interrupt().style('display', null)
      .transition().duration(dur(DURACAO)).ease(SUAVE)
      .attr('transform', null).style('opacity', 1);
    if (!volta) return gUf.style('display', 'none').selectAll('*').remove();
    // O estado encolhe de volta pro lugar que ocupa no país, em vez de sumir.
    gUf.interrupt().transition().duration(dur(DURACAO)).ease(SUAVE)
      .attr('transform', volta.doEstado).style('opacity', 0)
      .on('end interrupt', () => { if (!ufAberta) gUf.style('display', 'none').selectAll('*').remove(); });
  }

  async function abrirUf(uf) {
    ufPedida = uf;
    if (ufAberta === uf) return pintarMunicipios();
    if (!malhas.has(uf)) malhas.set(uf, carregarMalhaUf(uf).then((m) => (corrigirSentido(m), m)));
    let malha;
    try { malha = await malhas.get(uf); } catch { malhas.delete(uf); return; }   // sem malha: fica o mapa do Brasil
    if (ufPedida !== uf) return;   // o usuário já clicou em outra coisa
    const caminhoUf = d3.geoPath(d3.geoMercator().fitSize([L, A], malha));
    gUf.selectAll('*').remove();
    municipios = gUf.selectAll('path').data(malha.features).join('path')
      .attr('class', 'municipio')
      .attr('d', caminhoUf)
      .on('pointermove', (ev, f) => {
        const p = prefeitoDe(f);
        mostrarDica(ev, p ? [p.municipio, `${p.nome} · ${textoPartido(p)}`] : [dados.nomeMunicipio?.get(f.properties.codarea) ?? 'Município', 'sem prefeito eleito nos dados']);
      })
      .on('pointerleave', esconderDica)
      .on('click', (ev, f) => { const p = prefeitoDe(f); if (p) aoEscolherPessoa(p.id); });
    ufAberta = uf;
    encaixeAtual = encaixe(uf, caminhoUf, malha);
    voltar.hidden = false;
    pintarMunicipios();

    // Os dois mapas se movem juntos: o país se aproxima e desaparece enquanto
    // o estado cresce do mesmo ponto. É um único movimento, não uma troca.
    gBrasil.interrupt().transition().duration(dur(DURACAO)).ease(SUAVE)
      .attr('transform', encaixeAtual?.doPais ?? null).style('opacity', 0)
      .on('end interrupt', () => { if (ufAberta) gBrasil.style('display', 'none'); });
    gUf.interrupt().style('display', null)
      .attr('transform', encaixeAtual?.doEstado ?? null).style('opacity', 0)
      .transition().duration(dur(DURACAO)).ease(SUAVE)
      .attr('transform', null).style('opacity', 1);
  }

  return {
    pintar(nova) {
      escala = nova;
      estados.attr('fill', (f) => {
        const g = dados.governadorPorUf.get(f.properties.sigla);
        return g ? corDe(g, dados, escala) : 'url(#hachura)';
      });
      for (const el of federal.querySelectorAll('[data-id]')) {
        const p = dados.pessoaPorId.get(el.dataset.id);
        const pos = dados.partidos[p.partido]?.posicao;
        el.querySelector('.bolinha').style.background = pos == null ? 'var(--texto-3)' : escala(pos);
      }
      pintarMunicipios();
    },
    selecionar({ uf, pessoa }) {
      estados.classed('ativa', (f) => f.properties.sigla === uf);
      estados.filter((f) => f.properties.sigla === uf).raise();
      for (const b of botoes.children) b.setAttribute('aria-pressed', String(b.dataset.uf === uf));
      const p = pessoa && dados.pessoaPorId.get(pessoa);
      municipioAtivo = p?.cargo === 'prefeito' ? p.ibge : null;
      // O DF não tem municípios: continua destacado no mapa do Brasil.
      if (uf && uf !== 'DF') abrirUf(uf);
      else { ufPedida = null; mostrarBrasil(); }
    },
  };
}
