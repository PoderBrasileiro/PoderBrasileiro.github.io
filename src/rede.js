// Rede de poder: um quadro com os três poderes nas colunas e os três níveis
// da federação nas linhas. Cada bolinha é uma pessoa; dentro de cada grupo
// elas vão ordenadas pela posição do partido, da esquerda pra direita.
//
// Já foi uma árvore radial. Ficava bonita e ilegível: 150 bolinhas iguais
// num círculo, sem dizer quem era de qual poder. O quadro responde isso de
// cara, e as células sem dados dizem o que o site NÃO cobre.

import { h, CARGOS, SITUACOES, destinoDe, posicaoDe, mostrarDica, esconderDica, textoPartido, ondeAtua } from './comum.js';

const DIAMETRO = { presidente: 30, vice: 24, ministro: 16, governador: 20, senador: 14, deputado: 10, stf: 20 };

export function criarRede(raiz, dados, { aoEscolherPessoa, aoVerMapa }) {
  const bolinhas = [];   // { el, pessoa }

  function bolinha(p) {
    const d = DIAMETRO[p.cargo];
    const el = h('button', {
      class: 'b', style: `width:${d}px;height:${d}px`,
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

  const doCargo = (cargo) => dados.pessoas.filter((p) => p.cargo === cargo)
    .sort((a, b) => (posicaoDe(a, dados) ?? 99) - (posicaoDe(b, dados) ?? 99) || a.nome.localeCompare(b.nome, 'pt'));

  const grupo = (titulo, conteudo, nota) => h('div', { class: 'q-grupo' },
    h('h4', {}, titulo), conteudo, nota ? h('p', { class: 'q-nota' }, nota) : null);
  const nuvem = (cargo) => h('div', { class: 'q-nuvem' }, doCargo(cargo).map(bolinha));
  const fora = (titulo, texto) => h('div', { class: 'q-grupo q-fora' }, h('h4', {}, titulo), h('p', { class: 'q-nota' }, texto));

  const n = (cargo) => dados.pessoas.filter((p) => p.cargo === cargo).length;
  const stf = dados.pessoas.filter((p) => p.cargo === 'stf');
  const prefeitos = h('p', { class: 'q-nota' }, 'Carregando…');

  const celula = (...filhos) => h('div', { class: 'q-celula' }, filhos);
  const nivel = (nome, sub) => h('div', { class: 'q-nivel' }, h('b', {}, nome), h('small', {}, sub));
  const poder = (nome, sub) => h('div', { class: 'q-poder' }, h('b', {}, nome), h('small', {}, sub));

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
      poder('Executivo', 'governa e executa as leis'),
      poder('Legislativo', 'faz as leis e fiscaliza'),
      poder('Judiciário', 'julga conforme as leis'),

      nivel('União', 'o país inteiro'),
      celula(
        h('div', { class: 'q-grupo' }, h('h4', {}, 'Presidência'),
          h('div', { class: 'q-destaques' },
            comNome(dados.pessoaPorId.get('presidente'), `${dados.pessoaPorId.get('presidente').nome} · presidente`),
            comNome(dados.pessoaPorId.get('vice'), `${dados.pessoaPorId.get('vice').nome} · vice`))),
        grupo(`Ministros (${n('ministro')})`, nuvem('ministro'))),
      celula(
        grupo(`Senado (${n('senador')})`, nuvem('senador'), '3 senadores por estado'),
        grupo(`Câmara dos Deputados (${n('deputado')})`, nuvem('deputado'), 'bancada proporcional à população do estado')),
      celula(
        grupo(`Supremo Tribunal Federal (${stf.length} de 11)`,
          h('div', { class: 'q-destaques q-stf' }, stf.map((p) => comNome(p, p.funcao ? `${p.nome} · ${p.funcao}` : p.nome))),
          'Ministros do STF não têm partido. São indicados pelo presidente e aprovados pelo Senado.'),
        fora('Demais tribunais', 'STJ, TSE, TST, STM e a Justiça Federal não estão neste site.')),

      nivel('Estados', '26 estados e o DF'),
      celula(grupo(`Governadores (${n('governador')})`,
        h('div', { class: 'q-destaques q-gov' }, doCargo('governador').map((p) => comNome(p, p.uf))))),
      celula(fora('Assembleias legislativas', 'Deputados estaduais não estão neste site.')),
      celula(fora('Tribunais de Justiça', 'A Justiça estadual não está neste site.')),

      nivel('Municípios', '5.569 cidades'),
      celula(h('div', { class: 'q-grupo' }, h('h4', {}, 'Prefeitos'), prefeitos,
        h('button', { class: 'botao', onclick: aoVerMapa }, 'Ver no mapa'))),
      celula(fora('Câmaras municipais', 'Vereadores não estão neste site.')),
      celula(fora('—', 'Não existe Judiciário municipal: as cidades são atendidas pela Justiça estadual.'))));

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
        ? `${total.toLocaleString('pt-BR')} prefeitos eleitos em 2024. São bolinhas demais pra caber aqui: estão no mapa, estado por estado.`
        : 'Dados de prefeitos indisponíveis.';
    },
  };
}
