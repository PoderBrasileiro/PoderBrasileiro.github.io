// Onde cada partido cai entre a esquerda e a direita, pela Wikidata.
//
// Mora aqui, e não em mundo.mjs, porque tem dois usuários: os partidos de
// quem governa cada país e os de quem governa cada estado ou província. As
// duas coletas têm que classificar pela mesma régua, senão o mapa diria uma
// coisa no país e outra dentro dele.

// As cinco faixas, por índice: 0 esquerda ... 4 direita. É a mesma divisão
// que o site usa no Brasil, e os rótulos saem daqui pro painel.
export const BANDAS = [
  { chave: 'esquerda', rotulo: 'Esquerda' },
  { chave: 'centro-esquerda', rotulo: 'Centro-esquerda' },
  { chave: 'centro', rotulo: 'Centro' },
  { chave: 'centro-direita', rotulo: 'Centro-direita' },
  { chave: 'direita', rotulo: 'Direita' },
];

// Identificadores, não rótulos: o texto da Wikidata muda de tradução, o Q não.
//
// P1387, "political alignment": é a própria Wikidata dizendo em que parte do
// espectro o partido está. Quando existe, é o que vale.
export const ALINHAMENTO = {
  Q1129409: [0, 'Extrema-esquerda'],
  Q164597: [0, 'Esquerda'],
  Q737014: [1, 'Centro-esquerda'],
  Q6587194: [2, 'Centro'],
  Q844072: [3, 'Centro-direita'],
  Q76074: [4, 'Direita'],
  Q250598: [4, 'Direita libertária'],
  Q23018230: [4, 'Direita alternativa'],
  Q204481: [4, 'Extrema direita'],
  // "Partido pega-tudo" (Q1030814) descreve estratégia, não posição: fica fora.
};

// P1142, "political ideology": o desempate quando não há alinhamento. É o que
// faltava pra pintar os países de partido único — o Partido Comunista da China
// não tem P1387, mas tem comunismo e marxismo-leninismo em P1142.
//
// Fica de fora, de propósito, tudo que é ortogonal ao eixo esquerda-direita:
// autoritarismo, totalitarismo, populismo, estatismo, militarismo,
// nacionalismo étnico, federalismo, euroscepticismo. Um partido pode ser
// autoritário em qualquer parte do espectro, e tratar isso como "direita"
// seria trocar uma medida por outra sem avisar.
export const IDEOLOGIA = {
  // esquerda
  Q6186: 0, Q7264: 0, Q211930: 0, Q7272: 0, Q389647: 0, Q189280: 0,
  Q11900614: 0, Q1202972: 0, Q8813: 0, Q590478: 0, Q979616: 0, Q375332: 0,
  Q14475917: 0, Q28319806: 0, Q904148: 0, Q6034: 0, Q1191637: 0,
  // centro-esquerda
  Q121254: 1, Q821102: 1, Q201712: 1, Q494792: 1, Q1080800: 1,
  // centro
  Q6216: 2, Q192125: 2, Q324530: 2,
  // centro-direita
  Q209158: 3, Q729119: 3, Q1043096: 3, Q617609: 3, Q162719: 3, Q660018: 3,
  Q794394: 3, Q7333466: 3, Q7169: 3,
  // direita
  Q1414298: 4, Q852739: 4, Q436860: 4, Q182121: 4, Q853562: 4, Q2019152: 4,
  Q281347: 4, Q1307223: 4, Q189746: 4, Q1140370: 4, Q3757343: 4, Q2366025: 4,
  Q1422634: 4, Q50685643: 4, Q6235: 4,
};

// Os cortes das cinco faixas, os mesmos de src/comum.js: esquerda até 3,
// centro-esquerda até 4,5, centro até 5,5, centro-direita até 7.
export const CORTES = [3, 4.5, 5.5, 7, Infinity];

// Vários valores viram um: a média das bandas conhecidas. Um partido com
// "social-democracia" e "progressismo" cai em centro-esquerda; um com
// "comunismo" e "marxismo-leninismo", em esquerda.
//
// O empate no meio do caminho é resolvido PRA LONGE do centro, não pra perto.
// Com "centro" e "centro-esquerda" a média dá 1,5, e o arredondamento comum
// jogaria pro centro todo partido que tem um pé lá e outro fora: o centro
// acabaria virando o depósito dos casos duvidosos. Um partido que também se
// descreve como centro-esquerda não é um partido de centro.
export function bandaMedia(valores, mapa) {
  const notas = valores.map((q) => (Array.isArray(mapa[q]) ? mapa[q][0] : mapa[q])).filter((n) => n != null);
  if (!notas.length) return null;
  const media = notas.reduce((a, b) => a + b, 0) / notas.length;
  const CENTRO = 2;
  if (Math.abs(media - Math.trunc(media)) !== 0.5) return Math.round(media);
  return media < CENTRO ? Math.floor(media) : Math.ceil(media);
}

// ---------- consulta ----------

const UA = { 'User-Agent': 'GPL/0.1 (projeto pessoal; dados publicos)', Accept: 'application/sparql-results+json' };

export async function consultar(query) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({ query, format: 'json' }),
        { headers: UA, signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Lido como texto, não como JSON direto: de vez em quando um rótulo da
      // Wikidata traz um caractere de controle cru, que é ilegal dentro de
      // string JSON e derruba o parse inteiro por causa de um nome só. Eles
      // viram espaço; a estrutura do documento não usa nenhum deles.
      const bruto = (await r.text()).replace(/[\x00-\x1f]/g, ' ');
      // Resposta cortada no meio é o jeito normal de a Wikidata falhar numa
      // consulta pesada: ela transmite os resultados enquanto calcula e corta
      // o fluxo ao estourar o tempo, então o que chega é JSON pela metade.
      // Sem esta checagem o erro saía como "string sem fim" numa posição
      // diferente a cada tentativa, que não diz nada a quem lê o log.
      if (!bruto.trimEnd().endsWith('}')) throw new Error(`resposta cortada em ${bruto.length} bytes — consulta pesada demais`);
      return JSON.parse(bruto).results.bindings;
    } catch (e) {
      // Espera dobrando, e até cinco vezes. Consulta grande volta truncada com
      // alguma frequência — o erro aparece como "string sem fim" ou "faltou
      // vírgula" no meio do JSON, em posição diferente a cada tentativa, que é
      // a cara de resposta cortada e não de dado estragado. Tentar de novo
      // resolve; tentar de novo rápido demais, não.
      if (i >= 5) throw new Error(`Wikidata: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, Math.min(60000, 10000 * 2 ** i)));
    }
  }
}

export const qid = (uri) => uri.split('/').pop();

// Nome em inglês, sigla, alinhamento e ideologia de cada partido, por lotes de
// QID. Junto da consulta que pede as pessoas isso multiplicava as linhas e a
// resposta vinha truncada; separado, cabe.
export async function buscarPartidos(qids) {
  const partidos = new Map();
  const doPartido = (k) => {
    if (!partidos.has(k)) partidos.set(k, { nomes: new Set(), siglas: new Set(), alinhamento: new Set(), ideologia: new Set() });
    return partidos.get(k);
  };
  for (let i = 0; i < qids.length; i += 60) {
    const valores = qids.slice(i, i + 60).map((q) => `wd:${q}`).join(' ');
    const r = await consultar(`SELECT ?partido ?en ?sigla ?alinhamento ?ideologia WHERE {
      VALUES ?partido { ${valores} }
      OPTIONAL { ?partido rdfs:label ?en . FILTER(LANG(?en) = "en") }
      OPTIONAL { ?partido wdt:P1813 ?sigla }
      OPTIONAL { ?partido wdt:P1387 ?alinhamento }
      OPTIONAL { ?partido wdt:P1142 ?ideologia } }`).catch(() => []);
    for (const l of r) {
      const a = doPartido(qid(l.partido.value));
      if (l.en) a.nomes.add(l.en.value);
      if (l.sigla) a.siglas.add(l.sigla.value);
      if (l.alinhamento) a.alinhamento.add(qid(l.alinhamento.value));
      if (l.ideologia) a.ideologia.add(qid(l.ideologia.value));
    }
  }
  return partidos;
}

// A faixa de um partido, na ordem das fontes: alinhamento, depois ideologia.
// Devolve null quando nenhuma das duas sabe. Quem tem nota de survey aplica a
// terceira fonte por fora, porque só a coleta dos países tem survey.
export function faixaDoPartido(a) {
  if (!a) return null;
  const alvos = [...a.alinhamento];
  const porAlinhamento = bandaMedia(alvos, ALINHAMENTO);
  if (porAlinhamento != null) {
    // Com um valor só vale o rótulo específico ("Extrema-esquerda"); com
    // vários, a média já não é nenhum deles, e fica o nome da faixa.
    const unico = alvos.filter((q) => ALINHAMENTO[q]);
    return {
      faixa: BANDAS[porAlinhamento].chave,
      posicaoRotulo: unico.length === 1 ? ALINHAMENTO[unico[0]][1] : BANDAS[porAlinhamento].rotulo,
      faixaFonte: 'alinhamento',
    };
  }
  const porIdeologia = bandaMedia([...a.ideologia], IDEOLOGIA);
  if (porIdeologia == null) return null;
  return { faixa: BANDAS[porIdeologia].chave, posicaoRotulo: BANDAS[porIdeologia].rotulo, faixaFonte: 'ideologia' };
}

// A faixa que corresponde a uma nota de 0 a 10.
export function faixaDaNota(n) {
  const b = CORTES.findIndex((corte) => n < corte);
  return { faixa: BANDAS[b].chave, posicaoRotulo: BANDAS[b].rotulo, faixaFonte: 'survey' };
}
