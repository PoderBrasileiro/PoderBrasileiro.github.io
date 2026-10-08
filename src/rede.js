// Rede de poder: um quadro com os três poderes nas colunas e os três níveis
// da federação nas linhas. Cada bolinha é uma pessoa; dentro de cada grupo
// elas vão ordenadas pela posição do partido, da esquerda pra direita.
//
// Já foi uma árvore radial. Ficava bonita e ilegível: 150 bolinhas iguais
// num círculo, sem dizer quem era de qual poder. O quadro responde isso de
// cara, e as células sem dados dizem o que o site NÃO cobre.

import * as d3 from 'd3';
import { assentos } from './assentos.js';
import { h, CARGOS, SITUACOES, destinoDe, posicaoDe, mostrarDica, esconderDica, textoPartido, ondeAtua } from './comum.js';

const DIAMETRO = { presidente: 30, vice: 24, ministro: 16, governador: 20, senador: 14, deputado: 10, stf: 20 };

export function criarRede(raiz, dados, { aoEscolherPessoa, aoVerMapa }) {
  const bolinhas = [];   // { el, pessoa }

  let ordem = 0;   // só pro atraso em cascata da animação de entrada

  function bolinha(p, estilo = '') {
    const d = DIAMETRO[p.cargo];
    const el = h('button', {
      class: 'b', style: `width:${d}px;height:${d}px;--i:${ordem++};${estilo}`,
      'aria-label': `${p.nome}, ${CARGOS[p.cargo].curto}, ${ondeAtua(p, dados)}, ${textoPartido(p)}`,
      onclick: () => aoEscolherPessoa(p.id),
      'data-sit': destinoDe(p, dados)?.situacao,
      onpointermove: (ev) => {
        const d = destinoDe(p, dados);
        mostrarDica(ev, [p.nome, `${CARGOS[p.cargo].curto} · ${ondeAtua(p, dados)}`, textoPartido(p),
          d ? `${SITUACOES[d.situacao].icone} ${SITUACOES[d.situacao].rotulo}` : null].filter(Boolean));
      },
      onpointerleave: esconderDica,
    });
    bolinhas.push({ el, pessoa: p });
    return el;
  }

  // Bolinha com nome embaixo, pros poucos cargos em que cabe.
  const comNome = (p, rotulo) => h('div', { class: 'b-nome' }, bolinha(p), h('span', {}, rotulo ?? p.nome));

  // Com retrato, pros cargos em que são poucas pessoas e vale reconhecer a
  // cara. A foto que não carrega simplesmente sai e deixam-se as iniciais.
  function comFoto(p, rotulo) {
    const iniciais = p.nome.split(/\s+/).filter((s) => s.length > 2).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
    const caixa = h('span', { class: 'q-retrato' }, h('i', { 'aria-hidden': 'true' }, iniciais));
    if (p.foto) {
      const img = h('img', { src: p.foto, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.remove());
      caixa.append(img);
    }
    const alvo = bolinha(p);
    alvo.classList.add('b-foto');
    alvo.append(caixa);
    return h('div', { class: 'b-nome b-nome-foto' }, alvo, h('span', {}, rotulo ?? p.nome));
  }

  const doCargo = (cargo) => dados.pessoas.filter((p) => p.cargo === cargo)
    .sort((a, b) => (posicaoDe(a, dados) ?? 99) - (posicaoDe(b, dados) ?? 99) || a.nome.localeCompare(b.nome, 'pt'));

  // Quanto do grupo está de cada lado, pela posição do partido. Quem não tem
  // partido ou não está na classificação fica fora da conta, e a barra diz
  // quantos foram — senão a porcentagem parece falar de todo mundo.
  function balanco(pessoas) {
    const pos = pessoas.map((p) => posicaoDe(p, dados)).filter((x) => x != null);
    if (pos.length < 3) return null;
    const esq = pos.filter((x) => x < 5).length;
    const dir = pos.filter((x) => x > 5).length;
    const centro = pos.length - esq - dir;
    const fora = pessoas.length - pos.length;
    // A porcentagem é sobre quem tem partido conhecido, mas a barra cobre o
    // grupo inteiro: a fatia hachurada mostra de quanta gente não se sabe.
    const pc = (n) => (100 * n) / pos.length;
    const largura = (n) => (100 * n) / pessoas.length;
    return h('div', { class: 'q-balanco' },
      h('div', { class: 'q-barra', role: 'img', 'aria-label': `${Math.round(pc(esq))}% esquerda, ${Math.round(pc(dir))}% direita, entre ${pos.length} de ${pessoas.length}` },
        esq ? h('span', { class: 'q-barra-esq', style: `width:${largura(esq)}%` }) : null,
        centro ? h('span', { class: 'q-barra-meio', style: `width:${largura(centro)}%` }) : null,
        dir ? h('span', { class: 'q-barra-dir', style: `width:${largura(dir)}%` }) : null,
        fora ? h('span', { class: 'q-barra-fora', style: `width:${largura(fora)}%` }) : null),
      h('p', { class: 'q-nota' },
        h('b', {}, `${Math.round(pc(esq))}%`), ' esquerda · ',
        h('b', {}, `${Math.round(pc(dir))}%`), ' direita',
        centro ? ` · ${Math.round(pc(centro))}% no centro` : '',
        fora ? `, entre os ${pos.length} de ${pessoas.length} com partido conhecido` : ''));
  }

  // Como a composição do grupo andou desde que o site começou a guardar. Só
  // aparece com dias suficientes pra ter forma — com dois pontos uma linha
  // não diz nada e sugere tendência onde não há.
  function evolucao(cargo) {
    const dias = (dados.historico?.dias ?? []).filter((d) => d.grupos?.[cargo]);
    if (dias.length < 5) return null;
    const L = 260, A = 44;
    const frac = (d) => { const g = d.grupos[cargo]; const n = g.esq + g.centro + g.dir; return n ? g.dir / n : null; };
    const pts = dias.map((d, i) => [(i / (dias.length - 1)) * L, frac(d)]).filter(([, y]) => y != null);
    if (pts.length < 5) return null;
    // Escala vertical fixa de 0 a 100%: esticar pra caber exageraria a oscilação.
    const ultimo = pts[pts.length - 1][1];
    const svg = d3.create('svg').attr('viewBox', `0 -3 ${L} ${A + 6}`).attr('preserveAspectRatio', 'none')
      .attr('role', 'img')
      .attr('aria-label', `Fatia de direita ao longo de ${dias.length} dias, de ${Math.round(pts[0][1] * 100)}% a ${Math.round(ultimo * 100)}%`);
    svg.append('line').attr('class', 'q-meia').attr('x1', 0).attr('x2', L).attr('y1', A / 2).attr('y2', A / 2);
    svg.append('path').attr('class', 'q-linha')
      .attr('d', pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${(A - y * A).toFixed(1)}`).join(' '));
    return h('div', { class: 'q-evolucao' }, svg.node(),
      h('p', { class: 'q-nota' }, `Direita em ${dias.length} dias: ${Math.round(pts[0][1] * 100)}% → ${Math.round(ultimo * 100)}%`));
  }

  const grupo = (titulo, conteudo, nota, pessoas, cargo) => h('div', { class: 'q-grupo' },
    h('h4', {}, titulo), conteudo, pessoas ? balanco(pessoas) : null,
    cargo ? evolucao(cargo) : null, nota ? h('p', { class: 'q-nota' }, nota) : null);
  const nuvem = (cargo) => h('div', { class: 'q-nuvem' }, doCargo(cargo).map((p) => bolinha(p)));

  // Plenário em semicírculo: cada cadeira é uma pessoa, da esquerda para a
  // direita conforme a posição do partido.
  function plenario(cargo, linhas) {
    const gente = doCargo(cargo);
    const lugares = assentos(gente.length, linhas);
    return h('div', { class: `q-plenario q-plenario-${cargo}` },
      gente.map((p, i) => bolinha(p, `left:${(lugares[i].x * 100).toFixed(2)}%;top:${(lugares[i].y * 100).toFixed(2)}%`)),
      h('span', { class: 'q-total' }, gente.length));
  }
  const fora = (titulo, texto) => h('div', { class: 'q-grupo q-fora' }, h('h4', {}, titulo), h('p', { class: 'q-nota' }, texto));

  const n = (cargo) => dados.pessoas.filter((p) => p.cargo === cargo).length;
  const stf = dados.pessoas.filter((p) => p.cargo === 'stf');
  const prefeitos = h('p', { class: 'q-nota' }, 'Carregando…');

  // --i é o lugar na cascata de entrada; o CSS vira isso em atraso.
  let passo = 0;
  const celula = (...filhos) => h('div', { class: 'q-celula', style: `--i:${passo++}` }, filhos);
  const nivel = (nome, sub) => h('div', { class: 'q-nivel', style: `--i:${passo++}` }, h('b', {}, nome), h('small', {}, sub));
  const poder = (nome, sub) => h('div', { class: 'q-poder', style: `--i:${passo++}` }, h('b', {}, nome), h('small', {}, sub));

  // Liga/desliga a leitura "quem fica, quem sai": a cor continua sendo o
  // partido; o que muda é o contorno e a opacidade de cada bolinha.
  const legendaTransicao = h('div', { class: 'q-legenda', hidden: true },
    Object.entries(SITUACOES).map(([s, v]) => h('span', {}, h('i', { class: 'b', 'data-sit': s }), `${v.icone} ${v.rotulo}`)));
  const chave = dados.eleicao ? h('button', { class: 'q-chave', 'aria-pressed': 'false' }, '⇄ Transição 2027') : null;
  chave?.addEventListener('click', () => {
    const ligado = quadro.classList.toggle('transicao');
    chave.setAttribute('aria-pressed', String(ligado));
    legendaTransicao.hidden = !ligado;
  });

  const quadro = h('div', { class: 'quadro' },
    h('div', { class: 'q-topo' }, h('div', { class: 'q-raiz' }, 'República Federativa do Brasil'), chave),
    legendaTransicao,
    h('div', { class: 'q-grade' },
      h('div', {}),
      poder('Executivo', 'Governa e executa as leis'),
      poder('Legislativo', 'Faz as leis e fiscaliza'),
      poder('Judiciário', 'Julga conforme as leis'),

      nivel('União', 'O país inteiro'),
      // O Executivo desce como organograma: quem nomeia fica acima de quem é
      // nomeado, com um traço ligando os níveis.
      celula(h('div', { class: 'q-arvore' },
        h('div', { class: 'q-no-raiz' },
          comFoto(dados.pessoaPorId.get('presidente'), `${dados.pessoaPorId.get('presidente').nome} · presidente`)),
        h('div', { class: 'q-ramo' },
          h('div', { class: 'q-no' }, comFoto(dados.pessoaPorId.get('vice'), `${dados.pessoaPorId.get('vice').nome} · vice`)),
          h('div', { class: 'q-no q-no-larga' },
            grupo(`Ministros (${n('ministro')})`, nuvem('ministro'), 'Nomeados pelo presidente, sem passar pelo Congresso.', doCargo('ministro'), 'ministro'))))),
      celula(
        grupo(`Senado (${n('senador')})`, plenario('senador', 4), '3 senadores por estado.', doCargo('senador'), 'senador'),
        grupo(`Câmara dos Deputados (${n('deputado')})`, plenario('deputado', 11), 'Bancada proporcional à população do estado.', doCargo('deputado'), 'deputado')),
      celula(
        // Agrupado por quem indicou: é o que mostra a marca que cada governo
        // deixou num tribunal com mandato vitalício.
        grupo(`Supremo Tribunal Federal (${stf.length} de 11)`,
          h('div', { class: 'q-indicacoes' },
            d3.groups(stf, (p) => p.indicadoPor ?? 'Indicação não informada')
              .sort((a, b) => b[1].length - a[1].length)
              .map(([quem, gente]) => h('div', { class: 'q-indicacao' },
                h('h5', {}, h('b', {}, quem), h('small', {}, `Indicou ${gente.length} de ${stf.length}`)),
                h('div', { class: 'q-destaques q-stf' }, gente.map((p) => comFoto(p, p.funcao ? `${p.nome} · ${p.funcao}` : p.nome)))))),
          'Sem partido, então fora da conta de esquerda e direita. Ficam até os 75 anos.'),
        fora('Demais tribunais', 'STJ, TSE, TST, STM e Justiça Federal: fora deste site.')),

      nivel('Estados', '26 estados e o Distrito Federal'),
      celula(grupo(`Governadores (${n('governador')})`,
        h('div', { class: 'q-destaques q-gov' }, doCargo('governador').map((p) => comNome(p, p.uf))), null, doCargo('governador'), 'governador')),
      celula(fora('Assembleias legislativas', 'Deputados estaduais: fora deste site.')),
      celula(fora('Tribunais de Justiça', 'Justiça estadual: fora deste site.')),

      nivel('Municípios', '5.569 cidades'),
      celula(h('div', { class: 'q-grupo' }, h('h4', {}, 'Prefeitos'), prefeitos,
        h('button', { class: 'botao', onclick: aoVerMapa }, 'Ver no mapa'))),
      celula(fora('Câmaras municipais', 'Vereadores: fora deste site.')),
      celula(fora('—', 'Não existe: as cidades são atendidas pela Justiça estadual.'))));

  raiz.append(quadro);

  return {
    pintar(escala) {
      for (const { el, pessoa } of bolinhas) {
        const pos = posicaoDe(pessoa, dados);
        el.classList.toggle('neutra', pessoa.cargo === 'stf');
        el.classList.toggle('sem', pessoa.cargo !== 'stf' && pos == null);
        el.style.background = pos == null ? '' : escala(pos);
      }
    },
    // Destaca a pessoa escolhida; com um estado escolhido, apaga quem é de outro.
    selecionar({ pessoa, uf }) {
      for (const b of bolinhas) {
        b.el.classList.toggle('ativo', b.pessoa.id === pessoa);
        b.el.classList.toggle('apagada', Boolean(uf) && Boolean(b.pessoa.uf) && b.pessoa.uf !== uf);
      }
    },
    atualizarPrefeitos() {
      const total = dados.pessoas.filter((p) => p.cargo === 'prefeito').length;
      prefeitos.textContent = total
        ? `${total.toLocaleString('pt-BR')} prefeitos eleitos em 2024. São bolinhas demais para caber aqui; estão no mapa.`
        : 'Dados de prefeitos indisponíveis.';
    },
  };
}
