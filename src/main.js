import { h, CARGOS, CARGO_ELEITO, escalaEspectro, posicaoDe, textoPartido, ondeAtua, fmtNum, fmtData, semAcento } from './comum.js';
import { criarMapa } from './mapa.js';
import { criarRede } from './rede.js';
import { criarPainel } from './painel.js';
import { criarPecs } from './pecs.js';
import { criarContagem } from './contagem.js';

const base = import.meta.env.BASE_URL;
const carregar = (nome) => fetch(`${base}data/${nome}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${nome}: HTTP ${r.status}`))));

let dados;
try {
  const [brasil, malha, noticias, eleicao] = await Promise.all([
    carregar('brasil.json'),
    carregar('malha.json'),
    carregar('noticias.json').catch(() => null),   // opcional: o site funciona sem
    carregar('eleicao2026.json').catch(() => null),
  ]);
  dados = {
    ...brasil, malha, noticias, eleicao,
    pessoaPorId: new Map(brasil.pessoas.map((p) => [p.id, p])),
    ufPorSigla: new Map(brasil.ufs.map((u) => [u.sigla, u])),
    governadorPorUf: new Map(brasil.pessoas.filter((p) => p.cargo === 'governador').map((p) => [p.uf, p])),
  };
  // Eleitos que ainda não assumiram entram como gente de verdade: busca, lista
  // e página própria. Sem isso, procurar por um estreante não acha nada.
  for (const e of eleicao?.estreantes ?? []) {
    const p = { ...e, cargo: 'eleito' };
    dados.pessoas.push(p);
    dados.pessoaPorId.set(p.id, p);
  }
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
  aoVerMapa: () => abrirAba('mapa'),
  aoEscolherPec: (pec) => selecionar({ pec }),
  carregarMalhaUf: (uf) => carregar(`malhas/${uf}.json`),
};

const mapa = criarMapa(document.getElementById('vis-mapa'), dados, acoes);
const rede = criarRede(document.getElementById('vis-rede'), dados, acoes);
const painel = criarPainel(document.getElementById('painel'), dados, acoes);
criarContagem(document.getElementById('contagem'), dados);
const abaPecs = criarPecs(document.getElementById('vis-pecs'), dados, acoes);

let selecaoAtual = {};
function selecionar(sel) {
  selecaoAtual = sel;
  mapa.selecionar(sel);
  rede.selecionar(sel);
  abaPecs.selecionar(sel);
  if (sel.pessoa) painel.pessoa(sel.pessoa);
  else if (sel.uf) painel.uf(sel.uf);
  else if (sel.ministros) painel.ministros();
  else if (sel.pec) painel.pec(sel.pec);
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

// Chave de tema. "sistema" é o padrão e não grava nada; as outras duas ficam
// guardadas no navegador. As cores das visualizações saem do CSS, então
// qualquer troca precisa repintar.
function aplicarTema(tema) {
  if (tema === 'sistema') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', tema);
  for (const b of document.querySelectorAll('.tema button')) b.setAttribute('aria-pressed', String(b.dataset.tema === tema));
  try { if (tema === 'sistema') localStorage.removeItem('tema'); else localStorage.setItem('tema', tema); } catch { /* modo privado */ }
  pintar();
}
for (const b of document.querySelectorAll('.tema button')) b.addEventListener('click', () => aplicarTema(b.dataset.tema));

function desenharLegenda() {
  const aba = document.querySelector('.abas [aria-selected="true"]').dataset.aba;
  const el = document.getElementById('legenda');
  el.hidden = aba === 'lista' || aba === 'pecs';
  el.replaceChildren(
    h('div', { class: 'legenda-item' },
      h('span', {}, 'esquerda'), h('span', { class: 'legenda-rampa' }), h('span', {}, 'direita')),
    h('div', { class: 'legenda-item' }, h('span', { class: 'legenda-hachura' }), h('span', {}, 'sem partido ou não informado')),
    aba === 'mapa'
      ? h('div', { class: 'legenda-item fraco' }, 'Cor = partido do governador (estados) ou do prefeito eleito em 2024 (municípios)')
      : h('div', { class: 'legenda-item fraco' }, 'Cada bolinha é uma pessoa. Em cada grupo, ordenadas da esquerda para a direita. Cinza liso = cargo sem partido (STF).'));
}

// ---------- lista (a visão em tabela dos mesmos dados) ----------

function criarLista(raiz) {
  const ordem = Object.fromEntries(['presidente', 'vice', 'ministro', 'stf', 'governador', 'senador', 'deputado', 'eleito', 'prefeito'].map((c, i) => [c, i]));
  const filtro = h('select', { 'aria-label': 'Filtrar por cargo' },
    h('option', { value: '' }, 'Todos os cargos'),
    Object.entries(CARGOS).map(([k, c]) => h('option', { value: k }, c.curto)));
  const corpo = h('tbody');
  const desenhar = () => {
    const linhas = dados.pessoas
      // Os ~5.500 prefeitos só entram quando pedidos; em "todos" afogariam o resto.
      .filter((p) => (filtro.value ? p.cargo === filtro.value : p.cargo !== 'prefeito'))
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
  return desenhar;
}
const redesenharLista = criarLista(document.getElementById('vis-lista'));

// ---------- abas ----------

function abrirAba(nome) {
  for (const b of document.querySelectorAll('.abas button')) b.setAttribute('aria-selected', String(b.dataset.aba === nome));
  for (const a of ['mapa', 'rede', 'lista', 'pecs']) document.getElementById(`vis-${a}`).hidden = a !== nome;
  history.replaceState(null, '', `#${nome}`);
  desenharLegenda();
}
for (const b of document.querySelectorAll('.abas button')) b.addEventListener('click', () => abrirAba(b.dataset.aba));

// ---------- busca ----------

const campo = document.getElementById('busca');
const resultados = document.getElementById('busca-resultados');
const indexar = (p) => ({
  p, texto: semAcento([p.nome, p.nomeCompleto, p.partido, p.pasta, p.municipio, p.cargoEleito && CARGO_ELEITO[p.cargoEleito], p.uf, dados.ufPorSigla.get(p.uf)?.nome, CARGOS[p.cargo].curto].filter(Boolean).join(' ')),
});
const indice = dados.pessoas.map(indexar);
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
    h('li', {}, 'Prefeitos: ', link('resultado oficial do TSE', 'https://resultados.tse.jus.br/'), ' da eleição de 2024. É quem foi eleito, não necessariamente quem está no cargo hoje.'),
    h('li', {}, 'Eleitos em 2026 que ainda não assumiram aparecem na busca e na lista como “Eleito(a) em 2026”, com aviso na ficha. A posse é em janeiro (governadores) e fevereiro (Congresso) de 2027.'),
    h('li', {}, 'Transição 2027 (⇄): ', link('resultado oficial do TSE', 'https://resultados.tse.jus.br/'), ' da eleição de 2026, cruzado pelo nome com quem está no cargo hoje. Nomes escritos de forma diferente nas duas fontes podem não casar, e aí a pessoa aparece como "sai" por engano.'),
    h('li', {}, 'PECs: ', link('Dados Abertos da Câmara', 'https://dadosabertos.camara.leg.br/'), ' e do Senado. Só votações nominais de plenário; as simbólicas não registram voto individual.'),
    h('li', {}, 'Mapa e lista de estados: ', link('IBGE', 'https://servicodados.ibge.gov.br/api/docs/'), '.')),
  h('h4', {}, 'Esquerda × direita'),
  h('p', {}, 'Não existe medida oficial. O site mostra duas coisas separadas e diz qual é qual:'),
  h('ul', {},
    h('li', {}, h('b', {}, 'Posição do partido: '), dados.fontePartidos, ' A porcentagem é só essa nota convertida (nota 7 = 70% direita). Vale para o partido inteiro, não para a pessoa. Nas cores, o vermelho e o azul cheios aparecem a partir de 2 e de 8: no intervalo todo, como nenhum partido com gente em cargo chega perto das pontas, tudo sairia cinzento.'),
    h('li', {}, h('b', {}, 'Voto no plenário (só senadores): '), `nas votações nominais em que a maioria do ${dados.votos.poloEsquerda} e a maioria do ${dados.votos.poloDireita} ficaram em lados opostos, de que lado o senador votou. Mede alinhamento de voto, não ideologia.`)),
  h('h4', {}, 'Porcentagem de esquerda e direita'),
  h('p', {}, 'Em cada grupo, conta quantas pessoas são de partido com nota abaixo de 5 (esquerda), acima de 5 (direita) ou exatamente no meio. A porcentagem é sobre quem tem partido conhecido, e a parte hachurada da barra mostra de quanta gente não se sabe — nos ministros isso é a maioria. É contagem de cabeças pela posição do partido, não medida de força política: um partido grande e um pequeno pesam igual.'),
  h('h4', {}, 'Investigações e notícias'),
  h('p', {}, 'O site não afirma nada sobre ninguém: só reúne links. As listas são geradas por busca automática pelo nome, sem revisão humana, e erram — homônimos e simples citações aparecem. Investigado, réu e condenado são situações jurídicas diferentes, e só a fonte original diz qual é o caso.'));

document.getElementById('atualizado').textContent =
  `Dados coletados em ${fmtData(dados.geradoEm)}. Projeto pessoal, sem vínculo com governo ou partido.`;

// ---------- início ----------

// ---------- prefeitos (arquivo grande, carregado depois que a tela já abriu) ----------

carregar('prefeitos.json').then((prefeitos) => {
  dados.prefeitos = prefeitos;
  dados.nomeMunicipio = new Map();
  for (const [uf, lista] of Object.entries(prefeitos.porUf)) {
    for (const m of lista) {
      dados.nomeMunicipio.set(m.ibge, m.municipio);
      if (m.pendente) continue;
      const p = { ...m, id: `prefeito-${m.ibge}`, cargo: 'prefeito', uf };
      dados.pessoas.push(p);
      dados.pessoaPorId.set(p.id, p);
      indice.push(indexar(p));
    }
  }
}).catch(() => {
  dados.prefeitos = null;   // sem o arquivo o resto do site segue funcionando
}).finally(() => {
  pintar();
  redesenharLista();
  rede.atualizarPrefeitos();
  if (selecaoAtual.uf && !selecaoAtual.pessoa) painel.uf(selecaoAtual.uf);
});

let temaSalvo = null;
try { temaSalvo = localStorage.getItem('tema'); } catch { /* modo privado */ }
aplicarTema(temaSalvo === 'claro' || temaSalvo === 'escuro' ? temaSalvo : 'sistema');
painel.resumo();
const inicial = location.hash.slice(1);
if (['rede', 'lista', 'pecs'].includes(inicial)) abrirAba(inicial);
// Link direto pra ficha de alguém (#p=senador-123), usado pelas páginas
// estáticas que os buscadores indexam. Prefeito só existe depois que
// prefeitos.json carrega, então esse caso espera.
const pessoaInicial = inicial.startsWith('p=') ? decodeURIComponent(inicial.slice(2)) : null;
if (pessoaInicial && dados.pessoaPorId.has(pessoaInicial)) acoes.aoEscolherPessoa(pessoaInicial);

// ---------- PECs (carregadas depois, como os prefeitos) ----------

carregar('pecs.json').then((pecs) => { dados.pecs = pecs; }).catch(() => { dados.pecs = null; }).finally(() => {
  abaPecs.atualizar();
  if (selecaoAtual.pessoa) painel.pessoa(selecaoAtual.pessoa);
});
