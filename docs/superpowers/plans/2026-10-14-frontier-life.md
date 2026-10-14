# Frontier and Life Implementation Plan

> Execução autorizada pelo usuário; tarefas isoladas por arquivos em agentes paralelos, integração e publicação pela raiz.

**Goal:** Entregar mundo externo e mina jogáveis, com ofícios, campanha transferível e vida familiar aprofundada.

**Architecture:** `regions.ts` centraliza geografia e conexões; `navigation.ts` compartilha colisões. `frontier.ts` e `life.ts` calculam estados persistentes separados, integrados à autoridade `GameStore`. Persistência v3 mantém migrações antigas e fornece intercâmbio validado.

**Tech Stack:** TypeScript, Phaser 3, React, IndexedDB, Node/tsx.

**Spec:** `docs/superpowers/specs/2026-10-14-frontier-life-design.md`

## Global Constraints

- Multiplayer por último; esta entrega permanece local e não requer serviço pago.
- Novo mundo externo 3072×2304; mina 1280×1120; região ativa instanciada.
- Pés com raio 9, colisão por subpassos até 4 pixels, caminhos sem cortar paredes.
- Progresso por atributos/competências, nunca nível global.
- Migração v1/v2→v3 sem perda; moeda inteira segura e recompensa reservada/paga uma vez.

## Review Focus

- Portal solicitado à distância: nenhuma viagem sem presença física.
- Interromper trabalho ou recarregar antes da conclusão: nenhum recurso duplicado.
- Orçamento já comprometido com abastecimento: novos pedidos e refeições respeitam reservas.
- Tutor morto, herdeiro estranho ou menor: sucessão e contratos continuam restritos.
- Importação inválida ou falha de gravação: campanha atual intacta e backup recuperável.

## 1. Contratos e mapas

- [x] Fixar tipos de região, ferramentas, trabalhos, necessidades e educação.
- [x] Criar testes de portais, paredes e destinos alcançáveis antes da navegação nova.
- [x] Implementar `regions.ts` e ampliar `navigation.ts`, preservando colisões existentes.
- [x] Gerar terrenos e estruturas alinhados à geografia, com culling pela câmera.

## 2. Trabalho e oportunidades

- [x] Testar estoque de ferramentas, desgaste, trabalho parcial, cancelamento e extração finita.
- [x] Implementar `createFrontierState`, ações, atualização de trabalho, descoberta e ciclos diários.
- [x] Testar reservas, entregas, resolução independente e pagamentos únicos.
- [x] Integrar movimento, portais e ações na simulação; exibir progresso no mundo e HUD.

## 3. Necessidades e família

- [x] Testar comida/estoque/moeda, tutela válida e lições presenciais limitadas.
- [x] Implementar módulo `life.ts`, destinos de NPCs, registros e educação.
- [x] Integrar nascimento, casamento, morte e sucessão sem alterar regra obrigatória.
- [x] Integrar painéis funcionais de necessidades, educação, regência e histórico.

## 4. Campanhas portáveis

- [x] Testar migração v1/v2 e validade estrita v3, incluindo compromissos e recursos.
- [x] Implementar exportação/importação JSON validada e proteção do backup.
- [x] Integrar download, seleção de arquivo e revisão da substituição no aplicativo.

## 5. Entrega

- [x] Suite completa e build TypeScript/Vite; revisão independente de integração.
- [x] Fluxos reais no navegador desktop e mobile, de estrada a mina e volta.
- [ ] Validar retomada da campanha anterior no endereço público, após publicar.
- [ ] Publicar a fonte exata e verificar a entrega no Site atual. Documentação e arquivo estão preparados; o resultado é confirmado pela ferramenta Sites na conversa.
