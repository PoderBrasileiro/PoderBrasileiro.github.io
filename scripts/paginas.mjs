// Roda depois do "vite build": gera o que os buscadores precisam em dist/.
//
//   - p/<id>.html ...... uma página estática por pessoa, com nome, cargo,
//                        partido e situação em 2027, e o link pro quadro
//   - pais/<ISO>.html .. uma por país, com quem governa e a faixa no espectro
//   - sitemap.xml ...... a home e todas essas páginas
//   - robots.txt
//
// Por que existe: o site é uma página só, montada no navegador. Pro Google
// isso é um endereço único — "Fulano senador" ou "quem governa a Noruega"
// nunca apareceria na busca. As páginas estáticas dão um endereço e um texto
// pra cada pessoa e pra cada país.
//
// O endereço do site vem de SITE_URL (o workflow define). Ele vai no sitemap
// e nas tags canonical, então precisa ser o endereço público de verdade.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DIST = new URL('../dist/', import.meta.url);
const SITE = (process.env.SITE_URL ?? 'https://poderbrasileiro.github.io/').replace(/\/?$/, '/');

const ler = async (nome) => JSON.parse(await readFile(new URL(`data/${nome}`, DIST), 'utf8'));
const brasil = await ler('brasil.json');
const eleicao = await ler('eleicao2026.json').catch(() => null);
const mundo = await ler('mundo.json').catch(() => null);

const CARGO_ELEITO = { governador: 'Governador(a) eleito(a)', senador: 'Senador(a) eleito(a)', deputado: 'Deputado(a) federal eleito(a)' };
const CARGO = {
  presidente: 'Presidente da República', vice: 'Vice-presidente da República', ministro: 'Ministro(a) de Estado',
  governador: 'Governador(a)', senador: 'Senador(a)', deputado: 'Deputado(a) federal', stf: 'Ministro(a) do Supremo Tribunal Federal',
};
// Eleitos em 2026 que ainda não assumiram também ganham página: é por ela que
// a busca encontra um estreante antes da posse.
for (const e of eleicao?.estreantes ?? []) brasil.pessoas.push({ ...e, cargo: 'eleito' });

const SITUACAO = { fica: 'Fica em 2027', sai: 'Sai em 2027', muda: 'Muda de cargo em 2027', 'segundo-turno': 'Disputa o 2º turno', depende: 'Situação em aberto para 2027' };
const ufs = new Map(brasil.ufs.map((u) => [u.sigla, u.nome]));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pagina(p) {
  const cargo = p.cargo === 'eleito' ? CARGO_ELEITO[p.cargoEleito] : CARGO[p.cargo];
  const onde = p.cargo === 'ministro' ? p.pasta : p.uf ? ufs.get(p.uf) : null;
  const partido = p.cargo === 'stf' ? null : p.partido === undefined ? null : p.partido ?? 'sem partido';
  const info = partido && brasil.partidos[p.partido];
  const d = eleicao?.destino?.[p.id];
  const titulo = `${p.nome} — ${cargo}${onde ? ` (${onde})` : ''} | Global Power Line`;
  const resumo = [`${p.nome} é ${cargo.toLowerCase()}${onde ? `, ${onde}` : ''}`, partido && `filiação: ${partido}`, d && SITUACAO[d.situacao]].filter(Boolean).join('. ') + '.';
  const url = `${SITE}p/${p.id}.html`;
  const app = `../#p=${encodeURIComponent(p.id)}`;
  const linhas = [
    ['Cargo', cargo + (p.interino ? ' (interino)' : '')],
    onde && [p.cargo === 'ministro' ? 'Pasta' : 'Estado', onde],
    partido && ['Partido', info ? `${partido} — ${info.nome}` : partido],
    info && ['Posição do partido (0 = esquerda, 10 = direita)', String(info.posicao).replace('.', ',')],
    p.desde && ['No cargo desde', p.desde.split('-').reverse().join('/')],
    p.indicadoPor && ['Indicado(a) por', p.indicadoPor],
    d && ['Em 2027', `${SITUACAO[d.situacao]}. ${d.texto}`],
    p.cargo === 'eleito' && ['Situação', `Eleito(a) em 2026${p.pct ? ` com ${p.pct}% dos votos válidos` : ''}; assume em ${p.cargoEleito === 'governador' ? 'janeiro' : 'fevereiro'} de 2027.`],
  ].filter(Boolean);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(resumo)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(resumo)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(SITE)}og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>
:root{color-scheme:light dark}
body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fcfcfb;color:#0b0b0b}
@media (prefers-color-scheme:dark){body{background:#1a1a19;color:#fff}a{color:#8ab8f5}dt,small{color:#c3c2b7!important}}
main{max-width:640px;margin:0 auto;padding:32px 16px}
h1{font-size:28px;line-height:1.2;margin:8px 0}
dl{margin:24px 0}dt{font-size:13px;color:#52514e;margin-top:12px}dd{margin:0}
small{color:#52514e}
.botao{display:inline-block;padding:10px 18px;border-radius:8px;background:#0b0b0b;color:#fff;text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){.botao{background:#fff;color:#1a1a19}}
</style>
</head>
<body>
<main>
<a href="../">Global Power Line</a>
<h1>${esc(p.nome)}</h1>
<p>${esc(cargo)}${onde ? ` · ${esc(onde)}` : ''}${partido ? ` · ${esc(partido)}` : ''}</p>
<p><a class="botao" href="${esc(app)}">Abrir no quadro interativo</a></p>
<dl>
${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('\n')}
</dl>
<p><small>No quadro interativo: votos em plenário e em PECs, notícias ligadas a investigações e a posição no mapa. Dados públicos, coletados em ${esc(brasil.geradoEm.slice(0, 10).split('-').reverse().join('/'))}. A posição esquerda × direita é a do partido, não uma medida da pessoa.</small></p>
</main>
</body>
</html>
`;
}

await mkdir(new URL('p/', DIST), { recursive: true });
for (const p of brasil.pessoas) await writeFile(new URL(`p/${p.id}.html`, DIST), pagina(p));


// ---------- uma página por país ----------

const FAIXA_TEXTO = {
  esquerda: 'esquerda', 'centro-esquerda': 'centro-esquerda', centro: 'centro',
  'centro-direita': 'centro-direita', direita: 'direita',
};
const ORIGEM_FAIXA = {
  alinhamento: 'classificação da Wikidata para o partido',
  survey: 'posição do partido no Global Party Survey de 2019',
  ideologia: 'deduzida das correntes que o partido declara na Wikidata',
  manual: 'classificação deste site',
};
// A mesma regra de src/mundo.js: com partidos diferentes manda o chefe de
// governo; com o mesmo partido, ou com nenhum dos dois tendo partido, o chefe
// de Estado.
const manda = (d) => {
  const e = d.estado, g = d.governo;
  if (g?.partido && e?.partido) return e.partido === g.partido ? e : g;
  return g?.partido ? g : e ?? g;
};

function paginaPais(d) {
  const c = manda(d);
  const faixa = c?.faixa;
  const url = `${SITE}pais/${d.iso}.html`;
  // O nome do país vem na frente, como etiqueta, pra fugir do artigo: em
  // português é "a Rússia" mas "Portugal", e não há regra que acerte os 195.
  // Pelo mesmo motivo o partido entra como "do partido X", que serve pros dois
  // gêneros — "pelo União Democrata-Cristã" saía torto.
  const titulo = `${d.nome} — quem governa hoje | Global Power Line`;
  // Travessão no lugar de preposição: "pelo União Democrata-Cristã" saía
  // torto, e "pelo partido Partido Social Democrata" repetia a palavra.
  const resumo = (c
    ? [`${d.nome}: ${c.nome} —`,
      [c.partido ?? (d.semPartido ? 'sem filiação partidária' : 'partido não informado'),
        faixa && (c.partido ? `de ${FAIXA_TEXTO[faixa]}` : `com apoio de partido de ${FAIXA_TEXTO[faixa]}`)].filter(Boolean).join(', ')]
    : [`${d.nome}: quem governa`]).join(' ') + '.';
  const linhas = [
    d.forma && ['Forma de governo', d.forma],
    d.estado && ['Chefe de Estado', `${d.estado.nome}${d.estado.partido ? ` — ${d.estado.partido}` : ' — sem partido'}`],
    d.governo && !d.acumula && ['Chefe de governo', `${d.governo.nome}${d.governo.partido ? ` — ${d.governo.partido}` : ' — sem partido'}`],
    c?.desde && ['No cargo desde', c.desde.split('-').reverse().join('/')],
    faixa && ['Faixa no espectro', `${FAIXA_TEXTO[faixa]}${c.faixaFonte ? ` (${ORIGEM_FAIXA[c.faixaFonte]})` : ''}`],
    c?.posicao != null && ['Posição do partido (0 = esquerda, 10 = direita)', String(c.posicao).replace('.', ',')],
  ].filter(Boolean);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(resumo)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(resumo)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(SITE)}og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>
:root{color-scheme:light dark}
body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fcfcfb;color:#0b0b0b}
@media (prefers-color-scheme:dark){body{background:#1a1a19;color:#fff}a{color:#8ab8f5}dt,small{color:#c3c2b7!important}}
main{max-width:640px;margin:0 auto;padding:32px 16px}
h1{font-size:28px;line-height:1.2;margin:8px 0}
dl{margin:24px 0}dt{font-size:13px;color:#52514e;margin-top:12px}dd{margin:0}
small{color:#52514e}
.botao{display:inline-block;padding:10px 18px;border-radius:8px;background:#0b0b0b;color:#fff;text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){.botao{background:#fff;color:#1a1a19}}
</style>
</head>
<body>
<main>
<a href="../">Global Power Line</a>
<h1>${esc(d.nome)}</h1>
<p>Quem governa hoje</p>
<p>${esc(resumo)}</p>
<p><a class="botao" href="../#pais=${esc(d.iso)}">Abrir no mapa-múndi</a></p>
<dl>
${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('\n')}
</dl>
<p><small>Quem ocupa o cargo e o partido vêm da Wikidata, editada por voluntários. A faixa de esquerda e direita é a do partido de quem governa — não é uma nota do país. Dados coletados em ${esc((mundo.geradoEm ?? '').slice(0, 10).split('-').reverse().join('/'))}.</small></p>
</main>
</body>
</html>
`;
}

const paises = mundo?.paises ?? [];
if (paises.length) {
  await mkdir(new URL('pais/', DIST), { recursive: true });
  for (const d of paises) await writeFile(new URL(`pais/${d.iso}.html`, DIST), paginaPais(d));
}

const hoje = brasil.geradoEm.slice(0, 10);
const urls = [SITE, ...paises.map((d) => `${SITE}pais/${d.iso}.html`), ...brasil.pessoas.map((p) => `${SITE}p/${p.id}.html`)];
await writeFile(new URL('sitemap.xml', DIST),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${hoje}</lastmod></url>`).join('\n')}\n</urlset>\n`);
// A pauta é ferramenta de bastidor, não conteúdo do site: fica fora da busca.
await writeFile(new URL('robots.txt', DIST), `User-agent: *\nAllow: /\nDisallow: /pauta/\n\nSitemap: ${SITE}sitemap.xml\n`);

// A home é escrita pelo Vite, que não conhece o endereço público: as tags de
// compartilhamento precisam de URL absoluta, então entram aqui.
const home = new URL('index.html', DIST);
let html = await readFile(home, 'utf8');
if (!html.includes('og:image')) {
  html = html
    .replace('</head>', `  <meta property="og:url" content="${esc(SITE)}">\n  <meta property="og:image" content="${esc(SITE)}og.png">\n  <link rel="canonical" href="${esc(SITE)}">\n</head>`)
    .replace('<meta name="twitter:card" content="summary">', '<meta name="twitter:card" content="summary_large_image">');
  await writeFile(home, html);
}

console.log(`${paises.length} países + ${brasil.pessoas.length} pessoas, sitemap e robots em dist/ (site: ${SITE})`);
