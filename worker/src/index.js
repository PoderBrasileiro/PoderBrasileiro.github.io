// Contador de quem está vendo o site agora.
//
// Cada aba aberta manda um "estou aqui" a cada 25 segundos com um
// identificador sorteado na hora, que morre quando a aba fecha. Não guardamos
// IP, não gravamos cookie e não dá pra ligar uma visita à outra: o contador
// sabe quantas abas estão abertas, e só.
//
// Tudo vive num Durable Object só — é o que garante um número único em vez de
// uma contagem por servidor. Como é um objeto só, ele também é o teto de
// escala; para um site deste tamanho sobra.

const JANELA_MS = 70_000;   // sem sinal por mais que isso, a aba saiu
const MAX_ABAS = 50_000;    // trava contra alguém inflar o número de propósito

const cabecalhos = (origem) => ({
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': origem,
  'access-control-allow-methods': 'GET, OPTIONS',
  'cache-control': 'no-store',
});

export class Presenca {
  constructor(state) {
    this.state = state;
    this.vistos = new Map();   // id da aba -> instante do último sinal
  }

  async fetch(requisicao) {
    const url = new URL(requisicao.url);
    const id = (url.searchParams.get('id') ?? '').slice(0, 40);
    const agora = Date.now();

    for (const [k, quando] of this.vistos) if (agora - quando > JANELA_MS) this.vistos.delete(k);
    if (id && (this.vistos.has(id) || this.vistos.size < MAX_ABAS)) this.vistos.set(id, agora);

    // Total do dia: um número a mais que custa pouco e diz se o site andou.
    const dia = new Date(agora).toISOString().slice(0, 10);
    const guardado = (await this.state.storage.get('dia')) ?? { data: dia, abas: [] };
    if (guardado.data !== dia) { guardado.data = dia; guardado.abas = []; }
    if (id && !guardado.abas.includes(id)) {
      guardado.abas.push(id);
      if (guardado.abas.length > 200_000) guardado.abas.shift();
      await this.state.storage.put('dia', guardado);
    }

    return Response.json({ agora: this.vistos.size, hoje: guardado.abas.length });
  }
}

export default {
  async fetch(requisicao, ambiente) {
    const url = new URL(requisicao.url);
    // Só o próprio site chama isto; a lista fica em ORIGENS, nas variáveis.
    const permitidas = (ambiente.ORIGENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const origem = requisicao.headers.get('Origin') ?? '';
    const liberada = permitidas.includes(origem) ? origem : permitidas[0] ?? '';

    if (requisicao.method === 'OPTIONS') return new Response(null, { headers: cabecalhos(liberada) });
    if (url.pathname !== '/ping') return new Response('PoderBR — contador de presença. Use /ping.', { status: 404 });
    if (origem && !permitidas.includes(origem)) return new Response('{"erro":"origem não permitida"}', { status: 403, headers: cabecalhos(liberada) });

    const obj = ambiente.PRESENCA.get(ambiente.PRESENCA.idFromName('global'));
    const r = await obj.fetch(requisicao);
    return new Response(await r.text(), { headers: cabecalhos(liberada) });
  },
};
