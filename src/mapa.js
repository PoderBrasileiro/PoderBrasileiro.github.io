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
    .on('pointerenter', (ev, f) => pedirMalha(f.properties.sigla).catch(() => {}))
    .on('click', (ev, f) => aoEscolherUf(f.properties.sigla));

  // Sigla só onde cabe; os estados pequenos ficam por conta dos botões abaixo.
  gBrasil.append('g').attr('class', 'uf-rotulos').selectAll('text')
    .data(dados.malha.features.filter((f) => caminho.area(f) > 900)).join('text')
    .attr('transform', (f) => `translate(${caminho.centroid(f)})`)
    .attr('dy', '0.35em')
    .text((f) => f.properties.sigla);

  const botoes = h('div', { class: 'ufs' }, dados.ufs.map((u) =>
    h('button', { 'data-uf': u.sigla, title: u.nome, onpointerenter: () => pedirMalha(u.sigla).catch(() => {}), onclick: () => aoEscolherUf(u.sigla) }, u.sigla)));

  raiz.append(federal, svg.node(), botoes);

  // ---------- nível municipal ----------

  const malhas = new Map();   // UF -> Promise da malha
  let escala = null;
  let zoomAtual = null;      // guardado pra animar a volta
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

  // Para onde o mapa do Brasil tem que ir pra que o estado encha a tela. Só
  // depende do mapa do país, então o zoom pode começar no instante do clique —
  // antes era preciso esperar a malha do estado (meio mega, quase meio
  // segundo), e o clique parecia não fazer nada até tudo trocar de uma vez.
  //
  // É a mesma regra do fitSize que posiciona o mapa do estado, então, quando o
  // zoom termina, os dois mostram o estado exatamente no mesmo lugar e a
  // passagem de um pro outro não tem salto.
  function zoomNoEstado(uf) {
    const f = dados.malha.features.find((x) => x.properties.sigla === uf);
    if (!f) return null;
    const [[x0, y0], [x1, y1]] = caminho.bounds(f);
    const k = Math.min(L / (x1 - x0), A / (y1 - y0));
    return `translate(${L / 2 - (k * (x0 + x1)) / 2},${A / 2 - (k * (y0 + y1)) / 2}) scale(${k})`;
  }

  // Baixa a malha do estado. Chamada no passar do mouse também: assim, na hora
  // do clique ela quase sempre já está em memória.
  function pedirMalha(uf) {
    if (!malhas.has(uf)) malhas.set(uf, carregarMalhaUf(uf).then((m) => (corrigirSentido(m), m)));
    return malhas.get(uf);
  }

  function mostrarBrasil() {
    const volta = zoomAtual;
    ufAberta = null;
    zoomAtual = null;
    municipios = null;
    voltar.hidden = true;
    // O país volta do zoom; o estado se apaga por cima enquanto isso acontece.
    gBrasil.interrupt().style('display', null).style('opacity', 1)
      .attr('transform', volta ?? null)
      .transition().duration(dur(DURACAO)).ease(SUAVE)
      .attr('transform', null);
    gUf.interrupt().transition().duration(dur(DURACAO * 0.45)).ease(d3.easeCubicIn)
      .style('opacity', 0)
      .on('end interrupt', () => { if (!ufAberta) gUf.style('display', 'none').selectAll('*').remove(); });
  }

  async function abrirUf(uf) {
    ufPedida = uf;
    if (ufAberta === uf) return pintarMunicipios();

    // O zoom começa aqui, no clique, sem esperar nada da rede.
    const alvo = zoomNoEstado(uf);
    const partiu = performance.now();
    if (!ufAberta) {
      gBrasil.interrupt().style('display', null)
        .transition().duration(dur(DURACAO)).ease(SUAVE)
        .attr('transform', alvo)
        .transition().duration(0).style('opacity', 0)
        .on('end interrupt', () => { if (ufAberta) gBrasil.style('display', 'none'); });
    }

    let malha;
    try { malha = await pedirMalha(uf); } catch { malhas.delete(uf); return mostrarBrasil(); }
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
    zoomAtual = alvo;
    voltar.hidden = false;
    pintarMunicipios();

    // O estado entra bem no fim do zoom, quando os dois mapas já o mostram no
    // mesmo lugar — daí a troca não tem salto. Se a malha demorou mais que o
    // zoom, entra na hora.
    const falta = Math.max(0, dur(DURACAO) - (performance.now() - partiu));
    const abertura = dur(260);
    gUf.interrupt().style('display', null).attr('transform', null).style('opacity', 0)
      .transition().delay(Math.max(0, falta - abertura)).duration(abertura).ease(d3.easeCubicOut)
      .style('opacity', 1);
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
