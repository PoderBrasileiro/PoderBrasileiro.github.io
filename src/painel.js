// Painel lateral: resumo, UF, lista de ministros ou ficha de uma pessoa.

import { h, trocar, CARGOS, textoPartido, ondeAtua, fmtNum, fmtData } from './comum.js';

function avatar(p, grande = false) {
  const iniciais = p.nome.split(/\s+/).filter((s) => s.length > 2).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  const caixa = h('span', { class: `avatar${grande ? ' grande' : ''}`, 'aria-hidden': 'true' }, iniciais);
  if (p.foto) {
    // Foto que não carrega (arquivo renomeado no Commons, por exemplo) some e
    // deixa as iniciais; nunca um ícone de imagem quebrada.
    const img = h('img', { src: p.foto, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    caixa.append(img);
  }
  return caixa;
}

function cartao(p, dados, aoEscolherPessoa) {
  return h('button', { class: 'cartao', onclick: () => aoEscolherPessoa(p.id) },
    avatar(p),
    h('span', { class: 'cartao-texto' },
      h('b', {}, p.nome),
      h('small', {}, `${CARGOS[p.cargo].curto}${p.interino ? ' (interino)' : ''} · ${textoPartido(p)}`),
      p.cargo === 'ministro' ? h('small', {}, p.pasta) : null));
}

// Régua 0–10 com um marcador. `rotulos` são as duas pontas.
function regua(fracaoDireita, rotulos) {
  return h('div', { class: 'regua' },
    h('div', { class: 'regua-trilho' }, h('span', { class: 'regua-marca', style: `left:${fracaoDireita * 100}%` })),
    h('div', { class: 'regua-pontas' }, h('span', {}, rotulos[0]), h('span', {}, rotulos[1])));
}

function blocoEspectro(p, dados) {
  const sec = h('section', {}, h('h3', {}, 'Esquerda × direita'));
  if (p.partido === undefined) {
    return sec.append(h('p', { class: 'fraco' }, 'A fonte oficial não informa o partido desta pessoa, então não há posição a mostrar. Dá pra preencher à mão em data/manual.json.')), sec;
  }
  if (p.partido === null) {
    return sec.append(h('p', { class: 'fraco' }, 'Sem filiação partidária — não há posição de partido a mostrar.')), sec;
  }
  const info = dados.partidos[p.partido];
  if (!info) {
    return sec.append(h('p', { class: 'fraco' }, `O partido ${p.partido} não está na tabela de classificação usada pelo site.`)), sec;
  }
  const dir = info.posicao / 10;
  sec.append(
    h('p', { class: 'numero' },
      h('b', {}, `${Math.round((1 - dir) * 100)}%`), ' esquerda · ',
      h('b', {}, `${Math.round(dir * 100)}%`), ' direita'),
    regua(dir, ['esquerda', 'direita']),
    h('p', { class: 'fraco' },
      `Posição do ${p.partido} (${info.nome}): ${fmtNum(info.posicao, 2)} numa régua de 0 a 10, segundo classificação feita por cientistas políticos. `,
      'É a posição do partido, não uma medida desta pessoa.',
      info.origem === 'estimado' ? ` Valor estimado: ${info.nota}` : ''));
  return sec;
}

function blocoVotos(p, dados) {
  if (p.cargo !== 'senador') return null;
  const v = dados.votos;
  const sec = h('section', {}, h('h3', {}, 'Como votou no plenário'));
  if (!p.votos) {
    sec.append(h('p', { class: 'fraco' }, 'Sem voto registrado nas votações nominais do período.'));
    return sec;
  }
  const total = p.votos.comEsquerda + p.votos.comDireita;
  const dir = p.votos.comDireita / total;
  sec.append(
    h('p', { class: 'numero' },
      h('b', {}, `${Math.round((1 - dir) * 100)}%`), ` com o ${v.poloEsquerda} · `,
      h('b', {}, `${Math.round(dir * 100)}%`), ` com o ${v.poloDireita}`),
    regua(dir, [`maioria do ${v.poloEsquerda}`, `maioria do ${v.poloDireita}`]),
    h('p', { class: 'fraco' },
      `Em ${total} de ${v.votacoesDivididas} votações nominais (${fmtData(v.de)} a ${fmtData(v.ate)}) em que a maioria do ${v.poloEsquerda} e a do ${v.poloDireita} votaram em lados opostos. `,
      total < 10 ? 'Poucos votos: leia com cautela. ' : '',
      'Fonte: Dados Abertos do Senado.'));
  return sec;
}

function blocoNoticias(p, dados) {
  const nome = p.nome;
  const completo = p.nomeCompleto ?? p.nome;
  const q = encodeURIComponent;
  const sec = h('section', { class: 'noticias' },
    h('h3', {}, 'Investigações e notícias'),
    h('p', { class: 'aviso' },
      h('b', {}, 'Resultados automáticos. '),
      'Tudo abaixo é busca pelo nome, sem curadoria: pode trazer homônimos e matérias em que a pessoa só é citada. Ser citado ou investigado não é ser culpado — confira sempre a fonte original.'));

  const reg = dados.noticias?.porId?.[p.id];
  if (reg?.itens?.length) {
    sec.append(h('ul', { class: 'lista-noticias' }, reg.itens.map((n) =>
      h('li', {},
        h('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.titulo),
        h('small', {}, [n.fonte, fmtData(n.data)].filter(Boolean).join(' · '))))),
    h('p', { class: 'fraco' }, `Dos feeds RSS de ${(dados.noticias.fontes ?? []).join(', ')}. Atualizado em ${fmtData(reg.buscadoEm)}.`));
  } else {
    sec.append(h('p', { class: 'fraco' }, reg
      ? 'Nenhuma manchete recente dos veículos acompanhados cita este nome junto de termos de investigação.'
      : 'Ainda não há coleta automática para este nome. Use as buscas abaixo.'));
  }

  const buscas = [
    ['Google Notícias', `https://news.google.com/search?q=${q(`"${nome}" investigação OR inquérito OR denúncia`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`],
    ['Processos no STF', `https://portal.stf.jus.br/processos/listarPartes.asp?termo=${q(completo)}`],
    ['Portal da Transparência', `https://portaldatransparencia.gov.br/busca?termo=${q(completo)}`],
  ];
  sec.append(
    h('p', { class: 'rotulo' }, 'Buscar ao vivo, direto na fonte:'),
    h('ul', { class: 'buscas' }, buscas.map(([rotulo, url]) =>
      h('li', {}, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, rotulo, ' ↗')))));
  return sec;
}

export function criarPainel(raiz, dados, { aoEscolherPessoa, aoEscolherUf, aoVerMinistros }) {
  const voltar = (rotulo, acao) => h('button', { class: 'voltar', onclick: acao }, `← ${rotulo}`);

  return {
    resumo() {
      const conta = (c) => dados.pessoas.filter((p) => p.cargo === c).length;
      trocar(raiz, 
        h('h2', {}, 'Comece por aqui'),
        h('p', {}, 'Clique num estado do mapa pra ver o governador e os senadores, ou numa bolinha da rede de poder pra abrir a ficha de alguém.'),
        h('ul', { class: 'contagem' },
          h('li', {}, h('b', {}, '2'), ' na Presidência'),
          h('li', {}, h('b', {}, conta('ministro')), ' ministros'),
          h('li', {}, h('b', {}, conta('governador')), ' governadores'),
          h('li', {}, h('b', {}, conta('senador')), ' senadores')),
        h('button', { class: 'botao', onclick: aoVerMinistros }, 'Ver os ministros'));
    },

    uf(sigla) {
      const u = dados.ufPorSigla.get(sigla);
      const gente = dados.pessoas.filter((p) => p.uf === sigla);
      const gov = gente.filter((p) => p.cargo === 'governador');
      const sen = gente.filter((p) => p.cargo === 'senador');
      trocar(raiz, 
        h('p', { class: 'sobretitulo' }, `Região ${u.regiao}`),
        h('h2', {}, `${u.nome} (${u.sigla})`),
        h('h3', {}, 'Governo do estado'),
        gov.length ? gov.map((p) => cartao(p, dados, aoEscolherPessoa)) : h('p', { class: 'fraco' }, 'Não encontrado.'),
        h('h3', {}, `Senadores (${sen.length})`),
        sen.map((p) => cartao(p, dados, aoEscolherPessoa)));
    },

    ministros() {
      const lista = dados.pessoas.filter((p) => p.cargo === 'ministro')
        .sort((a, b) => a.pasta.localeCompare(b.pasta, 'pt'));
      trocar(raiz, 
        h('p', { class: 'sobretitulo' }, 'Governo federal'),
        h('h2', {}, `Ministros (${lista.length})`),
        h('p', { class: 'fraco' }, `Fonte: página oficial do Planalto${dados.ministrosAtualizadoEm ? `, atualizada em ${dados.ministrosAtualizadoEm}` : ''}.`),
        lista.map((p) => cartao(p, dados, aoEscolherPessoa)));
    },

    pessoa(id) {
      const p = dados.pessoaPorId.get(id);
      const desde = fmtData(p.desde);
      const origem = p.cargo === 'ministro' ? voltar('Ministros', aoVerMinistros)
        : p.uf ? voltar(dados.ufPorSigla.get(p.uf).nome, () => aoEscolherUf(p.uf)) : null;
      const links = [
        p.links?.oficial && ['Página oficial', p.links.oficial],
        p.links?.wikipedia && ['Wikipédia', p.links.wikipedia],
      ].filter(Boolean);

      trocar(raiz, 
        origem,
        h('div', { class: 'ficha-topo' },
          avatar(p, true),
          h('div', {},
            h('p', { class: 'sobretitulo' }, `${CARGOS[p.cargo].rotulo}${p.interino ? ' — interino' : ''}`),
            h('h2', {}, p.nome),
            h('p', {}, [ondeAtua(p, dados), textoPartido(p)].join(' · ')),
            desde ? h('p', { class: 'fraco' }, `No cargo desde ${desde}`) : null)),
        blocoEspectro(p, dados),
        blocoVotos(p, dados),
        blocoNoticias(p, dados),
        links.length ? h('section', {}, h('h3', {}, 'Mais sobre'),
          h('ul', { class: 'buscas' }, links.map(([r, u]) =>
            h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, r, ' ↗'))))) : null);
      raiz.scrollTop = 0;
    },
  };
}


