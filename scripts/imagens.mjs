// Gera as imagens que o site e os posts usam.
//
//   npm run imagens
//
//   public/og.png ......... o cartão que aparece quando o link do site é
//                           colado no X, no WhatsApp ou no Google
//   marca/senado.png ...... composição do Senado, pra acompanhar o post
//   marca/camara.png ...... idem, Câmara
//
// Desenhado como SVG e rasterizado com resvg. A fonte vem do pacote
// dejavu-fonts-ttf em vez do sistema: o runner do GitHub pode não ter fonte
// nenhuma instalada, e aí o texto sairia em branco sem dar erro.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { assentos } from '../src/assentos.js';
import { tabelaPartidos } from './partidos.mjs';

const RAIZ = new URL('..', import.meta.url);
const FONTES = ['node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf']
  .map((f) => new URL(f, RAIZ).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// As mesmas cores do tema escuro do site.
const COR = { fundo: '#1a1a19', fundo2: '#262624', texto: '#ffffff', texto2: '#c3c2b7', texto3: '#8f8e86', esq: '#e05252', meio: '#6b6b64', dir: '#4a90e8' };

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mistura = (a, b, t) => `rgb(${hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t)).join(',')})`;
// Igual ao site: satura em 2 e em 8, cinza no 5.
const corDaPosicao = (p) => (p == null ? COR.texto3 : p < 5
  ? mistura(COR.esq, COR.meio, Math.min(1, Math.max(0, (p - 2) / 3)))
  : mistura(COR.meio, COR.dir, Math.min(1, Math.max(0, (p - 5) / 3))));

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const txt = (x, y, s, { tam = 28, cor = COR.texto, peso = 'normal', ancora = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${tam}" font-weight="${peso}" fill="${cor}" text-anchor="${ancora}">${esc(s)}</text>`;

function png(svg, largura, altura) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">${svg}</svg>`;
  return new Resvg(doc, { font: { loadSystemFonts: false, fontFiles: FONTES, defaultFontFamily: 'DejaVu Sans' } }).render().asPng();
}

// A marca do projeto: uma bolinha em cima e três embaixo.
const marca = (x, y, r) => [[0, -1.5 * r, COR.texto], [-1.9 * r, 1.1 * r, COR.esq], [0, 1.1 * r, COR.meio], [1.9 * r, 1.1 * r, COR.dir]]
  .map(([dx, dy, c]) => `<circle cx="${x + dx}" cy="${y + dy}" r="${r}" fill="${c}"/>`).join('');

// ---------- dados ----------

const brasil = JSON.parse(await readFile(new URL('public/data/brasil.json', RAIZ), 'utf8'));
const posicaoDe = (p) => (p.partido ? tabelaPartidos.partidos[p.partido]?.posicao ?? null : null);
const doCargo = (cargo) => brasil.pessoas.filter((p) => p.cargo === cargo)
  .sort((a, b) => (posicaoDe(a) ?? 99) - (posicaoDe(b) ?? 99));

export function balanco(cargo) {
  const gente = doCargo(cargo);
  const pos = gente.map(posicaoDe).filter((x) => x != null);
  const esq = pos.filter((x) => x < 5).length;
  const dir = pos.filter((x) => x > 5).length;
  return {
    gente, conhecidos: pos.length,
    esq: Math.round((100 * esq) / pos.length),
    dir: Math.round((100 * dir) / pos.length),
    centro: Math.round((100 * (pos.length - esq - dir)) / pos.length),
  };
}

// ---------- cartão de composição (o que vai no post) ----------

const CASA = {
  senador: { titulo: 'Senado Federal', linhas: 4, nota: '81 cadeiras · 3 por estado' },
  deputado: { titulo: 'Câmara dos Deputados', linhas: 11, nota: '513 cadeiras · proporcional à população' },
};

export function cartaoComposicao(cargo) {
  const L = 1200, A = 675;
  const casa = CASA[cargo];
  const b = balanco(cargo);
  const lugares = assentos(b.gente.length, casa.linhas);
  // Caixa do semicírculo: encostada embaixo, deixando o texto no topo.
  const cx = L / 2, base = A - 118, raio = 350;
  const bolas = b.gente.map((p, i) => {
    const l = lugares[i];
    const x = cx + (l.x - 0.5) * 2 * raio;
    const y = base - (1 - l.y) * raio;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${cargo === 'senador' ? 11 : 6.2}" fill="${corDaPosicao(posicaoDe(p))}"/>`;
  }).join('');

  const svg = [
    `<rect width="${L}" height="${A}" fill="${COR.fundo}"/>`,
    marca(54, 58, 13),
    txt(104, 50, 'PoderBR', { tam: 27, peso: 'bold' }),
    txt(104, 78, 'poderbrasileiro.github.io', { tam: 19, cor: COR.texto3 }),
    txt(L / 2, 150, `${casa.titulo} hoje`, { tam: 54, peso: 'bold', ancora: 'middle' }),
    txt(L / 2, 196, `${b.esq}% esquerda · ${b.dir}% direita`, { tam: 36, cor: COR.texto2, ancora: 'middle' }),
    bolas,
    txt(cx, base - 26, String(b.gente.length), { tam: 64, peso: 'bold', ancora: 'middle' }),
    txt(cx, base + 10, 'cadeiras', { tam: 22, cor: COR.texto3, ancora: 'middle' }),
    txt(L / 2, A - 58, 'Cada cadeira é uma pessoa, da esquerda para a direita pela posição do partido.', { tam: 20, cor: COR.texto3, ancora: 'middle' }),
    txt(L / 2, A - 30, `${casa.nota} · classificação de partidos de Bolognesi, Ribeiro e Codato (2023)`, { tam: 20, cor: COR.texto3, ancora: 'middle' }),
  ].join('');
  return { png: png(svg, L, A), balanco: b, titulo: casa.titulo };
}

// ---------- cartão do site ----------

function cartaoSite() {
  const L = 1200, A = 630;
  const b = balanco('senador');
  const lugares = assentos(b.gente.length, 4);
  const cx = L / 2, base = A - 92, raio = 235;
  const bolas = b.gente.map((p, i) => {
    const l = lugares[i];
    return `<circle cx="${(cx + (l.x - 0.5) * 2 * raio).toFixed(1)}" cy="${(base - (1 - l.y) * raio).toFixed(1)}" r="8" fill="${corDaPosicao(posicaoDe(p))}"/>`;
  }).join('');
  const svg = [
    `<rect width="${L}" height="${A}" fill="${COR.fundo}"/>`,
    marca(58, 62, 14),
    txt(110, 54, 'PoderBR', { tam: 30, peso: 'bold' }),
    txt(L / 2, 160, 'Quem ocupa o poder no Brasil', { tam: 52, peso: 'bold', ancora: 'middle' }),
    txt(L / 2, 206, 'Presidente, ministros, STF, governadores, senadores, deputados e prefeitos', { tam: 24, cor: COR.texto2, ancora: 'middle' }),
    bolas,
    txt(L / 2, A - 34, 'Mapa, três poderes, votos em PECs e a transição para 2027 · dados públicos', { tam: 22, cor: COR.texto3, ancora: 'middle' }),
  ].join('');
  return png(svg, L, A);
}

// ---------- banner do X ----------

// 1500x500 é o tamanho que o X pede. Ele corta as bordas em telas estreitas e
// cobre o canto inferior esquerdo com a foto de perfil, então o que importa
// fica no meio e nada encosta nos cantos.
function banner() {
  const L = 1500, A = 500;
  const b = balanco('senador');
  const lugares = assentos(b.gente.length, 4);
  const cx = L - 300, base = A - 84, raio = 262;
  const bolas = b.gente.map((p, i) => {
    const l = lugares[i];
    return `<circle cx="${(cx + (l.x - 0.5) * 2 * raio).toFixed(1)}" cy="${(base - (1 - l.y) * raio).toFixed(1)}" r="8.5" fill="${corDaPosicao(posicaoDe(p))}"/>`;
  }).join('');
  const svg = [
    `<rect width="${L}" height="${A}" fill="${COR.fundo}"/>`,
    bolas,
    marca(188, 170, 20),
    txt(152, 268, 'PoderBR', { tam: 66, peso: 'bold' }),
    txt(152, 316, 'Quem ocupa o poder no Brasil', { tam: 31, cor: COR.texto2 }),
    txt(152, 360, 'Dados públicos, atualizados todo dia', { tam: 24, cor: COR.texto3 }),
  ].join('');
  return png(svg, L, A);
}

// ---------- principal ----------

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('imagens.mjs')) {
  await mkdir(new URL('marca/', RAIZ), { recursive: true });
  await writeFile(new URL('public/og.png', RAIZ), cartaoSite());
  await writeFile(new URL('marca/banner-x.png', RAIZ), banner());
  for (const cargo of Object.keys(CASA)) {
    const { png: dados, balanco: b, titulo } = cartaoComposicao(cargo);
    await writeFile(new URL(`marca/${cargo === 'senador' ? 'senado' : 'camara'}.png`, RAIZ), dados);
    console.log(`${titulo}: ${b.esq}% esquerda, ${b.dir}% direita (de ${b.conhecidos} com partido conhecido) — ${(dados.length / 1024).toFixed(0)} KB`);
  }
  console.log('public/og.png e marca/banner-x.png gravados.');
}
