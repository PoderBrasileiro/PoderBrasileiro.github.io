// Posta no X as novidades: votação nominal de PEC e resultado de 2º turno.
//
//   npm run postar             posta o que for novo (precisa das 4 chaves)
//   npm run postar -- --semear marca tudo que existe hoje como já postado
//
// Sem as chaves no ambiente o script só mostra o que postaria (ensaio).
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// No GitHub elas ficam em Settings → Secrets and variables → Actions.
//
// O que já foi postado fica em data/postados.json, que o workflow commita.
// Um post só entra nessa lista depois que o X confirma — se a postagem
// falhar, a próxima rodada tenta de novo em vez de perder a notícia.
//
// MAX_POR_RODADA existe porque uma lista de "já postados" perdida ou zerada
// faria o script despejar dezenas de posts antigos de uma vez.

import { readFile, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';

const RAIZ = new URL('..', import.meta.url);
const ESTADO = 'data/postados.json';
const SITE = (process.env.SITE_URL ?? 'https://poderbrasileiro.github.io/').replace(/\/?$/, '/');
const MAX_POR_RODADA = 6;
const LIMITE = 280;
const TAMANHO_LINK = 23;   // o X conta qualquer link como 23 caracteres

const ler = async (caminho, padrao) => {
  try { return JSON.parse(await readFile(new URL(caminho, RAIZ), 'utf8')); } catch { return padrao; }
};
const dataBr = (iso) => iso.slice(0, 10).split('-').reverse().join('/');
const comPartido = (c) => `${c.nome} (${c.partido ?? 'sem partido'})`;

// Monta o texto cortando o trecho livre pra caber, sem estourar o limite.
function montar(fixo, livre, link) {
  const sobra = LIMITE - fixo.length - TAMANHO_LINK - 4;
  const trecho = livre && sobra > 20 ? (livre.length > sobra ? `${livre.slice(0, sobra - 1).trimEnd()}…` : livre) : '';
  return [fixo, trecho, link].filter(Boolean).join('\n\n');
}

// ---------- o que há pra postar ----------

function novidades(pecs, eleicao, estado) {
  const itens = [];

  for (const pec of pecs?.pecs ?? []) {
    for (const v of pec.votacoes) {
      const id = `pec:${pec.id}:${v.data}:${v.descricao.length}`;
      const resultado = v.resultado ? v.resultado.toUpperCase() : 'VOTADA';
      itens.push({
        id, data: v.data,
        texto: montar(
          `${pec.titulo} — ${resultado} no plenário ${pec.casa === 'Senado' ? 'do Senado' : 'da Câmara'} em ${dataBr(v.data)}.\nSim ${v.placar.Sim ?? 0} · Não ${v.placar['Não'] ?? 0}`,
          pec.ementa, `Veja como cada parlamentar votou: ${SITE}#pecs`),
      });
    }
  }

  // 2º turno: só vira post quando a disputa que estava pendente tem eleito.
  if (eleicao) {
    const disputas = [['presidente', 'Presidência da República', eleicao.presidente],
      ...Object.entries(eleicao.porUf).map(([uf, u]) => [`governador:${uf}`, `Governo de ${uf}`, u.governador])];
    for (const [chave, rotulo, d] of disputas) {
      const id = `2turno:${chave}`;
      if (d.status === 'segundo-turno') { estado.pendentes[id] = true; continue; }
      if (!estado.pendentes[id]) continue;   // decidida no 1º turno: não é novidade
      const e = d.eleito;
      itens.push({
        id, data: eleicao.geradoEm.slice(0, 10), resolve: id,
        texto: montar(`2º turno — ${rotulo}: eleito(a) ${comPartido(e)}${e.pct ? `, com ${e.pct}% dos votos válidos` : ''}.`,
          e.vice ? `Vice: ${e.vice.nome}.` : '', `Quem fica e quem sai em 2027: ${SITE}#rede`),
      });
    }
  }
  return itens.filter((i) => !estado.postados.includes(i.id)).sort((a, b) => a.data.localeCompare(b.data));
}

// ---------- X (OAuth 1.0a) ----------

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// Assina e chama a API. Sem `corpo` é um GET (usado só pra conferir as chaves).
async function chamarX(url, chaves, corpo = null, tipo = 'application/json') {
  const oauth = {
    oauth_consumer_key: chaves.key, oauth_token: chaves.token,
    oauth_nonce: randomBytes(16).toString('hex'), oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_signature_method: 'HMAC-SHA1', oauth_version: '1.0',
  };
  // Corpo JSON não entra na assinatura; só os parâmetros oauth.
  const metodo = corpo ? 'POST' : 'GET';
  const base = [metodo, pct(url), pct(Object.keys(oauth).sort().map((k) => `${pct(k)}=${pct(oauth[k])}`).join('&'))].join('&');
  oauth.oauth_signature = createHmac('sha1', `${pct(chaves.secret)}&${pct(chaves.tokenSecret)}`).update(base).digest('base64');
  const r = await fetch(url, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': tipo } : {}), Authorization: `OAuth ${Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(', ')}` },
    ...(corpo ? { body: Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo) } : {}),
  });
  if (!r.ok) throw new Error(`X respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).data;
}

// Sobe uma imagem e devolve o media_id. O endpoint de mídia é o v1.1 (o v2
// não cobre isso) e o corpo multipart não entra na assinatura, como o JSON.
async function subirImagem(png, chaves, descricao) {
  const limite = '----poderbr' + Math.random().toString(36).slice(2);
  const cabeca = Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="media"; filename="card.png"\r\nContent-Type: image/png\r\n\r\n`);
  const corpo = Buffer.concat([cabeca, png, Buffer.from(`\r\n--${limite}--\r\n`)]);
  const r = await chamarX('https://upload.twitter.com/1.1/media/upload.json', chaves, corpo, `multipart/form-data; boundary=${limite}`);
  const id = r?.media_id_string;
  // Texto alternativo: sem ele a imagem não diz nada a quem usa leitor de tela.
  if (id && descricao) {
    await chamarX('https://upload.twitter.com/1.1/media/metadata/create.json', chaves,
      { media_id: id, alt_text: { text: descricao.slice(0, 1000) } }).catch((e) => console.warn(`  alt_text: ${e.message}`));
  }
  return id;
}

async function postarNoX(texto, chaves, imagem = null) {
  const media = imagem ? await subirImagem(imagem.png, chaves, imagem.alt) : null;
  const corpo = { text: texto, ...(media ? { media: { media_ids: [media] } } : {}) };
  return (await chamarX('https://api.x.com/2/tweets', chaves, corpo))?.id;
}

// ---------- principal ----------

const estado = { postados: [], pendentes: {}, ...(await ler(ESTADO, {})) };
const pecs = await ler('public/data/pecs.json', null);
const eleicao = await ler('public/data/eleicao2026.json', null);
const fila = novidades(pecs, eleicao, estado);
const gravar = () => writeFile(new URL(ESTADO, RAIZ), JSON.stringify(estado, null, 1) + '\n');

if (process.argv.includes('--semear')) {
  estado.postados.push(...fila.filter((i) => !i.resolve).map((i) => i.id));
  await gravar();
  console.log(`Semeado: ${estado.postados.length} itens marcados como já postados; ${Object.keys(estado.pendentes).length} disputas de 2º turno acompanhadas.`);
  process.exit(0);
}

const chaves = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const ensaio = !Object.values(chaves).every(Boolean);
if (ensaio) console.log('Chaves do X ausentes: ENSAIO, nada será postado.\n');

// Confere as chaves sem postar nada.
if (process.argv.includes('--verificar')) {
  if (ensaio) { console.error('Faltam chaves: ' + Object.keys(chaves).filter((k) => !chaves[k]).join(', ')); process.exit(1); }
  const eu = await chamarX('https://api.x.com/2/users/me', chaves);
  console.log(`Chaves OK — conta @${eu.username} (${eu.name}).`);
  process.exit(0);
}

// Cartão da composição de uma casa, com a imagem do plenário.
async function cartao(cargo) {
  const { cartaoComposicao } = await import('./imagens.mjs');
  const { png, balanco: b, titulo } = cartaoComposicao(cargo);
  return {
    png,
    alt: `Gráfico do ${titulo}: ${b.gente.length} cadeiras em semicírculo, uma por parlamentar, coloridas da esquerda (vermelho) para a direita (azul) conforme a posição do partido. ${b.esq}% de esquerda e ${b.dir}% de direita entre os ${b.conhecidos} com partido conhecido.`,
    balanco: b, titulo,
  };
}

// Post de estreia, uma vez só.
if (process.argv.includes('--apresentacao')) {
  const img = await cartao('senador');
  const texto = montar('Este perfil publica, de forma automática, o que o Congresso vota e o que a eleição muda no poder — a partir de dados públicos da Câmara, do Senado e do TSE.',
    'Mapa dos 5.569 municípios, os três poderes e a transição para 2027:', SITE);
  console.log(texto + '\n');
  if (ensaio) process.exit(0);
  console.log(`postado: https://x.com/i/status/${await postarNoX(texto, chaves, img)}`);
  process.exit(0);
}

// Composição de uma casa hoje, com o gráfico do plenário.
if (process.argv.some((a) => a.startsWith('--composicao'))) {
  const cargo = process.argv.includes('--composicao-camara') ? 'deputado' : 'senador';
  const img = await cartao(cargo);
  const b = img.balanco;
  const texto = montar(`${img.titulo} hoje: ${b.dir}% de direita e ${b.esq}% de esquerda${b.centro ? `, ${b.centro}% no centro` : ''}.`,
    `Contagem de cabeças pela posição do partido de cada um dos ${b.gente.length}, segundo classificação de cientistas políticos. Quem é quem, cadeira por cadeira:`,
    `${SITE}#rede`);
  console.log(texto + '\n');
  if (ensaio) process.exit(0);
  console.log(`postado: https://x.com/i/status/${await postarNoX(texto, chaves, img)}`);
  process.exit(0);
}
if (!fila.length) console.log('Nada novo pra postar.');
if (fila.length > MAX_POR_RODADA) console.warn(`${fila.length} itens na fila; só os ${MAX_POR_RODADA} mais antigos vão nesta rodada.`);

let falhas = 0;
for (const item of fila.slice(0, MAX_POR_RODADA)) {
  console.log(`--- ${item.id}\n${item.texto}\n`);
  if (ensaio) continue;
  try {
    const id = await postarNoX(item.texto, chaves);
    estado.postados.push(item.id);
    if (item.resolve) delete estado.pendentes[item.resolve];
    console.log(`postado: https://x.com/i/status/${id}\n`);
  } catch (e) {
    falhas++;
    console.error(`FALHOU: ${e.message}\n`);
    break;   // chave errada ou limite: não adianta insistir nos próximos
  }
}
await gravar();
if (falhas) process.exit(1);
