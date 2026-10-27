# Como medir esquerda e direita fora do Brasil

Anotações da pesquisa de 26/10/2026, feita antes de virar o projeto para o
mundo. Tudo aqui foi testado, não é leitura de documentação.

## O que a academia faz

Ninguém classifica **país**. Classifica-se **partido**, e a posição do país é
derivada de quem governa. Isso importa: dizer "a Hungria é de direita" é uma
inferência a partir do Fidesz, não uma medida do país.

Há duas escolas:

1. **Survey com especialistas** — pergunta-se a cientistas políticos daquele
   país onde o partido está numa régua. É o método do survey brasileiro que o
   site já usa (Bolognesi, Ribeiro e Codato) e do Global Party Survey.
2. **Codificação de programa** — lê-se o programa partidário e conta-se
   quantas frases vão para cada lado. É o Manifesto Project.

O primeiro cobre mais países e capta a prática; o segundo é reproduzível mas
só existe onde há programa escrito e codificado.

## Fontes testadas

| Fonte | Cobertura | Escala | Licença | Acesso |
|---|---|---|---|---|
| **Global Party Survey 2019** | 1.043 partidos, 163 países | 0–10 | **CC0** | Harvard Dataverse, direto |
| ParlGov | 1.455 partidos, Europa + alguns | 0–10 | aberta | CSV direto |
| Manifesto Project | ~60 países | RILE | chave grátis | API fora do ar no teste |
| Wikidata P1387 | 113 de 195 países | categoria | CC0 | SPARQL |

### Global Party Survey: a melhor opção

- `V4_Scale` — esquerda/direita econômica, 0 a 10. **943 partidos** têm valor.
- `V6_Scale` — liberal/autoritário no eixo social.
- `V8_Scale` — pluralismo/populismo.

A direção é a mesma do survey brasileiro (0 = esquerda). E os valores batem:

| Partido | Global Party Survey | Bolognesi (BR) |
|---|---|---|
| PT | 2,44 | 2,97 |
| PSB | 2,97 | 4,05 |
| MDB | 6,19 | 7,01 |
| PP | 8,29 | 8,20 |
| DEM | 8,51 | 8,57 |

Dois surveys independentes chegando perto é o melhor argumento de que a régua
mede alguma coisa.

**Limites:** é de 2019, então partido criado depois não está lá (União Brasil,
PRD, Missão). E posição de partido muda com o tempo.

## O problema em aberto: juntar as bases

Os partidos vêm da Wikidata (em português), o survey está em inglês. Casando
pelo nome em inglês do partido, **94 de 208 partidos governantes (45%)**
encontram nota.

Tentei melhorar pelo Party Facts, que é um dicionário entre as bases. Ele tem
`partyfacts_id` ↔ id da página da Wikipédia, mas o id é numérico e o
cruzamento com os pageids reais deu zero no teste — falta investigar se é
outro snapshot ou se o campo mudou. Resolver isso deve levar a cobertura bem
acima de 45%.

## Recomendação

Usar o Global Party Survey para o mundo e manter o survey brasileiro para o
Brasil. São estudos diferentes: mesma régua de 0 a 10, mesma direção, mas não
se somam nem se comparam número a número. O site precisa dizer qual está
usando em cada tela.

## O que foi implementado (27/10/2026)

A recomendação acima sozinha deixava **92 de 195 países sem cor**, e entre eles
a China e a Coreia do Norte — o survey não dá nota a partido de Estado de
partido único. Ficar "sem cor" ali não é honestidade, é outro erro: ninguém
olha o mapa e entende que a China está branca porque o levantamento de 2019
não entrevistou especialistas sobre o Partido Comunista.

A faixa passou a sair de quatro fontes, em ordem, e a ficha de cada país diz
qual foi usada:

1. **P1387 da Wikidata** (*political alignment*) — a classificação do partido.
   Vem primeiro por ser editada e corrigida: o Partido Trabalhista britânico
   está no survey com 2,13, do tempo do Corbyn, e na Wikidata em
   centro-esquerda, que é o partido de hoje.
2. **Nota do survey**, onde existe. Vira faixa pelos mesmos cortes do Brasil.
3. **P1142 da Wikidata** (*political ideology*) — as correntes que o partido
   declara, média das que têm lado. É daqui que sai a China: comunismo e
   marxismo-leninismo, sem P1387. Fica **de fora, de propósito**, tudo que é
   ortogonal ao eixo — autoritarismo, totalitarismo, populismo, estatismo,
   militarismo, nacionalismo étnico. Um partido pode ser autoritário em
   qualquer ponto do espectro, e contar isso como "direita" seria trocar uma
   medida por outra sem avisar o leitor.
4. **`data/mundo-manual.json`**, com motivo escrito e link de fonte.

Resultado: **185 de 195** com categoria, dos quais 149 com faixa.

### Empate no meio do caminho

Quando a média das ideologias cai exatamente entre duas faixas, o desempate é
**para longe do centro**, não para perto. Um partido marcado como "centro" e
"centro-esquerda" dá 1,5, e arredondar pra cima faria do centro o depósito de
todo caso duvidoso. Um partido que também se descreve como centro-esquerda não
é um partido de centro.

Isso **não** explica o Partido Democrata americano, que sai como centro: ali
não há empate nenhum, a Wikidata marca o partido com um valor só, *centrism*.
Cheguei a mexer no desempate achando que era a causa, e não era — a regra "o
P1387 manda" é que leva a isso, e ela vale. Fica registrado pra não se
reinvestigar o mesmo caminho.

### "Governa sem partido" é resposta, não lacuna

São 37 países, e por cinco motivos que não se parecem: monarquia onde partido
é proibido, junta ou governo de transição, parlamento sem partidos, governo
colegiado de coalizão permanente (Suíça) e governante sem legenda num país que
tem partidos. Hachurar os cinco junto com "a Wikidata não preencheu" misturava
fato com ausência de dado. Cada um tem o motivo escrito no arquivo manual e
aparece na ficha.

E **sem filiação não quer dizer sem lado**: onde dá pra dizer por qual partido
a pessoa foi eleita, a cor é a desse partido, com a história na ficha. Putin
não tem filiação desde 2012 mas governa com a Rússia Unida, que tem maioria
constitucional na Duma; Kast renunciou ao Partido Republicano ao assumir no
Chile; de la Espriella foi eleito pelo movimento que criou na Colômbia.

### Quem manda, quando há dois chefes

Com partidos diferentes vale o chefe de **governo** — na Alemanha, o chanceler,
não o presidente. Com o mesmo partido vale o chefe de **Estado**: na China quem
manda é Xi Jinping, não o primeiro-ministro, e a regra anterior elegia o
errado.

### Os estados e províncias

Quem governa cada divisão sai do P6 da Wikidata, ligado ao desenho do mapa pelo
**código ISO 3166-2** (P300 lá, `iso_3166_2` na Natural Earth). Casar pelo
código e não pelo nome é o ponto: casamento de nome de província entre bases
erra em silêncio. São 1.205 das 4.584 divisões, cobertura quase completa nos
Estados Unidos, Alemanha, Japão, Brasil, Rússia e Índia e quase nula na África.

Só o chefe de governo da divisão entra. Chefe de Estado subnacional é quase
sempre figura cerimonial nomeada de cima, e misturar os dois faria a cor
depender de qual viesse primeiro na resposta.

### Armadilha de coleta

Consulta grande na Wikidata volta **cortada no meio** com alguma frequência: o
endpoint transmite enquanto calcula e corta o fluxo ao estourar o tempo. O erro
chega como "string sem fim" ou "faltou vírgula" numa posição diferente a cada
tentativa, o que parece dado estragado e não é. `scripts/espectro.mjs` checa se
o corpo termina em `}` antes de tentar o parse, e a consulta das divisões vai em
quatro lotes por letra inicial do código.

## O problema que continua em aberto

O Party Facts, que é o dicionário entre as bases de partidos, tem
`partyfacts_id` ↔ id da página da Wikipédia, mas o id é um número legado e o
cruzamento com os pageids atuais dá zero. Resolver isso levaria a cobertura do
**survey** (hoje 93 países) bem acima do que o casamento por nome em inglês
alcança — e o survey é a única das quatro fontes que dá um número, não uma
categoria.
