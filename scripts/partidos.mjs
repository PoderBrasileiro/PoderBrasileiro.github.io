// Tabela de partidos e normalização de sigla, usada por todos os coletores.

import { readFile } from 'node:fs/promises';

export const tabelaPartidos = JSON.parse(await readFile(new URL('../data/partidos.json', import.meta.url), 'utf8'));

// Devolve a sigla como está em data/partidos.json, ou null pra "sem partido".
// Sigla desconhecida volta em caixa alta, sem inventar equivalência.
export function normalizarPartido(bruto) {
  if (!bruto) return null;
  const s = bruto.trim();
  if (!s || /^sem partido$/i.test(s)) return null;
  const maiusc = s.toUpperCase();
  if (maiusc in tabelaPartidos.apelidos) return tabelaPartidos.apelidos[maiusc];
  // "PCdoB" é a única sigla com minúsculas; o resto vai em caixa alta.
  const direto = Object.keys(tabelaPartidos.partidos).find((k) =>
    k.toUpperCase() === maiusc || tabelaPartidos.partidos[k].nome.toUpperCase() === maiusc);
  return direto ?? maiusc;
}
