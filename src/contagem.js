// Contagem regressiva do 2º turno, no rodapé.
//
// Duas marcas no mesmo dia: a votação (urnas abrem às 8h) e a apuração (urnas
// fecham às 17h e os números começam a sair). Passada a apuração, o bloco
// some sozinho — nada de contador zerado para sempre na tela.
//
// A data vem de eleicao2026.json ("25/10"), não está escrita aqui: quando o
// TSE marcar outra, o arquivo muda e o site acompanha.

import { h, trocar } from './comum.js';

const FUSO = '-03:00';   // horário de Brasília, onde a eleição acontece

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function faltam(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  if (d > 0) return `${plural(d, 'dia', 'dias')} e ${plural(hh, 'hora', 'horas')}`;
  if (hh > 0) return `${plural(hh, 'hora', 'horas')} e ${plural(mm, 'minuto', 'minutos')}`;
  return plural(Math.max(mm, 0), 'minuto', 'minutos');
}

export function criarContagem(raiz, dados) {
  const dia = dados.eleicao?.segundoTurnoEm;          // "25/10"
  if (!dia || dados.eleicao.presidente.status !== 'segundo-turno') return;
  const [d, m] = dia.split('/');
  const ano = new Date(dados.eleicao.geradoEm).getFullYear();
  const marcas = [
    { rotulo: 'Votação do 2º turno', quando: new Date(`${ano}-${m}-${d}T08:00:00${FUSO}`), depois: 'Urnas abertas desde as 8h.' },
    { rotulo: 'Início da apuração', quando: new Date(`${ano}-${m}-${d}T17:00:00${FUSO}`), depois: 'Apuração em andamento.' },
  ];
  if (marcas.some((x) => Number.isNaN(x.quando.getTime()))) return;

  const caixa = h('div', { class: 'contagem' });
  raiz.append(caixa);

  function desenhar() {
    const agora = Date.now();
    // Uma hora depois da apuração começar o assunto é o resultado, não a espera.
    if (agora > marcas[1].quando.getTime() + 36e5) { caixa.remove(); return false; }
    trocar(caixa, h('span', { class: 'contagem-dia' }, `2º turno · ${dia}`),
      marcas.map((x) => {
        const resta = x.quando.getTime() - agora;
        return h('span', { class: 'contagem-item' },
          h('small', {}, x.rotulo),
          resta > 0 ? h('b', {}, faltam(resta)) : h('b', { class: 'fraco' }, x.depois));
      }));
    return true;
  }

  if (!desenhar()) return;
  const relogio = setInterval(() => { if (!desenhar()) clearInterval(relogio); }, 30000);
}
