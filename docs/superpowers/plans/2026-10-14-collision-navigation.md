# Collision and Navigation Implementation Plan

> Execução autorizada pelo pedido do usuário; tarefas independentes delegadas e integração realizada nesta sessão.

**Goal:** Corrigir colisões e adicionar navegação física pelo mundo e mapa.

**Architecture:** `navigation.ts` compartilha geometria, movimento por subpassos e busca limitada de caminhos entre simulação e cena. Rotas não são persistidas; posições válidas e toda a campanha continuam no snapshot v2.

**Tech Stack:** TypeScript, Phaser 3, React, Node test/tsx, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-10-14-collision-navigation-design.md`

## Global Constraints

- Raio de pé: 9 pixels; subpassos de colisão de até 4 pixels.
- Nenhuma troca de apóstolo, reset ou benefício econômico na recuperação de posição.
- Publicação no mesmo Site, mantendo acesso público e schema v2.

## Review Focus

- Esquiva atravessando o balcão apesar de destinos livres: teste de movimento varrido.
- Cerca da fazenda bloqueando a entrada correta: testar entrada e trilhas internas.
- NPCs atravessando a casa de Mira: verificar cada posição durante a rotina.
- Saves antigos em paredes e moedas intactas: carregar e comparar campanha.
- Rotas atravessando rio ou travadas: testar segmentos, ponte, destinos e cancelamento por joystick.

## Task 1: Geometria compartilhada

- [x] Criar testes que falham para paredes, cerca, ponte, raio, esquiva, deslizamento e recuperação.
- [x] Implementar `isWalkable`, `moveWithCollisions`, `nearestWalkable`, `findPath`, `objectApproach` em `src/navigation.ts`.
- [x] Verificar caminhos e todos os destinos de interação sem segmentos inválidos.

## Task 2: Autoridade de movimento

- [x] Reproduzir passagem por paredes e rota de NPC em `tests/movement.test.ts` antes de corrigir.
- [x] Usar colisões em `GameStore.move`, NPCs, companheiro e retirada autônoma; recuperar posições no carregamento.
- [x] Limitar busca a mudanças de destinos e distribuir encontros noturnos.
- [x] Verificar que progressão e salvamentos continuam compatíveis.

## Task 3: Arte e navegação física

- [x] Separar terreno, galpão e cercas da fazenda em `art.ts`/`world.ts`.
- [x] Substituir colisões locais por rotas compartilhadas e desenhar percurso discreto.
- [x] Reduzir rótulos sobrepostos sem esconder encontros próximos.
- [x] Integrar botão e percurso no mapa React; corrigir rio e ponte.

## Task 4: Validação e publicação

- [x] Executar suite completa e build TypeScript/Vite.
- [x] Verificar teclado, esquiva, toque/joystick, rotas e fazenda em Chromium desktop/tablet/celular.
- [x] Revisar código independentemente, documentar limites e atualizar alpha 0.3.
- [ ] Enviar fonte exata, salvar versão, publicar e verificar link público e continuidade da campanha anterior. O resultado da publicação será confirmado pela ferramenta Sites e entregue na conversa.
