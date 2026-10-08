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
const prefeitos = JSON.parse(await readFile(new URL('public/data/prefeitos.json', RAIZ), 'utf8').catch(() => '{"porUf":{}}'));
const todosPrefeitos = Object.values(prefeitos.porUf).flat().filter((m) => !m.pendente);
const ordenar = (gente) => [...gente].sort((a, b) => (posicaoDe(a) ?? 99) - (posicaoDe(b) ?? 99));
const doCargo = (cargo) => ordenar(cargo === 'prefeito' ? todosPrefeitos : brasil.pessoas.filter((p) => p.cargo === cargo));
export const balanco = (cargo) => contar(doCargo(cargo));
const eleicao = JSON.parse(await readFile(new URL('public/data/eleicao2026.json', RAIZ), 'utf8').catch(() => 'null'));

export function contar(gente) {
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

// Desenha um plenário em semicírculo com qualquer lista de gente. Serve tanto
// pra composição de hoje quanto pra projetada de 2027.
function cartaoPlenario({ titulo, subtitulo, gente, linhas, raioBola, rodape }) {
  const L = 1200, A = 675;
  const b = contar(gente);
  const lugares = assentos(gente.length, linhas);
  // Caixa do semicírculo: encostada embaixo, deixando o texto no topo.
  const cx = L / 2, base = A - 118, raio = 350;
  const bolas = ordenar(gente).map((p, i) => {
    const l = lugares[i];
    return `<circle cx="${(cx + (l.x - 0.5) * 2 * raio).toFixed(1)}" cy="${(base - (1 - l.y) * raio).toFixed(1)}" r="${raioBola}" fill="${corDaPosicao(posicaoDe(p))}"/>`;
  }).join('');
  const svg = [
    `<rect width="${L}" height="${A}" fill="${COR.fundo}"/>`,
    marca(54, 58, 13),
    txt(104, 50, 'PoderBR', { tam: 27, peso: 'bold' }),
    txt(104, 78, 'poderbrasileiro.github.io', { tam: 19, cor: COR.texto3 }),
    txt(L / 2, 150, titulo, { tam: 54, peso: 'bold', ancora: 'middle' }),
    txt(L / 2, 196, subtitulo, { tam: 36, cor: COR.texto2, ancora: 'middle' }),
    bolas,
    txt(cx, base - 26, String(gente.length), { tam: 64, peso: 'bold', ancora: 'middle' }),
    txt(cx, base + 10, 'cadeiras', { tam: 22, cor: COR.texto3, ancora: 'middle' }),
    txt(L / 2, A - 58, 'Cada cadeira é uma pessoa, da esquerda para a direita pela posição do partido.', { tam: 20, cor: COR.texto3, ancora: 'middle' }),
    txt(L / 2, A - 30, rodape, { tam: 20, cor: COR.texto3, ancora: 'middle' }),
  ].join('');
  return { png: png(svg, L, A), balanco: b, titulo };
}

export function cartaoComposicao(cargo) {
  const casa = CASA[cargo];
  const gente = doCargo(cargo);
  return cartaoPlenario({
    titulo: `${casa.titulo} hoje`,
    subtitulo: `${contar(gente).esq}% esquerda · ${contar(gente).dir}% direita`,
    gente, linhas: casa.linhas, raioBola: cargo === 'senador' ? 11 : 6.2,
    rodape: `${casa.nota} · classificação de partidos de Bolognesi, Ribeiro e Codato (2023)`,
  });
}

// ---------- como a casa fica depois da posse ----------

// Senado 2027: os 54 eleitos em 2026 mais os 27 cujo mandato vai até 2031.
// Câmara 2027: os 513 eleitos, que trocam todos de uma vez.
export function cartaoFuturo(cargo) {
  const eleitos = Object.values(eleicao?.porUf ?? {}).flatMap((u) => (cargo === 'senador' ? u.senadores : u.deputados));
  const continuam = cargo === 'senador'
    ? brasil.pessoas.filter((p) => p.cargo === 'senador' && p.mandatoAte && p.mandatoAte > '2028')
    : [];
  const gente = [...continuam, ...eleitos];
  const casa = CASA[cargo];
  const b = contar(gente);
  const hoje = contar(doCargo(cargo));
  return {
    ...cartaoPlenario({
      titulo: `${casa.titulo} em 2027`,
      subtitulo: `${b.esq}% esquerda · ${b.dir}% direita`,
      gente, linhas: casa.linhas, raioBola: cargo === 'senador' ? 11 : 6.2,
      rodape: cargo === 'senador'
        ? `54 eleitos em 2026 e 27 com mandato até 2031 · hoje: ${hoje.esq}% e ${hoje.dir}%`
        : `Os 513 eleitos em 2026 · hoje: ${hoje.esq}% esquerda e ${hoje.dir}% direita`,
    }),
    hoje,
  };
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

// ---------- cartão de barra (cargos que não têm plenário) ----------

const GRUPO = {
  ministro: { titulo: 'Ministros de Estado', nota: 'Nomeados e demitidos pelo presidente.' },
  governador: { titulo: 'Governadores', nota: '26 estados e o Distrito Federal.' },
  prefeito: { titulo: 'Prefeitos', nota: 'Eleitos em 2024, nos 5.569 municípios.' },
};

export function cartaoBarra(cargo) {
  const L = 1200, A = 675;
  const g = GRUPO[cargo];
  const b = balanco(cargo);
  // Uma faixa por pessoa, lado a lado: a largura é a proporção e dá pra ver o
  // tamanho do grupo pelo número de riscos.
  const x0 = 80, larg = L - 160, y0 = 300, alt = 150;
  const passo = larg / b.gente.length;
  const riscos = b.gente.map((p, i) =>
    `<rect x="${(x0 + i * passo).toFixed(2)}" y="${y0}" width="${Math.max(passo - (b.gente.length > 400 ? 0 : 0.8), 0.4).toFixed(2)}" height="${alt}" fill="${corDaPosicao(posicaoDe(p))}"/>`).join('');
  const svg = [
    `<rect width="${L}" height="${A}" fill="${COR.fundo}"/>`,
    marca(54, 58, 13),
    txt(104, 50, 'PoderBR', { tam: 27, peso: 'bold' }),
    txt(104, 78, 'poderbrasileiro.github.io', { tam: 19, cor: COR.texto3 }),
    txt(L / 2, 168, `${g.titulo} hoje`, { tam: 54, peso: 'bold', ancora: 'middle' }),
    txt(L / 2, 216, `${b.esq}% esquerda · ${b.dir}% direita`, { tam: 36, cor: COR.texto2, ancora: 'middle' }),
    riscos,
    txt(x0, y0 + alt + 36, 'Esquerda', { tam: 22, cor: COR.texto3 }),
    txt(x0 + larg, y0 + alt + 36, 'Direita', { tam: 22, cor: COR.texto3, ancora: 'end' }),
    txt(L / 2, A - 58, `Cada risco é uma pessoa: ${b.gente.length.toLocaleString('pt-BR')} no total. ${g.nota}`, { tam: 20, cor: COR.texto3, ancora: 'middle' }),
    txt(L / 2, A - 30, `${b.conhecidos.toLocaleString('pt-BR')} com partido conhecido · classificação de Bolognesi, Ribeiro e Codato (2023)`, { tam: 20, cor: COR.texto3, ancora: 'middle' }),
  ].join('');
  return { png: png(svg, L, A), balanco: b, titulo: g.titulo };
}

export const cartaoDoGrupo = (cargo) => (cargo === 'senador' || cargo === 'deputado' ? cartaoComposicao(cargo) : cartaoBarra(cargo));


// ---------- cartão de contagem regressiva ----------

export function cartaoContagem() {
  const L = 1200, A = 675;
  const p = eleicao?.presidente;
  if (!eleicao || p?.status !== 'segundo-turno') return null;
  const [d, m] = eleicao.segundoTurnoEm.split('/');
  const ano = new Date(eleicao.geradoEm).getFullYear();
  const alvo = new Date(`${ano}-${m}-${d}T08:00:00-03:00`);
  const dias = Math.ceil((alvo - Date.now()) / 864e5);
  const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const chapas = p.candidatos.map((c, i) => [
    `<circle cx="${330 + i * 540}" cy="465" r="13" fill="${corDaPosicao(posicaoDe(c))}"/>`,
    txt(360 + i * 540, 458, `${c.nome} (${c.partido})`, { tam: 29, peso: 'bold' }),
    txt(360 + i * 540, 492, `${c.pct}% no 1º turno`, { tam: 22, cor: COR.texto3 }),
  ].join('')).join('');
  const svg = [
    `<rect width="${L}" height="${A}" fill="${COR.fundo}"/>`,
    marca(54, 58, 13),
    txt(104, 50, 'PoderBR', { tam: 27, peso: 'bold' }),
    txt(104, 78, 'poderbrasileiro.github.io', { tam: 19, cor: COR.texto3 }),
    txt(L / 2, 230, String(dias), { tam: 150, peso: 'bold', ancora: 'middle' }),
    txt(L / 2, 285, dias === 1 ? 'dia para o 2º turno' : 'dias para o 2º turno', { tam: 40, cor: COR.texto2, ancora: 'middle' }),
    txt(L / 2, 336, `${Number(d)} de ${MES[Number(m) - 1]} · urnas das 8h às 17h`, { tam: 26, cor: COR.texto3, ancora: 'middle' }),
    chapas,
    txt(L / 2, A - 40, 'Quem fica e quem sai do poder em 2027, estado por estado', { tam: 22, cor: COR.texto3, ancora: 'middle' }),
  ].join('');
  return { png: png(svg, L, A), dias, candidatos: p.candidatos, quando: `${Number(d)} de ${MES[Number(m) - 1]}` };
}

// ---------- banner do X ----------

// 1500x500 é o tamanho que o X pede. Ele corta as laterais em tela estreita e
// cobre o canto inferior esquerdo com a foto de perfil, então a assinatura
// fica no canto de cima e nada encosta nas bordas.
//
// O degradê é a própria régua do site: vermelho à esquerda, cinza no meio,
// azul à direita. Invertê-lo brigaria com a legenda que o site usa em toda
// página.
function banner() {
  const L = 1500, A = 500;
  const svg = [
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${COR.esq}"/><stop offset="0.5" stop-color="${COR.fundo2}"/><stop offset="1" stop-color="${COR.dir}"/>
    </linearGradient>
    <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="9" flood-color="#000" flood-opacity="0.55"/>
    </filter></defs>`,
    `<rect width="${L}" height="${A}" fill="url(#g)"/>`,
    `<g filter="url(#sombra)">${marca(L - 362, 92, 17)}`,
    txt(L - 60, 104, 'PoderBR', { tam: 50, peso: 'bold', ancora: 'end' }),
    '</g>',
    `<g filter="url(#sombra)">${txt(L - 60, 150, 'poderbrasileiro.github.io', { tam: 22, cor: '#ffffff', ancora: 'end' })}</g>`,
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
