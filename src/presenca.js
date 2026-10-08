// "N pessoas vendo agora", no rodapé.
//
// O número vem do Worker em worker/ (Cloudflare). Enquanto ENDERECO estiver
// vazio o bloco simplesmente não aparece — o site inteiro funciona sem ele.
//
// O identificador é sorteado a cada aba e vive só na memória da página: não
// grava cookie, não guarda IP e não liga uma visita à outra. Some ao fechar.

import { h, trocar } from './comum.js';

const ENDERECO = 'https://poderbr-contador.poderbrasileiro.workers.dev';
const INTERVALO_MS = 25_000;

const plural = (n) => (n === 1 ? '1 pessoa vendo agora' : `${n.toLocaleString('pt-BR')} pessoas vendo agora`);

export function criarPresenca(raiz) {
  if (!ENDERECO) return;
  const id = (crypto.randomUUID?.() ?? String(Math.random())).slice(0, 36);
  const caixa = h('div', { class: 'presenca' });
  let errosSeguidos = 0;

  async function bater() {
    try {
      const r = await fetch(`${ENDERECO}/ping?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      errosSeguidos = 0;
      trocar(caixa, h('span', { class: 'presenca-ponto', 'aria-hidden': 'true' }), h('span', {}, plural(d.agora)),
        d.hoje > d.agora ? h('small', {}, `${d.hoje.toLocaleString('pt-BR')} hoje`) : null);
      if (!caixa.isConnected) raiz.append(caixa);
    } catch {
      // Contador fora do ar não é assunto de quem está lendo o site: some.
      if (++errosSeguidos >= 2) caixa.remove();
    }
  }

  bater();
  const relogio = setInterval(bater, INTERVALO_MS);
  // Aba escondida não conta como alguém vendo.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) bater(); });
  addEventListener('pagehide', () => clearInterval(relogio));
}
