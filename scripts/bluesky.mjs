// Postagem no Bluesky. A API é aberta e gratuita: basta usuário e uma senha
// de aplicativo (Ajustes → Privacidade e segurança → Senhas de aplicativo),
// nunca a senha da conta.
//
//   BSKY_USUARIO=poderbr.bsky.social
//   BSKY_SENHA=xxxx-xxxx-xxxx-xxxx
//
// Diferente do X, aqui link não vira link sozinho: é preciso mandar junto a
// posição exata dele no texto, em bytes. É o que `facetas` faz.

const SERVIDOR = 'https://bsky.social';
const LIMITE = 300;   // caracteres; o Bluesky conta graphemes, aqui vai o texto inteiro

async function chamar(caminho, { corpo, tipo = 'application/json', token } = {}) {
  const r = await fetch(`${SERVIDOR}/xrpc/${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { ...(corpo ? { 'Content-Type': tipo } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(corpo ? { body: Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo) } : {}),
  });
  if (!r.ok) throw new Error(`Bluesky respondeu ${r.status}: ${(await r.text()).slice(0, 240)}`);
  return r.json();
}

export const temChaves = () => Boolean(process.env.BSKY_USUARIO && process.env.BSKY_SENHA);

export async function entrar() {
  if (!temChaves()) throw new Error('faltam BSKY_USUARIO e BSKY_SENHA');
  const s = await chamar('com.atproto.server.createSession', {
    corpo: { identifier: process.env.BSKY_USUARIO, password: process.env.BSKY_SENHA },
  });
  return { token: s.accessJwt, did: s.did, handle: s.handle };
}

// Posição dos links em bytes UTF-8, que é como o protocolo conta.
function facetas(texto) {
  const bytes = Buffer.from(texto, 'utf8');
  const out = [];
  for (const m of texto.matchAll(/https?:\/\/[^\s]+[^\s.,;:!?)]/g)) {
    out.push({
      index: {
        byteStart: Buffer.from(texto.slice(0, m.index), 'utf8').length,
        byteEnd: Buffer.from(texto.slice(0, m.index + m[0].length), 'utf8').length,
      },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
    });
  }
  return out.length && bytes.length ? out : undefined;
}

export async function postar(texto, sessao, imagem = null) {
  if ([...texto].length > LIMITE) throw new Error(`texto com ${[...texto].length} caracteres; o limite é ${LIMITE}`);
  let embed;
  if (imagem) {
    const blob = await chamar('com.atproto.repo.uploadBlob', { corpo: imagem.png, tipo: 'image/png', token: sessao.token });
    embed = {
      $type: 'app.bsky.embed.images',
      images: [{ alt: (imagem.alt ?? '').slice(0, 2000), image: blob.blob }],
    };
  }
  const r = await chamar('com.atproto.repo.createRecord', {
    token: sessao.token,
    corpo: {
      repo: sessao.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: texto,
        facets: facetas(texto),
        createdAt: new Date().toISOString(),
        langs: ['pt-BR'],
        ...(embed ? { embed } : {}),
      },
    },
  });
  // O endereço público usa a parte final do URI do registro.
  return `https://bsky.app/profile/${sessao.handle}/post/${r.uri.split('/').pop()}`;
}
