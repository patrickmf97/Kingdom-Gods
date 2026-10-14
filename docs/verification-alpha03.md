# Verificação — alpha 0.3

Data: 14 de outubro de 2026. A campanha continua usando snapshots v2, com migração de v1 preservada.

## Regras e build

- `npm test`: 78 testes passaram, sem falhas. Incluem as 55 regras anteriores e regressões para esquiva através do mercado, deslizamento em paredes, cercas e portão, moradia, ponte nos dois sentidos, cripta, mural, jardim, rotinas, rotas e recuperação de posição.
- `npm run build`: TypeScript e Vite passaram. O bundle principal tem aproximadamente 1,93 MB (481 KB gzip), principalmente devido ao Phaser. O aviso de tamanho continua; não foi estabelecida uma garantia de 60 FPS em aparelhos físicos.
- Revisão independente: três omissões de colisão encontradas na cripta, jardim e mural foram reproduzidas, corrigidas e verificadas novamente.

## Navegador

Chromium com a fonte final congelada: 22 verificações passaram em 1280×800, 844×390 e 390×844. Teclado, esquiva e joystick bloqueiam estruturas; o portão permanece atravessável; personagens são visíveis sobre o cultivo; rio bloqueia e ponte permite passagem. Rotas do mapa deslocam fisicamente e são canceladas por teclado ou joystick. NPCs permanecem em pontos caminháveis. Nenhum erro de execução ou overflow horizontal foi observado.

O build estático foi testado separadamente, sem importar a simulação para conduzir o fluxo: criação → pertences → saída a pé → rota pelo mapa → mercado → compra de pão → salvamento → recarregamento. A compra aumentou o inventário de 3 para 4 pães e reduziu ouro de 48 para 41; ambos foram preservados após retomar a campanha.

Uma campanha local com posição antiga dentro do balcão foi salva no IndexedDB e recarregada. A posição foi recuperada para perto da parede, mantendo ouro, inventário, atributos, competências, memórias, família, propriedade, economia e calendário. Também foi capturada uma campanha sintética da publicação anterior para verificar continuidade no mesmo endereço após a atualização.

## Limites

Uma vila e uma dungeon; geometria autoral aproximada às bases dos sprites; caminhos por grade de 24 pixels, simplificados apenas em segmentos seguros. Personagens respeitam os obstáculos estáticos, mas não possuem bloqueio físico mútuo. NPCs usam agendas e regras locais, não modelos de linguagem. A versão continua individual, salva neste navegador e sem simulação offline, contas ou multiplayer/PvP.
