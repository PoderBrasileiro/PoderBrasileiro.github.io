import { h, CARGOS, escalaEspectro, posicaoDe, textoPartido, ondeAtua, fmtNum, fmtData, semAcento } from './comum.js';
import { criarMapa } from './mapa.js';
import { criarRede } from './rede.js';
import { criarPainel } from './painel.js';

const base = import.meta.env.BASE_URL;
const carregar = (nome) => fetch(`${base}data/${nome}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${nome}: HTTP ${r.status}`))));

let dados;
try {
  const [brasil, malha, noticias] = await Promise.all([
    carregar('brasil.json'),
    carregar('malha.json'),
    carregar('noticias.json').catch(() => null),   // opcional: o site funciona sem
  ]);
  dados = {
    ...brasil, malha, noticias,
    pessoaPorId: new Map(brasil.pessoas.map((p) => [p.id, p])),
    ufPorSigla: new Map(brasil.ufs.map((u) => [u.sigla, u])),
    governadorPorUf: new Map(brasil.pessoas.filter((p) => p.cargo === 'governador').map((p) => [p.uf, p])),
  };
} catch (e) {
  document.querySelector('.palco').replaceChildren(
    h('p', { class: 'erro' }, 'Não deu pra carregar os dados. Rode "npm run coletar" e recarregue. ', h('code', {}, e.message)));
  throw e;
}

// ---------- seleção: um caminho só pra mapa, rede, lista, busca e painel ----------

const acoes = {
  aoEscolherPessoa: (id) => selecionar({ pessoa: id, uf: dados.pessoaPorId.get(id).uf ?? null }),
  aoEscolherUf: (uf) => selecionar({ uf }),
  aoVerMinistros: () => selecionar({ ministros: true }),
};

const mapa = criarMapa(document.getElementById('vis-mapa'), dados, acoes);
const rede = criarRede(document.getElementById('vis-rede'), dados, acoes);
const painel = criarPainel(document.getElementById('painel'), dados, acoes);

function selecionar(sel) {
  mapa.selecionar(sel);
  rede.selecionar(sel);
  if (sel.pessoa) painel.pessoa(sel.pessoa);
  else if (sel.uf) painel.uf(sel.uf);
  else if (sel.ministros) painel.ministros();
  else painel.resumo();
  // No celular o painel fica abaixo da visualização.
  if (matchMedia('(max-width: 900px)').matches) document.getElementById('painel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- cores (refeitas quando o tema do sistema muda) ----------

function pintar() {
  const escala = escalaEspectro();
  mapa.pintar(escala);
  rede.pintar(escala);
  desenharLegenda();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pintar);

function desenharLegenda() {
  const aba = document.querySelector('.abas [aria-selected="true"]').dataset.aba;
  const el = document.getElementById('legenda');
  el.hidden = aba === 'lista';
  el.replaceChildren(
    h('div', { class: 'legenda-item' },
      h('span', {}, 'esquerda'), h('span', { class: 'legenda-rampa' }), h('span', {}, 'direita')),
    h('div', { class: 'legenda-item' }, h('span', { class: 'legenda-hachura' }), h('span', {}, 'sem partido ou não informado')),
    aba === 'mapa'
      ? h('div', { class: 'legenda-item fraco' }, 'Cor do estado = posição do partido do governador')
      : h('div', { class: 'legenda-item' },
        ['presidente', 'governador', 'ministro', 'senador'].map((c) =>
          h('span', { class: 'legenda-tam' },
            h('i', { style: `width:${CARGOS[c].raio * 2}px;height:${CARGOS[c].raio * 2}px` }), CARGOS[c].curto))));
}

// ---------- lista (a visão em tabela dos mesmos dados) ----------

function criarLista(raiz) {
  const ordem = { presidente: 0, vice: 1, ministro: 2, governador: 3, senador: 4 };
  const filtro = h('select', { 'aria-label': 'Filtrar por cargo' },
    h('option', { value: '' }, 'Todos os cargos'),
    Object.entries(CARGOS).map(([k, c]) => h('option', { value: k }, c.curto)));
  const corpo = h('tbody');
  const desenhar = () => {
    const linhas = dados.pessoas
      .filter((p) => !filtro.value || p.cargo === filtro.value)
      .sort((a, b) => ordem[a.cargo] - ordem[b.cargo] || ondeAtua(a, dados).localeCompare(ondeAtua(b, dados), 'pt') || a.nome.localeCompare(b.nome, 'pt'));
    corpo.replaceChildren(...linhas.map((p) => {
      const pos = posicaoDe(p, dados);
      return h('tr', { tabindex: '0', onclick: () => acoes.aoEscolherPessoa(p.id), onkeydown: (e) => { if (e.key === 'Enter') acoes.aoEscolherPessoa(p.id); } },
        h('td', {}, p.nome), h('td', {}, CARGOS[p.cargo].curto), h('td', {}, ondeAtua(p, dados)),
        h('td', {}, textoPartido(p)), h('td', { class: 'num' }, pos == null ? '—' : fmtNum(pos, 2)));
    }));
  };
  filtro.addEventListener('change', desenhar);
  raiz.append(
    h('div', { class: 'lista-filtros' }, filtro),
    h('div', { class: 'tabela-rolagem' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Nome', 'Cargo', 'UF / pasta', 'Partido', 'Posição do partido (0–10)'].map((t) => h('th', {}, t)))),
      corpo)));
  desenhar();
}
criarLista(document.getElementById('vis-lista'));

// ---------- abas ----------

function abrirAba(nome) {
  for (const b of document.querySelectorAll('.abas button')) b.setAttribute('aria-selected', String(b.dataset.aba === nome));
  for (const a of ['mapa', 'rede', 'lista']) document.getElementById(`vis-${a}`).hidden = a !== nome;
  history.replaceState(null, '', `#${nome}`);
  desenharLegenda();
}
for (const b of document.querySelectorAll('.abas button')) b.addEventListener('click', () => abrirAba(b.dataset.aba));

// ---------- busca ----------

const campo = document.getElementById('busca');
const resultados = document.getElementById('busca-resultados');
const indice = dados.pessoas.map((p) => ({
  p, texto: semAcento([p.nome, p.nomeCompleto, p.partido, p.pasta, p.uf, dados.ufPorSigla.get(p.uf)?.nome, CARGOS[p.cargo].curto].filter(Boolean).join(' ')),
}));
campo.addEventListener('input', () => {
  const termos = semAcento(campo.value).split(/\s+/).filter(Boolean);
  const achados = termos.length ? indice.filter((x) => termos.every((t) => x.texto.includes(t))).slice(0, 8) : [];
  resultados.hidden = !termos.length;
  resultados.replaceChildren(...(achados.length
    ? achados.map(({ p }) => h('li', {}, h('button', {
      onclick: () => { acoes.aoEscolherPessoa(p.id); campo.value = ''; resultados.hidden = true; },
    }, h('b', {}, p.nome), h('small', {}, `${CARGOS[p.cargo].curto} · ${ondeAtua(p, dados)} · ${textoPartido(p)}`))))
    : [h('li', { class: 'fraco' }, 'Ninguém encontrado.')]));
});
campo.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { campo.value = ''; resultados.hidden = true; }
  if (e.key === 'Enter') resultados.querySelector('button')?.click();
});
document.addEventListener('click', (e) => { if (!e.target.closest('.busca')) resultados.hidden = true; });

// ---------- rodapé ----------

const link = (texto, url) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, texto);
document.getElementById('metodologia').append(
  h('h4', {}, 'De onde vêm os cargos'),
  h('ul', {},
    h('li', {}, 'Senadores e votações: ', link('Dados Abertos do Senado Federal', 'https://legis.senado.leg.br/dadosabertos/'), '.'),
    h('li', {}, 'Ministros: ', link('página oficial do Planalto', 'https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras'), '. Partido e foto, quando aparecem, vêm da Wikipédia.'),
    h('li', {}, 'Governadores: ', link('Wikipédia em português', 'https://pt.wikipedia.org/wiki/Lista_de_governadores_das_unidades_federativas_do_Brasil'), ' — não existe fonte oficial única; confira no site do governo estadual em caso de dúvida.'),
    h('li', {}, 'Mapa e lista de estados: ', link('IBGE', 'https://servicodados.ibge.gov.br/api/docs/'), '.')),
  h('h4', {}, 'Esquerda × direita'),
  h('p', {}, 'Não existe medida oficial. O site mostra duas coisas separadas e diz qual é qual:'),
  h('ul', {},
    h('li', {}, h('b', {}, 'Posição do partido: '), dados.fontePartidos, ' A porcentagem é só essa nota convertida (nota 7 = 70% direita). Vale para o partido inteiro, não para a pessoa.'),
    h('li', {}, h('b', {}, 'Voto no plenário (só senadores): '), `nas votações nominais em que a maioria do ${dados.votos.poloEsquerda} e a maioria do ${dados.votos.poloDireita} ficaram em lados opostos, de que lado o senador votou. Mede alinhamento de voto, não ideologia.`)),
  h('h4', {}, 'Investigações e notícias'),
  h('p', {}, 'O site não afirma nada sobre ninguém: só reúne links. As listas são geradas por busca automática pelo nome, sem revisão humana, e erram — homônimos e simples citações aparecem. Investigado, réu e condenado são situações jurídicas diferentes, e só a fonte original diz qual é o caso.'));

document.getElementById('atualizado').textContent =
  `Dados coletados em ${fmtData(dados.geradoEm)}. Projeto pessoal, sem vínculo com governo ou partido.`;

// ---------- início ----------

pintar();
painel.resumo();
const inicial = location.hash.slice(1);
if (['rede', 'lista'].includes(inicial)) abrirAba(inicial);
