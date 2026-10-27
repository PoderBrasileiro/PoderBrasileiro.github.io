# Global Power Line

Onde cada país está entre a esquerda e a direita, segundo o partido de quem
governa.

**O mundo é o mapa principal.** Arrasta, aproxima com a roda ou pelos atalhos
de região, e dois cliques num país abrem as divisões internas dele — estados,
províncias, departamentos. A cor é a faixa do partido que governa; quem governa
sem partido tem cor própria, porque isso é informação e não dado faltando.

**O Brasil por dentro**, em segundo plano: presidente, vice, ministros,
ministros do STF, governadores, senadores, deputados federais, estaduais e
prefeitos, com uma ficha por pessoa, posição esquerda × direita, votos em
plenário e em PECs e links de investigações e notícias.

Projeto pessoal, site estático, sem servidor.

## Rodando

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

## Atualizando os dados

```bash
npm run mundo      # quem governa os 195 países -> mundo.json e mundo-malha.json
npm run coletar    # cargos, mapa e votações  -> public/data/brasil.json, malha.json
npm run eleicao    # transição 2027: resultado de 2026 x quem está no cargo -> eleicao2026.json
npm run pecs       # PECs: estágio e voto nominal de cada parlamentar -> pecs.json
npm run prefeitos  # prefeitos eleitos em 2024 e malhas municipais (minutos; rodar só quando precisar)
npm run noticias   # manchetes dos feeds RSS    -> public/data/noticias.json (acumula a cada rodada)
```

Fora da rodada diária, porque fronteira interna não muda de mês pra mês:

```bash
npm run subdivisoes   # estados e províncias de 241 países -> public/data/div/<ISO2>.json
```

Ele baixa 40 MB da Natural Earth pra `tmp/`, fatia por país e grava TopoJSON
pequeno, que fica commitado. Rodar de novo só se a fonte mudar.

`coletar` aborta sem gravar nada se alguma contagem vier errada (27 UFs, 27
governadores, ~81 senadores, 30+ ministros). É de propósito: governadores vêm
de uma tabela da Wikipédia, e se o formato dela mudar o parser quebra.

| Dado | Fonte |
|---|---|
| Senadores e votações | Dados Abertos do Senado |
| Deputados federais | Dados Abertos da Câmara |
| Ministros do STF | Wikipédia em português (o site do STF recusa acesso automático) |
| Ministros | página oficial do Planalto (partido e foto: Wikipédia, quando é a mesma pessoa) |
| Governadores | Wikipédia em português |
| Prefeitos | resultado oficial do TSE, eleição de 2024 (eleitos, não necessariamente os atuais) |
| Transição 2027 (⇄) | resultado oficial do TSE da eleição de 2026, casado por nome com os ocupantes atuais |
| PECs (estágio e votos) | Dados Abertos da Câmara e do Senado |
| Eleitos de 2026 que ainda não assumiram | resultado oficial do TSE (os que não ocupam cargo hoje) |
| Quem governa cada país | Wikidata |
| Faixa do partido no mundo | Wikidata (classificação e correntes declaradas), Global Party Survey 2019 e `data/mundo-manual.json` |
| Mapa-múndi | Natural Earth, via world-atlas |
| Divisões internas dos países | Natural Earth 1:10m admin-1 (domínio público) |
| Mapa e UFs | IBGE |
| Presidente e vice | `data/manual.json` |
| Posição dos partidos | `data/partidos.json` |
| Notícias | feeds RSS dos veículos (G1, Folha, Estadão, Agência Brasil, Poder360 e outros) |

## O que editar à mão

- `data/manual.json` — presidente e vice (muda na posse) e `partidos`, pra
  preencher o partido de ministro que nenhuma fonte informa.
- `data/partidos.json` — a régua esquerda × direita de cada partido. Os valores
  foram conferidos com a Tabela 1 do artigo citado no arquivo.

## Cuidados

- "Esquerda × direita" não tem medida oficial. O site mostra a posição do
  *partido* e, pra senadores, com quem a pessoa votou quando PT e PL
  divergiram — e diz qual é qual.
- A seção de investigações só reúne links, por busca automática pelo nome.
  Erra (homônimo, simples citação) e não afirma nada sobre ninguém. O aviso na
  ficha não é enfeite: não tire.

## Postagem

```bash
npm run relatorio   # junta a pauta do dia em PAUTA.md, pra copiar e colar
npm run postar      # publica sozinho, onde houver chave
```

O Bluesky tem API aberta: basta `BSKY_USUARIO` e `BSKY_SENHA` (uma senha de
aplicativo, nunca a da conta) nos segredos do repositório. O X cobra por
crédito e devolve 402 sem saldo — por isso existe a pauta, que não publica
nada e deixa tudo pronto pra postar à mão.

Cada canal tem a própria lista de itens já feitos, então o mesmo post pode
sair no Bluesky, no X e na pauta sem repetir dentro de cada um.

## Contador de quem está vendo (opcional)

O site é estático e não sabe contar ninguém: isso precisa de um servidor. O
`worker/` é um Cloudflare Worker que faz só isso, no plano gratuito.

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

O `deploy` imprime a URL (algo como
`https://poderbr-contador.SEU-USUARIO.workers.dev`). Cole essa URL em
`ENDERECO`, no começo de `src/presenca.js`. Com o campo vazio o bloco não
aparece e o resto do site funciona igual.

Cada aba manda um sinal a cada 25 segundos com um identificador sorteado na
hora. Não grava cookie, não guarda IP e não liga uma visita à outra — o
contador sabe quantas abas estão abertas, e nada além disso.

## Publicando

`npm run build` gera `dist/`, que pode ir pra qualquer hospedagem estática.
`.github/workflows/atualizar.yml` recoleta os dados todo dia e publica no
GitHub Pages (ative em *Settings → Pages → Source: GitHub Actions*).
