// Monta o que o dono do perfil abre pra postar.
//
//   public/c/<slug>.html ... uma página por cartão. É o link que vai no post:
//                            o X lê as tags dela e mostra a imagem sozinho,
//                            então não é preciso anexar nada.
//   public/pauta/ .......... a pauta do dia com botão de copiar em cada post.
//
// Importado por postar.mjs; não roda sozinho.

import { writeFile, mkdir } from 'node:fs/promises';

const RAIZ = new URL('..', import.meta.url);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ESTILO = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#1a1a19;color:#fff;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:28px 16px 64px}
a{color:#8ab8f5}
h1{font-size:26px;line-height:1.2;margin:0 0 4px}
h2{font-size:17px;margin:0 0 10px}
.fraco{color:#8f8e86;font-size:14px}
img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid #3a3a37}
.botao{display:inline-block;padding:11px 20px;border-radius:9px;background:#fff;color:#1a1a19;text-decoration:none;font-weight:700;border:0;font-size:15px;cursor:pointer}
.botao.vazio{background:none;color:#fff;border:1px solid #3a3a37;font-weight:600}
`;

const pagina = (titulo, descricao, cabeca, corpo) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
${cabeca}
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>${ESTILO}</style>
</head>
<body><main>${corpo}</main></body>
</html>
`;

// ---------- a página de um cartão ----------

// O post aponta pra cá em vez de carregar a imagem junto. Vantagem: o X monta
// a prévia sozinho, quem clica cai numa página que explica o número e leva pro
// quadro, e o mesmo link serve no WhatsApp e no Bluesky.
export async function paginaDoCartao({ slug, titulo, descricao, imagem, alt, destino }, site) {
  await mkdir(new URL('public/c/', RAIZ), { recursive: true });
  const url = `${site}c/${slug}.html`;
  const cabeca = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="PoderBR">`,
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(descricao)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(site)}cartoes/${esc(imagem)}">`,
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n');
  const corpo = `
<p><a href="../">PoderBR</a></p>
<h1>${esc(titulo)}</h1>
<p class="fraco">${esc(descricao)}</p>
<p><img src="../cartoes/${esc(imagem)}" alt="${esc(alt)}"></p>
<p><a class="botao" href="../${esc(destino ?? '#rede')}">Ver no quadro interativo</a></p>
<p class="fraco">Dados públicos da Câmara, do Senado, do TSE e do IBGE. A posição de esquerda e direita é a do partido de cada pessoa, segundo classificação de cientistas políticos — não é uma medida individual.</p>`;
  await writeFile(new URL(`public/c/${slug}.html`, RAIZ), pagina(`${titulo} | PoderBR`, descricao, cabeca, corpo));
  return url;
}

// ---------- a pauta ----------

export async function paginaDaPauta(itens, { site, data, proximoRetrato }) {
  await mkdir(new URL('public/pauta/', RAIZ), { recursive: true });
  const blocos = itens.map((it, n) => `
<section>
  <h2>${n + 1}. ${esc(it.tipo)}${it.fixar ? ' <span class="fraco">— fixe este no perfil</span>' : ''}</h2>
  <pre id="t${n}">${esc(it.texto)}</pre>
  <p>
    <button class="botao" data-copiar="t${n}">Copiar texto</button>
    <a class="botao vazio" href="https://x.com/intent/post?text=${encodeURIComponent(it.texto)}" target="_blank" rel="noopener">Abrir no X</a>
  </p>
  ${it.previa ? `<p class="fraco">A imagem entra sozinha pela prévia do link. Não precisa anexar nada.</p>
  <p><img src="../cartoes/${esc(it.previa)}" alt="${esc(it.alt ?? '')}"></p>` : ''}
</section>`).join('\n');

  const corpo = `
<p><a href="../">PoderBR</a></p>
<h1>Pauta de ${esc(data)}</h1>
<p class="fraco">Clique em <b>Copiar texto</b> e cole no X, ou use <b>Abrir no X</b> que já vai preenchido. A imagem aparece sozinha na prévia do link — não precisa baixar nem anexar.</p>
${itens.length ? blocos : `<section><h2>Nada para postar hoje</h2><p class="fraco">O próximo retrato sai em ${esc(proximoRetrato ?? '—')}.</p></section>`}
<hr>
<p class="fraco">Refeita sozinha todo dia. O que já apareceu aqui não volta em pautas futuras.</p>
<script>
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copiar]');
  if (!b) return;
  const texto = document.getElementById(b.dataset.copiar).textContent;
  try {
    await navigator.clipboard.writeText(texto);
    b.textContent = 'Copiado';
  } catch {
    // Sem permissão de área de transferência: seleciona pro usuário copiar.
    const faixa = document.createRange();
    faixa.selectNodeContents(document.getElementById(b.dataset.copiar));
    getSelection().removeAllRanges();
    getSelection().addRange(faixa);
    b.textContent = 'Selecionado — use Ctrl+C';
  }
  setTimeout(() => { b.textContent = 'Copiar texto'; }, 2500);
});
</script>`;
  const extra = `<meta name="robots" content="noindex">\n<style>pre{white-space:pre-wrap;word-break:break-word;background:#262624;border:1px solid #3a3a37;border-radius:10px;padding:14px;font:15px/1.5 inherit}section{border-top:1px solid #3a3a37;padding-top:20px;margin-top:24px}hr{border:0;border-top:1px solid #3a3a37;margin:32px 0 16px}</style>`;
  await writeFile(new URL('public/pauta/index.html', RAIZ), pagina(`Pauta de ${data} | PoderBR`, 'Posts do dia, prontos para copiar.', extra, corpo));
  return `${site}pauta/`;
}
