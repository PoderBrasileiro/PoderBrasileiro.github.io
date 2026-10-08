// Roda depois do "vite build": gera o que os buscadores precisam em dist/.
//
//   - p/<id>.html ...... uma página estática por pessoa, com nome, cargo,
//                        partido e situação em 2027, e o link pro quadro
//   - sitemap.xml ...... a home e todas essas páginas
//   - robots.txt
//
// Por que existe: o site é uma página só, montada no navegador. Pro Google
// isso é um endereço único — "Fulano senador" nunca apareceria na busca.
// As páginas estáticas dão um endereço e um texto pra cada pessoa.
//
// O endereço do site vem de SITE_URL (o workflow define). Ele vai no sitemap
// e nas tags canonical, então precisa ser o endereço público de verdade.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DIST = new URL('../dist/', import.meta.url);
const SITE = (process.env.SITE_URL ?? 'https://poderbrasileiro.github.io/').replace(/\/?$/, '/');

const ler = async (nome) => JSON.parse(await readFile(new URL(`data/${nome}`, DIST), 'utf8'));
const brasil = await ler('brasil.json');
const eleicao = await ler('eleicao2026.json').catch(() => null);

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
  const titulo = `${p.nome} — ${cargo}${onde ? ` (${onde})` : ''} | PoderBR`;
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
<a href="../">PoderBR</a>
<h1>${esc(p.nome)}</h1>
<p>${esc(cargo)}${onde ? ` · ${esc(onde)}` : ''}${partido ? ` · ${esc(partido)}` : ''}</p>
<p><a class="botao" href="${esc(app)}">Abrir no quadro interativo</a></p>
<dl>
${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('\n')}
</dl>
<p><small>No quadro interativo: votos em plenário e em PECs, notícias ligadas a investigações e a posição no mapa e na rede de poder. Dados públicos, coletados em ${esc(brasil.geradoEm.slice(0, 10).split('-').reverse().join('/'))}. A posição esquerda × direita é a do partido, não uma medida da pessoa.</small></p>
</main>
</body>
</html>
`;
}

await mkdir(new URL('p/', DIST), { recursive: true });
for (const p of brasil.pessoas) await writeFile(new URL(`p/${p.id}.html`, DIST), pagina(p));

const hoje = brasil.geradoEm.slice(0, 10);
const urls = [SITE, ...brasil.pessoas.map((p) => `${SITE}p/${p.id}.html`)];
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

console.log(`${brasil.pessoas.length} páginas, sitemap e robots em dist/ (site: ${SITE})`);
