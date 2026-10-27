// Os estados, províncias e departamentos de cada país — um arquivo por país.
//
//   npm run subdivisoes
//
// Fonte: Natural Earth 1:10m admin-1 (domínio público). São 4.596 divisões em
// 241 países, num GeoJSON de 40 MB. Esse arquivão não entra no repositório:
// o script baixa pra tmp/, fatia por país e grava TopoJSON pequeno em
// public/data/div/<ISO2>.json — que é o que o site carrega quando alguém
// entra num país.
//
// RODA UMA VEZ, à mão. Fronteira interna não muda de mês pra mês, e baixar
// 40 MB em toda coleta diária seria desperdício; o resultado fica commitado.
//
// O nível não é o mesmo em todo lugar: a Natural Earth dá os 51 estados dos
// EUA, mas também os 232 condados do Reino Unido e os 101 departamentos da
// França. É o que a fonte entrega como "admin-1" em cada país; o site mostra
// o nome que vier e não promete equivalência entre países.

import { writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';

const RAIZ = new URL('..', import.meta.url);
const FONTE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const BRUTO = new URL('tmp/ne/adm1-10m.geojson', RAIZ);
const SAIDA = new URL('public/data/div/', RAIZ);

// Quanto da malha sobra depois de simplificar. 0,25 tira três quartos dos
// pontos e, no tamanho em que essas divisões aparecem na tela, não dá pra
// ver diferença — mas corta o arquivo do Reino Unido de 900 kB pra 200.
const DETALHE = 0.25;

await mkdir(new URL('tmp/ne/', RAIZ), { recursive: true });
await mkdir(SAIDA, { recursive: true });

if (!(await stat(BRUTO).catch(() => null))) {
  console.log('Baixando a Natural Earth admin-1 (40 MB, uma vez só)...');
  const r = await fetch(FONTE, { headers: { 'User-Agent': 'GPL/0.1 (projeto pessoal; dados publicos)' }, signal: AbortSignal.timeout(600000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} na Natural Earth`);
  await writeFile(BRUTO, Buffer.from(await r.arrayBuffer()));
}

const bruto = JSON.parse(await readFile(BRUTO, 'utf8'));

const porPais = new Map();
for (const f of bruto.features) {
  const iso = f.properties.iso_a2;
  // Território sem código ISO próprio (Kosovo, Somalilândia e afins) vem como
  // "-99" ou "-1". Sem código não há como ligar à lista de países, então fica
  // fora — e a checagem é por duas letras, não por tamanho: "-1" tem dois
  // caracteres e virou um arquivo div/-1.json antes de a regra apertar.
  if (!/^[A-Z]{2}$/.test(iso ?? '')) continue;
  if (!porPais.has(iso)) porPais.set(iso, []);
  porPais.get(iso).push({
    type: 'Feature',
    properties: {
      id: f.properties.adm1_code,
      nome: f.properties.name_pt || f.properties.name || f.properties.name_en || f.properties.adm1_code,
      tipo: f.properties.type_en || f.properties.type || null,
      iso: f.properties.iso_3166_2 || null,
    },
    geometry: f.geometry,
  });
}

const indice = {};
let total = 0;
for (const [iso, feicoes] of [...porPais].sort()) {
  // Quantização e simplificação: as duas pontas do que faz o arquivo encolher.
  // A quantização arredonda as coordenadas pra uma grade; a simplificação
  // joga fora os pontos que quase não mudam a forma.
  let topo = topology({ divisoes: { type: 'FeatureCollection', features: feicoes } }, 1e4);
  topo = presimplify(topo);
  topo = simplify(topo, quantile(topo, DETALHE));
  const texto = JSON.stringify(topo);
  await writeFile(new URL(`${iso}.json`, SAIDA), texto);
  indice[iso] = feicoes.length;
  total += texto.length;
}

await writeFile(new URL('indice.json', SAIDA), JSON.stringify(indice));
console.log(`OK: ${Object.keys(indice).length} países, ${Object.values(indice).reduce((a, b) => a + b, 0)} divisões, ${(total / 1024 / 1024).toFixed(1)} MB no total.`);
