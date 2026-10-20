# Living World and Storms Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Independent file ownership permits concurrent components; root integrates dependencies.

**Goal:** Entregar alpha0.12 com personagens ricos, população viajante, paisagem coerente e tempestades perigosas.
**Architecture:** Dados autorais e estado v8 na autoridade local; caminhos/água compartilhados; apresentação Three e UI consomem estado sem inventar resultados.
**Tech Stack:** TypeScript/React19/Three/Vite/IndexedDB, sem dependências externas novas.
**Spec:** docs/superpowers/specs/2026-10-20-living-world-and-storms.md

## Global Constraints

v8 com v7 congelado; mesmos67recursos/22animais; preservar NPCs/valores antigos. Dez novos NPCs, dois caixas finitos, raio anunciado3,5s/64px/28dano, primeiro12s/depois36–50s, abrigo protegido. Personagem<=12draws/2400tri; céu/paisagem<=5chamadas extras. Multiplayer por último. Mesma origem pública.

## Review Focus

- IDs/extensões conflitantes e caixas próximos de MAX_SAFE_INTEGER na migração.
- Estradas novas não alteram floresta/habitats históricos nem bloqueiam portas.
- Caravana remota/sem estoque/sem moedas não transfere nada parcialmente.
- Aviso salvo/recarregado não muda alvo nem aplica dano duas vezes; pausa/abrigo impedem dano.
- Mais atores não vazam materiais nem aumentam chamadas por peça; efeitos respeitam relógio e toque.

### Task1: Personagens
Files: three/characters.ts + testes; root integra world3d/creator.
- [x] Testes de identidade/silhueta/pés/animação/equipamento/descarte/orçamento; observar falha antes de implementar.
- [x] Modelos mesclados articulados, materiais e variações por papel, sem copiar assets.
- [x] Verificar modelos e capturas próximas/à distância.

### Task2: Paisagem e navegação
Files: water.ts, landscape-paths.ts, regions/navigation/wildlife and three environment/horizon/vegetation; root integra mapa React.
- [x] Testes densos das estradas e polígonos/portas/recursos/habitats antigos.
- [x] Água/margens comuns, corrigir desenho das estradas sem mover floresta histórica.
- [x] Céu/horizonte/borda com névoa, animação e descarte limitados.

### Task3: População e caravanas
Files: population.ts/travelers.ts/npc-routines.ts/life.ts; root integra simulation/economy/UI.
- [x] Testes de adição idempotente/colisões de ID/rotas físicas/abrigo e caixas finitos.
- [x] Implementar dez NPCs, relações permitidas e comércio presencial atômico.
- [x] Rotas e pausas caminham nos mapas certos; não repor estoques gratuitamente.

### Task4: Tempestades e integração
Files: types.ts/storms.ts/simulation.ts/three weather/lightning/world3d, App/WeatherPanel/TravelerPanel/Panels.
- [x] Testes de aviso fixo, dano único, abrigo, pausa, sucessão e importação.
- [x] Integrar storm climático, efeitos, dano/memória e painéis físicos de comerciantes.
- [x] Integrar profissões, calendário, rotas, população e mapas, mantendo ações antigas.

### Task5: Persistência v8
Files: persistence.ts + testes/fixtures/historical-state; root ajusta versões/regressões conforme necessário.
- [x] Congelar contrato v7; testar v1–7 antigos e v8 inválido.
- [x] Migrar acrescentando estado novo sem avançar tempo ou mudar campos existentes; arquivar extensão conflitante.
- [x] Preservar raio ativo/recibo e estoques após salvar/recarregar.

### Task6: Entrega
- [x] Suíte completa/build/diffcheck e revisão independente; corrigir falhas reais.
- [x] Navegador: personagens, rotas/água/sky, viajantes/comércio, raio/abrigo, toque e continuidade.
- [x] Documentar fatos/limites, versão0.12.0.

Publicação após congelamento da fonte: enviar o commit verificado, construir seu artefato correspondente e publicar o Site existente, conferindo pacote e campanha anterior na mesma origem. O recibo operacional posterior fica fora da árvore de fontes.
