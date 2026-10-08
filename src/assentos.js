// Layout de assentos de plenário, usado pela tela e pelo gerador de imagem.

// Assentos de um plenário em semicírculo, como os infográficos de jornal.
// Devolve pontos em fração da caixa (x de 0 a 1, y de 0 a 1, com a base
// embaixo), já ordenados da esquerda para a direita de quem olha.
export function assentos(n, linhas) {
  const DENTRO = 0.52;   // o vão central é o que dá a forma de ferradura
  const raios = Array.from({ length: linhas }, (_, i) => DENTRO + (1 - DENTRO) * (i / (linhas - 1)));
  const soma = raios.reduce((a, b) => a + b, 0);
  // Linha de fora comporta mais gente: cadeiras proporcionais ao raio.
  const porLinha = raios.map((r) => Math.max(1, Math.round((n * r) / soma)));
  let resto = n - porLinha.reduce((a, b) => a + b, 0);
  for (let i = linhas - 1, voltas = 0; resto !== 0 && voltas < n + linhas; i = (i - 1 + linhas) % linhas, voltas++) {
    if (resto > 0) { porLinha[i]++; resto--; } else if (porLinha[i] > 1) { porLinha[i]--; resto++; }
  }
  const pontos = [];
  raios.forEach((r, i) => {
    for (let j = 0; j < porLinha[i]; j++) {
      const ang = Math.PI * (1 - (j + 0.5) / porLinha[i]);
      pontos.push({ ang, x: 0.5 + 0.5 * r * Math.cos(ang), y: 1 - r * Math.sin(ang) });
    }
  });
  return pontos.sort((a, b) => b.ang - a.ang);
}

