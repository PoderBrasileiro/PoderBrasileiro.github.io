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

Onde não houver nota, não inventar: deixar sem cor e dizer que não há.
