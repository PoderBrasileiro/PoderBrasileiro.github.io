// Painel lateral: resumo, UF, lista de ministros ou ficha de uma pessoa.

import { h, trocar, CARGOS, CARGO_ELEITO, SITUACOES, destinoDe, selo, textoPartido, ondeAtua, fmtNum, fmtData, semAcento } from './comum.js';
import { anosNoCargo, ehMonarquia, faixaDoPais, mandaNoPais } from './mundo.js';
import { ROTULO_VOTO, placarCurto } from './pecs.js';

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
      p.cargo === 'ministro' ? h('small', {}, p.pasta) : null,
      selo(p, dados)));
}

// Régua 0–10 com um marcador. `rotulos` são as duas pontas.
function regua(fracaoDireita, rotulos) {
  return h('div', { class: 'regua' },
    h('div', { class: 'regua-trilho' }, h('span', { class: 'regua-marca', style: `left:${fracaoDireita * 100}%` })),
    h('div', { class: 'regua-pontas' }, h('span', {}, rotulos[0]), h('span', {}, rotulos[1])));
}

function blocoEspectro(p, dados) {
  const sec = h('section', {}, h('h3', {}, 'Esquerda × direita'));
  if (p.cargo === 'stf') {
    return sec.append(h('p', { class: 'fraco' }, `Ministros do STF não têm filiação partidária, então não há posição a mostrar.${p.indicadoPor ? ` Indicado(a) ao tribunal por ${p.indicadoPor}.` : ''}`)), sec;
  }
  if (p.partido === undefined) {
    return sec.append(h('p', { class: 'fraco' }, 'A fonte oficial não informa o partido, então não há posição a mostrar.')), sec;
  }
  if (p.partido === null) {
    return sec.append(h('p', { class: 'fraco' }, 'Sem filiação partidária.')), sec;
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
      'Vale para o partido, não para a pessoa.',
      info.origem === 'estimado' ? ` Valor estimado: ${info.nota}` : ''));
  return sec;
}

// O que acontece com a pessoa em 2027, segundo o resultado de 2026.
function blocoDestino(p, dados) {
  const d = destinoDe(p, dados);
  if (!d) return null;
  return h('section', {}, h('h3', {}, '⇄ Em 2027'), selo(p, dados), h('p', {}, d.texto));
}

const comPartido = (c) => `${c.nome} (${c.partido ?? 'sem partido'})`;
const duelo = (cands) => cands.map((c) => `${comPartido(c)}${c.pct ? ` ${c.pct}%` : ''}`).join(' × ');

// Quem assume no estado em 2027: governador, senadores e deputados eleitos.
function blocoChegam(sigla, dados) {
  const e = dados.eleicao?.porUf?.[sigla];
  if (!e) return null;
  const linha = (c) => h('li', {}, h('span', { class: 'prefeito-linha' },
    h('b', {}, c.nome, c.novo ? h('span', { class: 'selo selo-novo' }, 'novo') : null),
    h('small', {}, c.partido ?? 'sem partido')));
  const g = e.governador;
  const novos = e.deputados.filter((d) => d.novo).length;
  return h('section', {}, h('h3', {}, '⇄ A partir de 2027'),
    h('p', {}, h('b', {}, 'Governo: '), g.status === 'eleito'
      ? `${comPartido(g.eleito)}${g.eleito.novo ? '' : ', reeleito(a)'}${g.eleito.vice ? `; vice ${g.eleito.vice.nome}` : ''}.`
      : `2º turno em ${dados.eleicao.segundoTurnoEm}: ${duelo(g.candidatos)}.`),
    h('p', { class: 'rotulo' }, `Senadores eleitos (${e.senadores.length})`),
    h('ul', { class: 'prefeitos' }, e.senadores.map(linha)),
    h('p', { class: 'rotulo' }, `Deputados federais eleitos (${e.deputados.length}): ${e.deputados.length - novos} reeleitos, ${novos} novos`),
    h('ul', { class: 'prefeitos' }, e.deputados.map(linha)));
}

// Placar da transição pro painel inicial.
function resumoTransicao(dados) {
  const e = dados.eleicao;
  if (!e) return null;
  const conta = (cargo) => {
    const c = {};
    for (const p of dados.pessoas) {
      if (p.cargo !== cargo) continue;
      const s = e.destino[p.id]?.situacao;
      if (s) c[s] = (c[s] ?? 0) + 1;
    }
    return Object.keys(SITUACOES).filter((s) => c[s]).map((s) => `${SITUACOES[s].icone} ${c[s]} ${SITUACOES[s].rotulo.toLowerCase()}`).join(' · ');
  };
  const emAberto = Object.entries(e.porUf).filter(([, u]) => u.governador.status === 'segundo-turno').map(([uf]) => uf);
  return h('section', {}, h('h3', {}, '⇄ Transição 2027'),
    h('p', {}, h('b', {}, 'Presidência: '), e.presidente.status === 'eleito'
      ? `eleito ${comPartido(e.presidente.eleito)}.`
      : `2º turno em ${e.segundoTurnoEm}: ${duelo(e.presidente.candidatos)}.`),
    h('p', {}, h('b', {}, 'Governadores: '), conta('governador'), emAberto.length ? `. 2º turno em ${emAberto.join(', ')}.` : '.'),
    h('p', {}, h('b', {}, 'Senadores: '), conta('senador'), '.'),
    h('p', {}, h('b', {}, 'Deputados federais: '), conta('deputado'), '.'),
    h('p', { class: 'fraco' }, 'Resultado oficial do TSE cruzado com quem está no cargo. Posses em janeiro e fevereiro de 2027.'));
}

function blocoVotos(p, dados) {
  if (p.cargo !== 'senador') return null;
  const v = dados.votos;
  const sec = h('section', {}, h('h3', {}, 'Como votou no plenário'));
  if (!p.votos) {
    sec.append(h('p', { class: 'fraco' }, 'Sem voto registrado no período.'));
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
      'Busca pelo nome, sem curadoria: pode trazer homônimo ou simples citação. Ser investigado não é ser culpado.'));

  const reg = dados.noticias?.porId?.[p.id];
  if (reg?.itens?.length) {
    sec.append(h('ul', { class: 'lista-noticias' }, reg.itens.map((n) =>
      h('li', {},
        h('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.titulo),
        h('small', {}, [n.fonte, fmtData(n.data)].filter(Boolean).join(' · '))))),
    h('p', { class: 'fraco' }, `Dos feeds RSS de ${(dados.noticias.fontes ?? []).join(', ')}. Atualizado em ${fmtData(reg.buscadoEm)}.`));
  } else {
    sec.append(h('p', { class: 'fraco' }, reg
      ? 'Nenhuma manchete recente cita este nome junto de termos de investigação.'
      : 'Sem coleta automática para este nome ainda.'));
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

export function criarPainel(raiz, dados, { aoEscolherPessoa, aoEscolherUf, aoVerMinistros, aoEscolherPais, aoAbrirPais, aoVerBrasil, linkAtual }) {
  // Copia o endereço do que está aberto. O clipboard falha em http sem TLS e
  // quando o usuário nega a permissão; nesses casos o link aparece pra copiar
  // à mão, que é melhor que um botão que não faz nada.
  function compartilhar() {
    const botao = h('button', { class: 'compartilhar' }, '⧉ Copiar link');
    botao.addEventListener('click', async () => {
      const url = linkAtual();
      try {
        await navigator.clipboard.writeText(url);
        botao.textContent = '✓ Link copiado';
        setTimeout(() => { botao.textContent = '⧉ Copiar link'; }, 2500);
      } catch {
        const campo = h('input', { class: 'filtro', value: url, readonly: true, 'aria-label': 'Link para copiar' });
        botao.replaceWith(campo);
        campo.select();
      }
    });
    return botao;
  }

  const voltar = (rotulo, acao) => h('button', { class: 'voltar', onclick: acao }, `← ${rotulo}`);

  function blocoDeputados(lista) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    return h('section', {}, h('h3', {}, `Deputados federais (${lista.length})`),
      h('ul', { class: 'prefeitos' }, lista.map((p) => h('li', {},
        h('button', { class: 'prefeito-linha', onclick: () => aoEscolherPessoa(p.id) }, h('b', {}, p.nome), h('small', {}, textoPartido(p)))))));
  }

  // Como a pessoa votou em cada PEC: o voto da votação mais recente de cada uma.
  function blocoPecs(p) {
    if (p.cargo !== 'deputado' && p.cargo !== 'senador') return null;
    const sec = h('section', {}, h('h3', {}, 'Votos em PECs'));
    if (dados.pecs === undefined) return sec.append(h('p', { class: 'fraco' }, 'Carregando…')), sec;
    const linhas = [];
    for (const pec of dados.pecs?.pecs ?? []) {
      for (const v of pec.votacoes) {
        const voto = Object.keys(v.votos).find((t) => v.votos[t].includes(p.id));
        if (!voto) continue;
        // Sem a aba de PECs, a linha não leva a lugar nenhum dentro do site:
        // o link vai pra tramitação na casa, que é onde está a proposta inteira.
        linhas.push(h('li', {}, h('a', { class: 'prefeito-linha', href: pec.link, target: '_blank', rel: 'noopener noreferrer' },
          h('b', {}, `${pec.titulo} — ${ROTULO_VOTO[voto] ?? voto}`),
          h('small', {}, `${fmtData(v.data)} · ${placarCurto(v)} · ${(pec.ementa ?? '').slice(0, 90)}…`))));
        break;   // só a votação mais recente de cada PEC
      }
    }
    sec.append(linhas.length ? h('ul', { class: 'prefeitos' }, linhas)
      : h('p', { class: 'fraco' }, 'Nenhum voto registrado nas votações nominais de PEC do período.'));
    return sec;
  }

  // Assembleia do estado: quem foi eleito em 2026 e assume em 2027.
  function blocoEstaduais(lista) {
    if (!lista.length) return null;
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    const sigla = lista[0].cargoEleito === 'distrital' ? 'Câmara Legislativa' : 'Assembleia Legislativa';
    return h('section', {}, h('h3', {}, `${sigla} — eleitos em 2026 (${lista.length})`),
      h('p', { class: 'fraco' }, 'Assumem em fevereiro de 2027. Quem está na assembleia hoje não está neste site.'),
      h('ul', { class: 'prefeitos' }, lista.map((p) => h('li', {},
        h('button', { class: 'prefeito-linha', onclick: () => aoEscolherPessoa(p.id) },
          h('b', {}, p.nome), h('small', {}, `${textoPartido(p)}${p.pct ? ` · ${p.pct}% dos votos` : ''}`))))));
  }

  // Lista de prefeitos do estado, com filtro. São centenas por UF, então é
  // uma linha por município em vez do cartão com foto.
  function blocoPrefeitos(sigla) {
    const sec = h('section', {}, h('h3', {}, 'Prefeitos eleitos em 2024'));
    if (sigla === 'DF') return sec.append(h('p', { class: 'fraco' }, 'O Distrito Federal não tem municípios nem prefeitos.')), sec;
    if (dados.prefeitos === undefined) return sec.append(h('p', { class: 'fraco' }, 'Carregando…')), sec;
    const lista = dados.prefeitos?.porUf?.[sigla];
    if (!lista) return sec.append(h('p', { class: 'fraco' }, 'Dados de prefeitos indisponíveis. Rode "npm run prefeitos".')), sec;

    const campo = h('input', { type: 'search', class: 'filtro', placeholder: `Filtrar ${lista.length} municípios…`, 'aria-label': 'Filtrar municípios' });
    const ul = h('ul', { class: 'prefeitos' });
    const desenhar = () => {
      const t = semAcento(campo.value.trim());
      const vis = lista.filter((m) => !t || semAcento(`${m.municipio} ${m.nome ?? ''} ${m.partido ?? ''}`).includes(t));
      trocar(ul, vis.length ? vis.map((m) => h('li', {}, m.pendente
        ? h('span', { class: 'prefeito-linha fraco' }, h('b', {}, m.municipio), h('small', {}, 'Sem eleito no resultado do TSE'))
        : h('button', { class: 'prefeito-linha', onclick: () => aoEscolherPessoa(`prefeito-${m.ibge}`) },
          h('b', {}, m.municipio), h('small', {}, `${m.nome} · ${m.partido ?? 'sem partido'}`))))
        : h('li', { class: 'fraco' }, 'Nenhum município encontrado.'));
    };
    campo.addEventListener('input', desenhar);
    desenhar();
    sec.append(campo, ul);
    return sec;
  }

  // Panorama do mundo, quando a aba Mundo está aberta e nenhum país escolhido.
  // Lidera pelo espectro, que é o que o mapa mostra; o tempo no poder vem
  // depois, como segunda leitura.
  function resumoMundo() {
    const paises = dados.mundo?.paises ?? [];
    if (!paises.length) return null;
    const conta = (f) => paises.filter((p) => faixaDoPais(p) === f).length;
    const esquerda = conta('esquerda') + conta('centro-esquerda');
    const direita = conta('direita') + conta('centro-direita');
    // Quem governa sem partido mas foi eleito por um conhecido já entrou nas
    // contas de cima, pela faixa: aqui fica só quem não tem nem uma coisa nem
    // outra, senão a soma passa de 195.
    const semPartido = paises.filter((p) => p.semPartido && !faixaDoPais(p)).length;
    const semFaixa = paises.filter((p) => !p.semPartido && !faixaDoPais(p)).length;

    const velhos = paises
      .map((x) => ({ p: x, a: anosNoCargo(x.estado?.desde) }))
      .filter((x) => x.a != null && !ehMonarquia(x.p)).sort((x, y) => y.a - x.a).slice(0, 5);

    return [
      h('section', {}, h('h3', {}, 'Quem governa, hoje'),
        h('ul', { class: 'contagem' },
          h('li', {}, h('b', {}, esquerda), ' países de esquerda ou centro-esquerda'),
          h('li', {}, h('b', {}, conta('centro')), ' de centro'),
          h('li', {}, h('b', {}, direita), ' de direita ou centro-direita'),
          h('li', {}, h('b', {}, semPartido), ' governados por quem não tem partido')),
        h('p', { class: 'fraco' }, `Faltam ${semFaixa}, onde o partido existe mas ninguém o classificou. A faixa é a do partido de quem governa — não é uma nota do país.`)),
      h('section', {}, h('h3', {}, 'Mais tempo no cargo'),
        h('ul', { class: 'prefeitos' }, velhos.map(({ p: x, a }) => h('li', {},
          h('button', { class: 'prefeito-linha', onclick: () => aoEscolherPais(x.iso) },
            h('b', {}, `${x.nome} — ${x.estado.nome}`),
            h('small', {}, `há ${fmtNum(a, 0)} anos`))))),
        h('p', { class: 'fraco' }, 'Monarca hereditário fica fora: herdar o trono não é a mesma coisa que não sair do poder.')),
    ];
  }

  return {
    resumo(mundo) {
      if (mundo) {
        const r = resumoMundo();
        if (r) {
          return trocar(raiz, compartilhar(), h('h2', {}, 'O poder no mundo'),
            h('p', {}, 'Clique num país para ver quem governa. Dois cliques abrem as divisões internas dele.'), r);
        }
      }
      return this.resumoBrasil();
    },
    resumoBrasil() {
      const conta = (c) => dados.pessoas.filter((p) => p.cargo === c).length;
      trocar(raiz, 
        h('h2', {}, 'Comece por aqui'),
        h('p', {}, 'Clique num estado do mapa para abrir quem está lá.'),
        h('ul', { class: 'contagem' },
          h('li', {}, h('b', {}, '2'), ' na Presidência'),
          h('li', {}, h('b', {}, conta('ministro')), ' ministros'),
          h('li', {}, h('b', {}, conta('governador')), ' governadores'),
          h('li', {}, h('b', {}, conta('senador')), ' senadores'),
          h('li', {}, h('b', {}, conta('deputado')), ' deputados federais'),
          h('li', {}, h('b', {}, conta('stf')), ' ministros do STF')),
        h('button', { class: 'botao', onclick: aoVerMinistros }, 'Ver os ministros'),
        resumoTransicao(dados));
    },

    uf(sigla) {
      const u = dados.ufPorSigla.get(sigla);
      const gente = dados.pessoas.filter((p) => p.uf === sigla);
      const gov = gente.filter((p) => p.cargo === 'governador');
      const sen = gente.filter((p) => p.cargo === 'senador');
      trocar(raiz, 
        h('p', { class: 'sobretitulo' }, `Região ${u.regiao}`),
        h('h2', {}, `${u.nome} (${u.sigla})`),
        compartilhar(),
        h('h3', {}, 'Governo do estado'),
        gov.length ? gov.map((p) => cartao(p, dados, aoEscolherPessoa)) : h('p', { class: 'fraco' }, 'Não encontrado.'),
        h('h3', {}, `Senadores (${sen.length})`),
        sen.map((p) => cartao(p, dados, aoEscolherPessoa)),
        blocoChegam(sigla, dados),
        blocoDeputados(gente.filter((p) => p.cargo === 'deputado')),
        blocoEstaduais(gente.filter((p) => p.cargo === 'eleito' && ['estadual', 'distrital'].includes(p.cargoEleito))),
        blocoPrefeitos(sigla));
    },

    ministros() {
      const lista = dados.pessoas.filter((p) => p.cargo === 'ministro')
        .sort((a, b) => a.pasta.localeCompare(b.pasta, 'pt'));
      trocar(raiz, 
        h('p', { class: 'sobretitulo' }, 'Governo federal'),
        h('h2', {}, `Ministros (${lista.length})`),
        compartilhar(),
        h('p', { class: 'fraco' }, `Fonte: página oficial do Planalto${dados.ministrosAtualizadoEm ? `, atualizada em ${dados.ministrosAtualizadoEm}` : ''}.`),
        lista.map((p) => cartao(p, dados, aoEscolherPessoa)));
    },

    // Ficha de um estado, província ou departamento. O Brasil não passa por
    // aqui: lá o clique abre a ficha da UF, que tem muito mais coisa.
    divisao(codigo, sobre, mapaDasDivisoes) {
      const d = mapaDasDivisoes?.[codigo] ?? null;
      const pais = (dados.mundo?.paises ?? []).find((p) => p.iso === (sobre?.pais ?? codigo.slice(0, 2)));
      const nome = d?.nome ?? sobre?.nome ?? codigo;
      const anos = (desde) => {
        const a = anosNoCargo(desde);
        return a == null ? null : `há ${fmtNum(a, a < 10 ? 1 : 0)} ano${a >= 2 ? 's' : ''}`;
      };
      trocar(raiz,
        compartilhar(),
        h('p', { class: 'sobretitulo' }, [sobre?.tipo, pais?.nome].filter(Boolean).join(' · ') || 'Divisão'),
        h('h2', {}, nome),
        h('p', { class: 'fraco' }, `Código ISO ${codigo}`),
        d
          ? h('section', {}, h('h3', {}, 'Chefe de governo'),
            h('p', {}, h('b', {}, d.pessoa)),
            h('p', { class: 'fraco' }, [d.partido ?? 'sem partido', anos(d.desde) && `no cargo ${anos(d.desde)}`].filter(Boolean).join(' · ')),
            d.faixa ? h('p', {}, h('span', { class: 'selo', 'data-faixa': d.faixa }, d.posicaoRotulo ?? d.faixa)) : null,
            h('p', { class: 'fraco' }, d.faixa
              ? 'Faixa do partido, pela Wikidata. Vale pro partido, não pra pessoa.'
              : d.semPartido ? 'Eleito sem filiação partidária.' : 'O partido existe, mas ninguém o classificou no espectro.'),
            h('ul', { class: 'buscas' }, h('li', {}, h('a', { href: d.wikidata, target: '_blank', rel: 'noopener noreferrer' }, 'Conferir na Wikidata ↗'))))
          : h('section', {}, h('h3', {}, 'Quem governa aqui'),
            h('p', { class: 'fraco' }, 'Não está nos dados. A Wikidata cobre bem os estados dos países grandes e quase nada da África e do Oriente Médio — por isso esta divisão aparece com a cor do país, não com a dela.')),
        pais ? h('section', {}, h('h3', {}, 'No país'),
          h('p', {}, h('button', { class: 'botao vazio', onclick: () => aoEscolherPais(pais.iso) }, `Ver ${pais.nome}`))) : null,
        d?.desde ? h('p', { class: 'fraco' }, 'A data de posse está aqui de propósito: governante que saiu sem alguém fechar a declaração na Wikidata continua aparecendo, e uma data muito antiga é o sinal disso.') : null);
      raiz.scrollTop = 0;
    },

    // Ficha de um país: quem governa, há quanto tempo, e o que se sabe do
    // partido. Tudo com link pra Wikidata, que é de onde vem e onde se corrige.
    pais(iso) {
    const d = (dados.mundo?.paises ?? []).find((p) => p.iso === iso);
    if (!d) return this.resumo();
    const anos = (desde) => {
      const a = anosNoCargo(desde);
      return a == null ? null : `há ${fmtNum(a, a < 10 ? 1 : 0)} ano${a >= 2 ? 's' : ''}`;
    };

    // De onde saiu a faixa. É a parte que o leitor precisa pra discordar com
    // conhecimento de causa: a Wikidata dizendo, um survey de 2019 medindo,
    // uma dedução a partir das correntes do partido, ou escolha deste site.
    const ORIGEM = {
      alinhamento: 'Classificação da própria Wikidata para o partido.',
      survey: 'Posição do partido no Global Party Survey de 2019, survey com cientistas políticos.',
      ideologia: 'Deduzida das correntes que o partido declara na Wikidata — comunismo, social-democracia, conservadorismo e afins. É leitura deste site, não classificação de ninguém.',
      manual: 'Classificação deste site — a Wikidata não traz nenhuma, ou quem governa não tem partido:',
    };

    const bloco = (titulo, c) => {
      if (!c) return null;
      const tempo = anos(c.desde);
      return h('section', {}, h('h3', {}, titulo),
        h('p', {}, h('b', {}, c.nome)),
        h('p', { class: 'fraco' }, [c.partido ?? 'sem partido', tempo && `no cargo ${tempo}`].filter(Boolean).join(' · ')),
        c.faixa
          ? h('div', {},
            h('p', {}, h('span', { class: 'selo', 'data-faixa': c.faixa }, c.posicaoRotulo ?? c.faixa)),
            c.posicao != null
              ? h('div', {},
                h('p', { class: 'numero' }, h('b', {}, fmtNum(c.posicao, 1)), ' de 10 na régua esquerda–direita'),
                regua(c.posicao / 10, ['esquerda', 'direita']))
              : null,
            h('p', { class: 'fraco' }, ORIGEM[c.faixaFonte] ?? ''),
            c.motivo ? h('p', { class: 'fraco' }, c.motivo, c.motivoFonte ? [' ', h('a', { href: c.motivoFonte, target: '_blank', rel: 'noopener noreferrer' }, 'Fonte ↗')] : null) : null,
            c.partidoNoSurvey && c.partidoNoSurvey !== c.partido
              ? h('p', { class: 'fraco' }, `No survey o partido aparece como “${c.partidoNoSurvey}”.`) : null)
          : c.semPartido
            ? h('p', { class: 'fraco' }, d.motivoSemPartido?.motivo ?? 'Governa sem filiação partidária, e não se sabe por qual partido foi eleito — então não há posição de partido para mostrar.')
            : h('p', { class: 'fraco' }, 'O partido existe, mas ninguém o classificou no espectro: nem a Wikidata, nem o survey.'),
        h('ul', { class: 'buscas' }, h('li', {}, h('a', { href: c.wikidata, target: '_blank', rel: 'noopener noreferrer' }, 'Conferir na Wikidata ↗'))));
    };

    trocar(raiz,
      compartilhar(),
      h('p', { class: 'sobretitulo' }, d.forma ?? 'País'),
      h('h2', {}, d.nome),
      h('p', {},
        h('button', { class: 'botao', onclick: () => aoAbrirPais(d.iso) }, 'Ver as divisões internas'),
        d.iso === 'BR' ? [' ', h('button', { class: 'botao vazio', onclick: aoVerBrasil }, 'O Brasil por dentro')] : null),
      d.semPartido && d.motivoSemPartido
        ? h('p', { class: 'aviso' }, h('b', {}, 'Governa sem partido. '), d.motivoSemPartido.motivo)
        : null,
      d.acumula
        ? bloco('Chefe de Estado e de governo', d.estado)
        : [bloco('Chefe de Estado', d.estado), bloco('Chefe de governo', d.governo)],
      h('section', {}, h('h3', {}, 'De onde vem'),
        h('p', { class: 'fraco' }, 'Quem ocupa o cargo e o partido vêm da Wikidata, editada por voluntários — em país com troca rápida de governo ela pode estar atrasada. As divisões internas são da Natural Earth, em domínio público.'),
        h('ul', { class: 'buscas' }, h('li', {}, h('a', { href: d.wikidata, target: '_blank', rel: 'noopener noreferrer' }, 'O país na Wikidata ↗')))));
    raiz.scrollTop = 0;
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
            h('p', { class: 'sobretitulo' }, `${CARGOS[p.cargo].rotulo}${p.interino ? ' — interino' : ''}${p.funcao ? ` — ${p.funcao}` : ''}`),
            h('h2', {}, p.nome),
            h('p', {}, [ondeAtua(p, dados), textoPartido(p)].join(' · ')),
            desde ? h('p', { class: 'fraco' }, `No cargo desde ${desde}`) : null,
            p.vice ? h('p', { class: 'fraco' }, `Vice: ${p.vice.nome} · ${p.vice.partido ?? 'sem partido'}`) : null)),
        p.cargo === 'eleito' ? h('p', { class: 'aviso' },
          h('b', {}, 'Ainda não assumiu. '),
          `Eleito(a) em 2026${p.pct ? `, com ${p.pct}% dos votos válidos` : ''}. A posse é em ${p.cargoEleito === 'governador' ? 'janeiro' : 'fevereiro'} de 2027.`) : null,
        p.cargo === 'prefeito' ? h('p', { class: 'aviso' },
          h('b', {}, 'Resultado da eleição de 2024. '),
          'Quem o TSE registra como eleito, pelo partido de então. Pode não ser quem está no cargo hoje.') : null,
        compartilhar(),
        blocoDestino(p, dados),
        blocoEspectro(p, dados),
        blocoVotos(p, dados),
        blocoPecs(p),
        blocoNoticias(p, dados),
        links.length ? h('section', {}, h('h3', {}, 'Mais sobre'),
          h('ul', { class: 'buscas' }, links.map(([r, u]) =>
            h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, r, ' ↗'))))) : null);
      raiz.scrollTop = 0;
    },
  };
}


