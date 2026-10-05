# PoderBR

Quadro interativo de quem ocupa o poder no Brasil: presidente, vice, ministros,
governadores e senadores. Três visões dos mesmos dados — **mapa**, **rede de
poder** (árvore radial de bolinhas) e **lista** — e uma ficha por pessoa com
posição esquerda × direita e links de investigações e notícias.

Projeto pessoal, site estático, sem servidor.

## Rodando

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

## Atualizando os dados

```bash
npm run coletar    # cargos, mapa e votações  -> public/data/brasil.json, malha.json
npm run noticias   # manchetes dos feeds RSS    -> public/data/noticias.json (acumula a cada rodada)
```

`coletar` aborta sem gravar nada se alguma contagem vier errada (27 UFs, 27
governadores, ~81 senadores, 30+ ministros). É de propósito: governadores vêm
de uma tabela da Wikipédia, e se o formato dela mudar o parser quebra.

| Dado | Fonte |
|---|---|
| Senadores e votações | Dados Abertos do Senado |
| Ministros | página oficial do Planalto (partido e foto: Wikipédia, quando é a mesma pessoa) |
| Governadores | Wikipédia em português |
| Mapa e UFs | IBGE |
| Presidente e vice | `data/manual.json` |
| Posição dos partidos | `data/partidos.json` |
| Notícias | feeds RSS dos veículos (G1, Folha, Estadão, Agência Brasil, Poder360 e outros) |

## O que editar à mão

- `data/manual.json` — presidente e vice (muda na posse) e `partidos`, pra
  preencher o partido de ministro que nenhuma fonte informa.
- `data/partidos.json` — a régua esquerda × direita de cada partido. **Os
  valores precisam ser conferidos com o artigo citado no arquivo antes de
  publicar.**

## Cuidados

- "Esquerda × direita" não tem medida oficial. O site mostra a posição do
  *partido* e, pra senadores, com quem a pessoa votou quando PT e PL
  divergiram — e diz qual é qual.
- A seção de investigações só reúne links, por busca automática pelo nome.
  Erra (homônimo, simples citação) e não afirma nada sobre ninguém. O aviso na
  ficha não é enfeite: não tire.

## Publicando

`npm run build` gera `dist/`, que pode ir pra qualquer hospedagem estática.
`.github/workflows/atualizar.yml` recoleta os dados todo dia e publica no
GitHub Pages (ative em *Settings → Pages → Source: GitHub Actions*).
