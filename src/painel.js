// Painel lateral: resumo, UF, lista de ministros ou ficha de uma pessoa.

import { h, trocar, CARGOS, CARGO_ELEITO, SITUACOES, destinoDe, selo, textoPartido, ondeAtua, fmtNum, fmtData, semAcento } from './comum.js';
import { ROTULO_VOTO, tiposDeVoto, placarCurto, ETAPAS, etapaDe, trilha, selo as seloPec } from './pecs.js';

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
    h('p', { class: 'fraco' }, 'Resultado oficial do TSE da eleição de 2026, cruzado com quem está no cargo hoje. As posses são em janeiro (Executivo) e fevereiro (Congresso) de 2027.'));
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

export function criarPainel(raiz, dados, { aoEscolherPessoa, aoEscolherUf, aoVerMinistros, aoEscolherPec, linkAtual }) {
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
        linhas.push(h('li', {}, h('button', { class: 'prefeito-linha', onclick: () => aoEscolherPec(pec.id) },
          h('b', {}, `${pec.titulo} — ${ROTULO_VOTO[voto] ?? voto}`),
          h('small', {}, `${fmtData(v.data)} · ${placarCurto(v)} · ${(pec.ementa ?? '').slice(0, 90)}…`))));
        break;   // só a votação mais recente de cada PEC
      }
    }
    sec.append(linhas.length ? h('ul', { class: 'prefeitos' }, linhas)
      : h('p', { class: 'fraco' }, 'Nenhum voto registrado nas votações nominais de PEC do período.'));
    return sec;
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
        ? h('span', { class: 'prefeito-linha fraco' }, h('b', {}, m.municipio), h('small', {}, 'sem eleito no resultado do TSE'))
        : h('button', { class: 'prefeito-linha', onclick: () => aoEscolherPessoa(`prefeito-${m.ibge}`) },
          h('b', {}, m.municipio), h('small', {}, `${m.nome} · ${m.partido ?? 'sem partido'}`))))
        : h('li', { class: 'fraco' }, 'Nenhum município encontrado.'));
    };
    campo.addEventListener('input', desenhar);
    desenhar();
    sec.append(campo, ul);
    return sec;
  }

  return {
    resumo() {
      const conta = (c) => dados.pessoas.filter((p) => p.cargo === c).length;
      trocar(raiz, 
        h('h2', {}, 'Comece por aqui'),
        h('p', {}, 'Clique num estado do mapa pra ver governador, senadores, deputados e prefeitos, ou numa bolinha da rede de poder pra abrir a ficha de alguém.'),
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

    pec(id) {
      const d = dados.pecs;
      const p = d?.pecs.find((x) => x.id === id);
      if (!p) return this.resumo();
      const e = p.estagio;
      // Quem está no cargo hoje vira botão pra ficha; quem já saiu fica só o nome.
      const votante = (pid) => {
        const [nome, partido, uf] = d.nomes[pid] ?? ['?', null, null];
        const rotulo = `${nome} (${[partido, uf].filter(Boolean).join('-')})`;
        return dados.pessoaPorId.has(pid)
          ? h('button', { class: 'votante', onclick: () => aoEscolherPessoa(pid) }, rotulo)
          : h('span', { class: 'votante' }, rotulo);
      };
      trocar(raiz,
        h('p', { class: 'sobretitulo' }, `Proposta de emenda à Constituição · ${p.casa}`),
        h('h2', {}, p.titulo),
        h('p', {}, p.ementa),
        compartilhar(),
        h('div', { class: 'pec-etapa' }, trilha(p), seloPec(p), h('p', { class: 'fraco' }, ETAPAS[etapaDe(p)].explica)),
        h('section', {}, h('h3', {}, p.casa === 'Senado' ? 'Estágio no Senado' : 'Estágio na Câmara'),
          e.situacao ? h('p', {}, h('b', {}, e.situacao), e.orgao ? ` — ${e.orgao}` : '') : null,
          e.tramitacao ? h('p', { class: e.situacao ? 'fraco' : null }, e.situacao ? `Último andamento: ${e.tramitacao}` : e.tramitacao) : null,
          e.data ? h('p', { class: 'fraco' }, `Em ${fmtData(e.data)}.`) : null,
          h('p', { class: 'fraco' }, 'Uma PEC precisa de 3/5 dos votos, em dois turnos, em cada casa: 308 deputados e 49 senadores.'),
          h('ul', { class: 'buscas' }, h('li', {}, h('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer' }, `Tramitação completa na ${p.casa === 'Senado' ? 'página do Senado' : 'página da Câmara'} ↗`)))),
        p.votacoes.length
          ? p.votacoes.map((v) => h('section', {},
            h('h3', {}, `Votação de ${fmtData(v.data)}${v.resultado ? ` · ${v.resultado}` : ''}`),
            h('p', { class: 'numero' }, h('b', {}, v.placar.Sim ?? 0), ' sim · ', h('b', {}, v.placar['Não'] ?? 0), ' não'),
            h('p', { class: 'fraco' }, v.descricao),
            tiposDeVoto(v.votos).map((t) => h('details', { class: 'votos' },
              h('summary', {}, `${ROTULO_VOTO[t] ?? t} (${v.votos[t].length})`),
              h('div', { class: 'votantes' }, v.votos[t].map(votante).sort((a, b) => a.textContent.localeCompare(b.textContent, 'pt')))))))
          : h('section', {}, h('p', { class: 'fraco' }, 'Sem votação nominal em plenário no período. Votações simbólicas não registram o voto de cada parlamentar.')));
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
          `Eleito(a) em 2026${p.pct ? `, com ${p.pct}% dos votos válidos` : ''}. A posse é em ${p.cargoEleito === 'governador' ? 'janeiro' : 'fevereiro'} de 2027; até lá não ocupa cargo e não aparece nas votações.`) : null,
        p.cargo === 'prefeito' ? h('p', { class: 'aviso' },
          h('b', {}, 'Resultado da eleição de 2024. '),
          'É quem o TSE registra como eleito, e o partido pelo qual concorreu. Pode não ser quem está no cargo hoje (cassação, renúncia, eleição suplementar) nem o partido atual.') : null,
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


