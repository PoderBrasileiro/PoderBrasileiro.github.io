// O mapa-múndi, que é o mapa principal do site.
//
// Dá pra arrastar, aproximar com a roda ou com os botões, pular pra uma região
// e abrir um país com dois cliques — e aí entram as divisões internas dele
// (estados, províncias, departamentos), que chegam num arquivo próprio.
//
// Dois modos de leitura:
//
//   Esquerda e direita — o padrão. A cor é a faixa do partido que governa, nas
//     mesmas cinco faixas que o site usa no Brasil. Quem governa sem partido
//     tem cor própria: é informação, não falta de dado.
//   Tempo no poder — quantos anos a mesma pessoa está no cargo. Entra como
//     segunda leitura porque não depende de juízo de valor nenhum.
//
// A projeção é ajustada ao mundo inteiro UMA vez. Por isso as divisões
// internas, que vêm em latitude e longitude, caem exatamente dentro do país
// sem reprojetar nada: o zoom é uma transformação só, aplicada a tudo junto, e
// a aproximação sai contínua em vez de trocar um mapa por outro.

import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { h, escalaEspectro, mostrarDica, esconderDica, fmtNum, FAIXAS } from './comum.js';

const L = 960, A = 500;
const ZOOM_MAX = 60;

export const ehMonarquia = (p) => /monarqui|monarch/i.test(p.forma ?? '');
export const anosNoCargo = (desde) => (desde ? (Date.now() - Date.parse(desde)) / 31557600000 : null);

// Quem manda de fato. Dois casos, e a diferença importa:
//
//   Chefes de partidos diferentes — é parlamentarismo de verdade, e quem
//     governa é o chefe de governo (na Alemanha, o chanceler, não o
//     presidente).
//   Mesmo partido — o cargo de cima é o que vale: na China quem manda é Xi
//     Jinping, não o primeiro-ministro, e a regra de cima elegia o errado.
export const mandaNoPais = (p) => {
  const e = p.estado, g = p.governo;
  if (!g?.partido) return e?.partido ? e : g ?? e;
  if (!e?.partido) return g;
  return e.partido === g.partido ? e : g;
};

// A faixa do país, de qualquer um dos dois cargos que a tiver.
export const faixaDoPais = (p) => mandaNoPais(p)?.faixa ?? p.governo?.faixa ?? p.estado?.faixa ?? null;

// Onde cada faixa cai na régua de 0 a 10, só pra tirar a cor da mesma escala
// que o resto do site usa. Esquerda e direita ficam fora do intervalo em que a
// escala satura (2 e 8), então saem na cor cheia — que é o que se quer num
// mapa: país bem à esquerda, vermelho forte.
const VALOR_DA_FAIXA = { esquerda: 1.5, 'centro-esquerda': 4, centro: 5, 'centro-direita': 6, direita: 8.5 };
export const corDaFaixa = (faixa, escala) => (faixa in VALOR_DA_FAIXA ? escala(VALOR_DA_FAIXA[faixa]) : null);

const CORTES = [0, 4, 10, 20, 50];
export function corDoTempo(anos, escuro) {
  if (anos == null) return null;
  const tons = escuro
    ? ['#5d5a4e', '#887d45', '#b39a3c', '#d9b835', '#ffd84a']
    : ['#e3dcc2', '#cdb87e', '#ad9340', '#86681b', '#53400a'];
  const i = CORTES.findIndex((c, k) => anos < (CORTES[k + 1] ?? Infinity));
  return tons[Math.min(i, tons.length - 1)];
}

// Retângulos em latitude e longitude pros atalhos de região. Viram caixa na
// tela projetando ponto a ponto, com pontos no meio dos lados e não só nos
// cantos: a projeção curva as linhas retas, e quatro cantos sozinhos dariam
// uma caixa menor que a região de verdade.
const REGIOES = {
  Mundo: null,
  'Américas': [-170, -56, -32, 72],
  Europa: [-26, 34, 46, 71],
  'África': [-19, -36, 53, 38],
  'Ásia': [25, -11, 150, 56],
  Oceania: [110, -50, 179, -5],
};

function caixaDaRegiao([o, s, l, n], projecao) {
  const passo = (a, b) => d3.range(a, b, (b - a) / 12).concat(b);
  const pontos = [];
  for (const x of passo(o, l)) pontos.push([x, s], [x, n]);
  for (const y of passo(s, n)) pontos.push([o, y], [l, y]);
  // Projetados um a um de propósito. Passar o retângulo como polígono pro
  // geoPath não funciona: pro d3 o anel enrolado ao contrário é "o planeta
  // inteiro menos a região", e aí a caixa dava o mundo e o zoom não saía do 1.
  const tela = pontos.map((c) => projecao(c)).filter(Boolean);
  return [
    [Math.min(...tela.map((c) => c[0])), Math.min(...tela.map((c) => c[1]))],
    [Math.max(...tela.map((c) => c[0])), Math.max(...tela.map((c) => c[1]))],
  ];
}

export function criarMundo(raiz, dados, { aoEscolherPais, aoEscolherUf, aoEscolherDivisao, carregarDivisoes, carregarSubnacional }) {
  const paises = dados.mundo?.paises ?? [];
  const porNum = new Map(paises.map((p) => [p.num, p]));
  const porIso = new Map(paises.map((p) => [p.iso, p]));

  let modo = 'espectro';
  let escala = escalaEspectro();
  let paisAberto = null;      // ISO do país cujas divisões estão na tela
  let paisPedido = null;
  let k = 1;                  // fator de zoom atual
  let divisaoAtiva = null;    // código ISO 3166-2 da divisão escolhida
  const divisoes = new Map(); // ISO -> Promise do TopoJSON
  let subnacional = null;     // ISO 3166-2 -> quem governa a divisão
  let pedindoSubnacional = null;

  const svg = d3.create('svg').attr('viewBox', `0 0 ${L} ${A}`).attr('class', 'mapa-mundi')
    .attr('role', 'img').attr('aria-label', 'Mapa-múndi. A aba Lista traz os mesmos dados em tabela.');

  const defs = svg.append('defs');
  const pat = defs.append('pattern').attr('id', 'hachura-mundo').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  pat.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'var(--fundo-2)');
  pat.append('line').attr('y2', 6).attr('stroke', 'var(--texto-3)').attr('stroke-width', 2);

  const palco = svg.append('g');
  const gPaises = palco.append('g');
  const gDivisoes = palco.append('g').attr('class', 'divisoes');
  const gRotulos = palco.append('g').attr('class', 'mundo-rotulos').attr('font-size', 11);
  const gRotulosDiv = palco.append('g').attr('class', 'mundo-rotulos divisao-rotulos').attr('font-size', 9);

  // Natural Earth em TopoJSON; a Antártida sai porque não tem país.
  const malha = feature(dados.mundoMalha, dados.mundoMalha.objects.countries);
  const visiveis = { ...malha, features: malha.features.filter((f) => String(f.id) !== '010') };
  const projecao = d3.geoNaturalEarth1().fitSize([L, A], visiveis);
  const caminho = d3.geoPath(projecao);

  const dadoDe = (f) => porNum.get(Number(f.id));

  // País espalhado estraga as duas contas que o mapa faz com a forma: onde
  // pôr o nome e pra onde levar o zoom. A França tem a Guiana do outro lado
  // do Atlântico, os Estados Unidos têm o Havaí no meio do Pacífico — e a
  // caixa da forma inteira, nesses casos, é quase o planeta: o nome saía solto
  // no oceano e o "zoom" no país ficava em escala 1, parado.
  //
  // Daqui saem os pedaços de uma forma, do maior pro menor, com a área.
  function pedacos(f) {
    const g = f.geometry;
    if (g?.type !== 'MultiPolygon' || g.coordinates.length < 2) return null;
    return g.coordinates
      .map((coordinates) => { const pol = { type: 'Polygon', coordinates }; return { pol, area: caminho.area(pol) }; })
      .sort((a, b) => b.area - a.area);
  }

  // O nome vai no centro do maior pedaço.
  function centro(f) {
    const ps = pedacos(f);
    return caminho.centroid(ps ? ps[0].pol : f);
  }

  // A caixa cobre o maior pedaço e os que chegam a um quinto dele. O corte é
  // escolha, e está onde separa o que as pessoas esperam ver junto do que não:
  // o Alasca (21% dos Estados Unidos continentais) entra, a Guiana Francesa
  // (15% da França) e Svalbard (19% da Noruega) ficam de fora.
  const FRACAO = 0.2;
  function caixaPrincipal(f) {
    const ps = pedacos(f);
    if (!ps) return caminho.bounds(f);
    let [[x0, y0], [x1, y1]] = caminho.bounds(ps[0].pol);
    for (const { pol, area } of ps.slice(1)) {
      if (area < ps[0].area * FRACAO) break;
      const [[a0, b0], [a1, b1]] = caminho.bounds(pol);
      x0 = Math.min(x0, a0); y0 = Math.min(y0, b0);
      x1 = Math.max(x1, a1); y1 = Math.max(y1, b1);
    }
    return [[x0, y0], [x1, y1]];
  }

  // Nome no mapa só onde ele cabe de verdade. Duas contas, as duas em pixels
  // de tela: a área do país tem que dar pra ler, e o nome tem que caber na
  // largura da forma. Só a área não bastava — "Papua-Nova Guiné" vazava pro
  // mar de um país que, de área, passava.
  const LARGURA_LETRA = 5.6;
  function cabe(f, texto, fonte, areaMin) {
    const a = f.__area ?? 0;
    if (a * k * k < areaMin) return false;
    // A largura é a do corpo principal, não a do conjunto: senão a França
    // mede do Caribe ao Pacífico e cabe qualquer nome.
    const [[x0], [x1]] = f.__caixa ?? caminho.bounds(f);
    return texto.length * LARGURA_LETRA * (fonte / 11) <= (x1 - x0) * k * 1.15;
  }
  for (const f of visiveis.features) {
    f.__area = caminho.area(f);
    f.__caixa = caixaPrincipal(f);
  }

  const formas = gPaises.selectAll('path').data(visiveis.features).join('path')
    .attr('class', 'pais')
    .attr('d', caminho)
    .on('pointermove', dica)
    .on('pointerleave', esconderDica)
    .on('click', (ev, f) => { const d = dadoDe(f); if (d) aoEscolherPais(d.iso); })
    .on('dblclick', (ev, f) => { ev.stopPropagation(); const d = dadoDe(f); if (d) abrirPais(d.iso); });

  const rotulos = gRotulos.selectAll('text').data(visiveis.features.filter(dadoDe)).join('text')
    .attr('transform', (f) => `translate(${centro(f)})`)
    .attr('dy', '0.35em')
    .text((f) => dadoDe(f).nome);

  function dica(ev, f) {
    const d = dadoDe(f);
    if (!d) return mostrarDica(ev, [f.properties.name, 'fora da lista de países soberanos']);
    const c = mandaNoPais(d);
    const anos = anosNoCargo(d.estado?.desde ?? d.governo?.desde);
    mostrarDica(ev, [d.nome, c?.nome ?? 'sem dado',
      modo === 'tempo'
        ? (anos == null ? 'tempo no cargo não informado' : `há ${fmtNum(anos, 0)} ano${anos >= 2 ? 's' : ''} no cargo`)
        : c?.posicaoRotulo ?? (d.semPartido ? 'governa sem partido' : 'sem posição conhecida')]);
  }

  // ---------- zoom e arrasto ----------

  const zoom = d3.zoom().scaleExtent([1, ZOOM_MAX]).translateExtent([[0, 0], [L, A]])
    .on('zoom', (ev) => aplicar(ev.transform));
  // O duplo clique é nosso: abre o país em vez de só aproximar um passo.
  svg.call(zoom).on('dblclick.zoom', null);

  function aplicar(t) {
    k = t.k;
    palco.attr('transform', t);
    // O texto tem que manter o tamanho na tela, então encolhe junto com o zoom.
    // A auréola do texto também é desenhada no espaço do mapa: sem dividir
    // por k, com zoom de 18x ela vira um borrão escuro em volta do nome.
    gRotulos.attr('font-size', 11 / k).attr('stroke-width', 3 / k);
    gRotulosDiv.attr('font-size', 9 / k).attr('stroke-width', 2.5 / k);
    // Nome só onde cabe: a área do país na tela cresce com o quadrado do zoom.
    rotulos.attr('display', (f) => (!paisAberto && cabe(f, dadoDe(f).nome, 11, 900) ? null : 'none'));
    gRotulosDiv.selectAll('text').attr('display', (d) => (cabe(d, d.properties.nome, 9, 500) ? null : 'none'));
  }

  // Para onde o zoom tem que ir pra que esta caixa encha a tela.
  function transformarPara([[x0, y0], [x1, y1]], margem = 0.86) {
    const kk = Math.max(1, Math.min(ZOOM_MAX, margem * Math.min(L / (x1 - x0), A / (y1 - y0))));
    return d3.zoomIdentity.translate(L / 2, A / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  }

  const RAPIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // No quadro seguinte, de propósito. Link direto pra um país (#pais=DE) abre
  // o mapa ainda durante a avaliação do módulo, e uma transição do d3 criada
  // ali não chega a rodar: o mapa ficava em escala 1, como se o zoom não
  // existisse, mas só quando se entrava pelo endereço. Um quadro de atraso não
  // se vê no clique e faz o link direto funcionar igual.
  const irPara = (t, ms = 750) => requestAnimationFrame(() =>
    svg.transition().duration(RAPIDO ? 0 : ms).ease(d3.easeCubicInOut).call(zoom.transform, t));

  // ---------- divisões internas ----------

  const pedirDivisoes = (iso) => {
    if (!divisoes.has(iso)) divisoes.set(iso, carregarDivisoes(iso));
    return divisoes.get(iso);
  };

  // Quem governa cada divisão vem de duas bases, nesta ordem:
  //
  //   Brasil — do próprio site, que tem os governadores do TSE e a nota de 0
  //     a 10 de cada partido. É mais fresco e mais preciso que o resto.
  //   Qualquer outro país — de subnacional.json, que é a Wikidata casada pelo
  //     código ISO 3166-2. Cobre 1.205 das 4.584 divisões, muito bem nos
  //     países grandes e quase nada na África.
  //
  // Onde nenhuma das duas sabe, a divisão fica com a cor do próprio país —
  // mais honesto que hachurar tudo: quem governa o país governa ali também.
  const ufDaDivisao = (f) => ((f.properties.iso ?? '').startsWith('BR-') ? f.properties.iso.slice(3) : null);
  const subDaDivisao = (f) => subnacional?.[(f.properties.iso ?? '').toUpperCase()] ?? null;

  function quemGoverna(f, iso) {
    const uf = iso === 'BR' ? ufDaDivisao(f) : null;
    const g = uf && dados.governadorPorUf.get(uf);
    if (g) {
      const pos = dados.partidos[g.partido]?.posicao;
      return { pessoa: g.nome, partido: g.partido, posicao: pos ?? null, uf, desde: g.desde ?? null };
    }
    return subDaDivisao(f);
  }

  function corDaDivisao(f, iso) {
    const q = quemGoverna(f, iso);
    if (!q) return corDoPais(porIso.get(iso));
    if (q.posicao != null) return escala(q.posicao);
    if (q.faixa) return corDaFaixa(q.faixa, escala);
    if (q.semPartido) return 'var(--sem-partido)';
    return 'url(#hachura-mundo)';
  }

  // Os dados de quem governa as divisões são 330 kB e só servem depois que
  // alguém entra num país: chegam na primeira vez que isso acontece.
  function pedirSubnacional() {
    if (subnacional) return Promise.resolve(subnacional);
    pedindoSubnacional ??= carregarSubnacional()
      .then((d) => { subnacional = d.divisoes ?? {}; return subnacional; })
      .catch(() => { subnacional = {}; return subnacional; });
    return pedindoSubnacional;
  }

  async function abrirPais(iso) {
    const f = visiveis.features.find((x) => dadoDe(x)?.iso === iso);
    if (!f) return;
    paisPedido = iso;
    aoEscolherPais(iso);
    irPara(transformarPara(f.__caixa));

    let topo = null;
    try { [topo] = await Promise.all([pedirDivisoes(iso), pedirSubnacional()]); } catch { divisoes.delete(iso); }
    if (paisPedido !== iso) return;
    paisAberto = iso;
    voltar.hidden = false;
    formas.classed('apagada', (x) => x !== f);

    const feicoes = topo ? feature(topo, topo.objects.divisoes).features : [];
    for (const d of feicoes) { d.__area = caminho.area(d); d.__caixa = caixaPrincipal(d); }
    semDivisoes.hidden = feicoes.length > 0;
    gDivisoes.selectAll('path').data(feicoes, (d) => d.properties.id).join('path')
      .attr('class', 'divisao')
      .attr('d', caminho)
      .attr('fill', (d) => corDaDivisao(d, iso))
      .on('pointermove', (ev, d) => {
        const q = quemGoverna(d, iso);
        mostrarDica(ev, [d.properties.nome,
          q ? q.pessoa : d.properties.tipo ?? '',
          q ? (q.partido ?? 'sem partido') : 'quem governa aqui não está nos dados']);
      })
      .on('pointerleave', esconderDica)
      .on('click', (ev, d) => {
        ev.stopPropagation();
        const uf = iso === 'BR' ? ufDaDivisao(d) : null;
        if (uf) return aoEscolherUf(uf);
        aoEscolherDivisao(d.properties.iso, { nome: d.properties.nome, tipo: d.properties.tipo, pais: iso });
      });
    gRotulosDiv.selectAll('text').data(feicoes, (d) => d.properties.id).join('text')
      .attr('transform', (d) => `translate(${centro(d)})`)
      .attr('dy', '0.35em')
      .text((d) => d.properties.nome);
    aplicar(d3.zoomTransform(svg.node()));
  }

  function fecharPais() {
    paisPedido = null;
    if (!paisAberto) return;
    paisAberto = null;
    voltar.hidden = true;
    semDivisoes.hidden = true;
    formas.classed('apagada', false);
    gDivisoes.selectAll('path').remove();
    gRotulosDiv.selectAll('text').remove();
    irPara(d3.zoomIdentity);
  }

  // ---------- controles ----------

  const chaves = h('div', { class: 'mundo-modos', role: 'group', 'aria-label': 'O que a cor mostra' },
    h('button', { 'data-modo': 'espectro', 'aria-selected': 'true' }, 'Esquerda e direita'),
    h('button', { 'data-modo': 'tempo', 'aria-selected': 'false' }, 'Tempo no poder'));
  for (const b of chaves.children) {
    b.addEventListener('click', () => {
      modo = b.dataset.modo;
      for (const o of chaves.children) o.setAttribute('aria-selected', String(o === b));
      pintar();
    });
  }

  const regioes = h('div', { class: 'mundo-regioes', role: 'group', 'aria-label': 'Aproximar numa região' },
    Object.entries(REGIOES).map(([nome, caixa]) => h('button', {
      onclick: () => { fecharPais(); irPara(caixa ? transformarPara(caixaDaRegiao(caixa, projecao), 0.95) : d3.zoomIdentity); },
    }, nome)));

  const voltar = h('button', { class: 'mundo-voltar', hidden: true, onclick: fecharPais }, '← Mundo inteiro');
  const semDivisoes = h('p', { class: 'fraco mundo-recado', hidden: true }, 'A fonte não tem divisões internas para este país.');

  const lupas = h('div', { class: 'mundo-lupas', role: 'group', 'aria-label': 'Zoom' },
    h('button', { title: 'Aproximar', onclick: () => svg.transition().duration(250).call(zoom.scaleBy, 1.8) }, '+'),
    h('button', { title: 'Afastar', onclick: () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.8) }, '−'));

  raiz.append(
    h('div', { class: 'mundo-topo' }, chaves, voltar),
    h('div', { class: 'mundo-palco' }, svg.node(), lupas),
    h('div', { class: 'mundo-rodape' }, regioes,
      h('p', { class: 'fraco mundo-ajuda' }, 'Arraste para mover, aproxime com a roda ou com dois dedos. Dois toques num país abrem as divisões internas dele.'),
      semDivisoes));

  // O d3.zoom só avisa quando alguém mexe. Sem esta primeira chamada, o mapa
  // abre com TODOS os nomes na tela, inclusive os de país que não tem onde
  // caber — foi assim que o mundo nasceu ilegível.
  aplicar(d3.zoomIdentity);

  // Esc fecha o país aberto, como em qualquer coisa que abre por cima.
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && paisAberto) fecharPais(); });

  function corDoPais(d) {
    if (!d) return 'var(--fundo-2)';
    if (modo === 'tempo') {
      const escuro = getComputedStyle(document.documentElement).colorScheme.includes('dark');
      return corDoTempo(anosNoCargo(d.estado?.desde ?? d.governo?.desde), escuro) ?? 'url(#hachura-mundo)';
    }
    // A faixa vem primeiro, mesmo em país "sem partido": quando se sabe por
    // qual partido a pessoa foi eleita — Putin pela Rússia Unida, Kast pelo
    // Partido Republicano — a cor é essa, e o painel conta a história toda.
    return corDaFaixa(faixaDoPais(d), escala)
      ?? (d.semPartido ? 'var(--sem-partido)' : 'url(#hachura-mundo)');
  }

  function pintar() {
    escala = escalaEspectro();
    formas.attr('fill', (f) => corDoPais(dadoDe(f)));
    if (paisAberto) gDivisoes.selectAll('path').attr('fill', (d) => corDaDivisao(d, paisAberto));
    raiz.dispatchEvent(new CustomEvent('modo', { detail: modo, bubbles: true }));
  }

  return {
    get modo() { return modo; },
    pintar,
    abrirPais,
    selecionar({ pais, divisao }) {
      divisaoAtiva = divisao ?? null;
      gDivisoes.selectAll('path').classed('ativa', (d) => d.properties.iso === divisaoAtiva);
      formas.classed('ativa', (f) => dadoDe(f)?.iso === pais);
      formas.filter((f) => dadoDe(f)?.iso === pais).raise();
      // Escolher outro país fecha o que estava aberto; escolher uma divisão
      // DENTRO dele, não — senão clicar num estado saltava de volta pro mundo.
      if (paisAberto && !divisao && paisAberto !== pais) fecharPais();
    },
    get divisoesDe() { return subnacional; },
  };
}

// As cinco faixas na ordem da esquerda pra direita, pra legenda se montar.
export const FAIXAS_MUNDO = FAIXAS.map((f) => ({ ...f, valor: VALOR_DA_FAIXA[f.chave] }));
