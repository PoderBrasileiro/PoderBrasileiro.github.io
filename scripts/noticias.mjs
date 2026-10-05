// Junta notícias que citam cada político junto de termos de investigação.
//
//   npm run noticias
//
// Fonte: os feeds RSS que os próprios veículos publicam (lista em FEEDS).
// O site guarda só título, link, veículo e data — o texto fica no veículo.
//
// Um feed traz só as últimas dezenas de matérias, então o arquivo é
// ACUMULADO: cada rodada soma o que achou ao que já estava gravado e
// descarta o que passou de MAX_DIAS. Rodando todo dia (o workflow faz isso)
// a lista enche sozinha; na primeira rodada ela vem curta mesmo.
//
// Tentativas anteriores, pra ninguém repetir: a API do GDELT devolveu 429 em
// quase toda chamada, e o RSS de busca do Google Notícias proíbe nos termos
// o uso fora de leitor de feed pessoal.
//
// IMPORTANTE: é casamento de texto por nome. Pega homônimo, pega matéria em
// que a pessoa só é citada, e não diz nada sobre culpa. O site avisa isso.

import { readFile, writeFile } from 'node:fs/promises';

const DADOS = new URL('../public/data/', import.meta.url);
const MAX_DIAS = 180;
const MAX_POR_PESSOA = 12;

const FEEDS = [
  ['G1', 'https://g1.globo.com/rss/g1/politica/'],
  ['Folha', 'https://feeds.folha.uol.com.br/poder/rss091.xml'],
  ['Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/'],
  ['Agência Brasil', 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml'],
  ['Agência Brasil', 'https://agenciabrasil.ebc.com.br/rss/justica/feed.xml'],
  ['Poder360', 'https://www.poder360.com.br/feed/'],
  ['Gazeta do Povo', 'https://www.gazetadopovo.com.br/feed/rss/republica.xml'],
  ['CartaCapital', 'https://www.cartacapital.com.br/feed/'],
  ['UOL', 'https://rss.uol.com.br/feed/noticias.xml'],
  ['BBC Brasil', 'https://feeds.bbci.co.uk/portuguese/rss.xml'],
  ['Agência Senado', 'https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS'],
];

// Sem acento e em minúsculas. O termo tem que estar no TÍTULO: o resumo de
// qualquer matéria de política esbarra em "PF" ou "operação" sem ser sobre
// isso. O nome pode estar no título ou no resumo.
const TERMOS = /\b(investiga\w*|inquerito\w*|denuncia\w*|indicia\w*|policia federal|pf|ministerio publico|mpf|pgr|procuradoria\w*|reu|operacao|delacao|cpi|cpmi|cassa\w*|improbidade|condena\w*|absolv\w*|propina|corrupcao|lavagem de dinheiro|busca e apreensao|fraude\w*|desvio\w*|tcu)\b/;

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ler = async (nome, padrao) => {
  try { return JSON.parse(await readFile(new URL(nome, DADOS), 'utf8')); } catch { return padrao; }
};

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function texto(xml) {
  return (xml ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n) => ENTIDADES[n] ?? m)
    .replace(/\s+/g, ' ').trim();
}
const tag = (item, nome) => item.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i'))?.[1];

async function lerFeed([veiculo, url]) {
  const r = await fetch(url, { headers: { 'User-Agent': 'PoderBR/0.1 (projeto pessoal; leitor de RSS)' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  // Folha e UOL publicam em ISO-8859-1; ler como UTF-8 estraga os acentos.
  const bytes = new Uint8Array(await r.arrayBuffer());
  const inicio = new TextDecoder('latin1').decode(bytes.slice(0, 200));
  const charset = r.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1]
    ?? inicio.match(/encoding=["']([\w-]+)/i)?.[1] ?? 'utf-8';
  const xml = new TextDecoder(charset).decode(bytes);

  const itens = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const titulo = texto(tag(m[0], 'title'));
    const link = texto(tag(m[0], 'link'));
    if (!titulo || !/^https?:\/\//.test(link)) continue;
    const quando = new Date(texto(tag(m[0], 'pubDate') ?? tag(m[0], 'dc:date') ?? ''));
    itens.push({
      titulo, url: link, fonte: veiculo,
      data: Number.isNaN(quando.getTime()) ? null : quando.toISOString().slice(0, 10),
      tituloBusca: semAcento(titulo),
      busca: semAcento(`${titulo} ${texto(tag(m[0], 'description'))}`),
    });
  }
  return itens;
}

// Nome inteiro como palavra(s) soltas: "Rui Costa" não casa com "Rui Costabile".
function casador(nome) {
  const alvo = semAcento(nome).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${alvo}($|[^a-z0-9])`);
}

const brasil = await ler('brasil.json');
if (!brasil) { console.error('Rode "npm run coletar" antes.'); process.exit(1); }
const anterior = await ler('noticias.json', { porId: {} });

const materias = [];
const feedsOk = [];
for (const feed of FEEDS) {
  try {
    const itens = await lerFeed(feed);
    materias.push(...itens);
    feedsOk.push(feed[0]);
    console.log(`${feed[0].padEnd(16)} ${itens.length} itens`);
  } catch (e) {
    console.warn(`${feed[0].padEnd(16)} falhou (${e.message})`);
  }
}
if (!materias.length) { console.error('\nNenhum feed respondeu — nada foi gravado.'); process.exit(1); }

const relevantes = materias.filter((m) => TERMOS.test(m.tituloBusca));
const corte = new Date(Date.now() - MAX_DIAS * 864e5).toISOString().slice(0, 10);
const agora = new Date().toISOString();
const porId = {};
let novas = 0;
for (const p of brasil.pessoas) {
  // Nome de urna e nome completo; apelido de uma palavra só ("Lula") também vale.
  const casadores = [...new Set([p.nome, p.nomeCompleto].filter(Boolean))].map(casador);
  const achadas = relevantes.filter((m) => casadores.some((c) => c.test(m.busca)));
  const antigas = anterior.porId?.[p.id]?.itens ?? [];
  const vistas = new Set(antigas.map((n) => n.url));
  novas += achadas.filter((m) => !vistas.has(m.url)).length;

  const porUrl = new Map();
  for (const n of [...antigas, ...achadas]) {
    if (n.data && n.data < corte) continue;
    porUrl.set(n.url, { titulo: n.titulo, url: n.url, fonte: n.fonte, data: n.data });
  }
  const itens = [...porUrl.values()].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0, MAX_POR_PESSOA);
  porId[p.id] = { nome: p.nome, buscadoEm: agora, itens };
}

await writeFile(new URL('noticias.json', DADOS), JSON.stringify({ geradoEm: agora, fontes: [...new Set(feedsOk)], dias: MAX_DIAS, porId }));
const comItens = Object.values(porId).filter((x) => x.itens.length).length;
console.log(`\n${materias.length} matérias lidas, ${relevantes.length} com termo de investigação.`);
console.log(`${novas} novas; ${comItens} de ${brasil.pessoas.length} pessoas têm ao menos uma.`);
