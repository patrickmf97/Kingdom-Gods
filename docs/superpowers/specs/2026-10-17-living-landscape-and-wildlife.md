# Alpha 0.9: paisagem viva e animais

Melhorar a vegetação e incluir fauna reconhecível, com comportamento e interações reais, preservando o estilo 3D, os caminhos e a campanha existente.

- Árvores com copas e ramos variados; tufos de grama, arbustos, flores e vegetação de margem instanciados. Vento suave na apresentação, sem deslocar os troncos físicos. Conservar as coordenadas das árvores, os acessos e os 55 recursos existentes.
- 22 animais autorais: quatro galinhas, três ovelhas, duas vacas e um cão em Valeverde; quatro cervos, seis coelhos e duas raposas nos Ermos. Modelos distintos, animações de caminhada, pasto e descanso.
- Simulação usa navegação compartilhada, habitats limitados, horários e reação à proximidade. Animais não bloqueiam o apóstolo. A pausa congela o comportamento; não há avanço offline.
- Observar registra o encontro; alimentar os animais compatíveis consome comida real, no máximo uma vez por animal/dia, e altera confiança/medo. Posições, confiança e alimentação persistem. Não incluir reprodução, abate ou novas mercadorias nesta etapa.
- Save v6 acrescenta apenas `wildlife`; validar v5 antes de migrar e preservar todos os campos anteriores. Formatos v1–v4 continuam migrando. Renderização 2D também representa os animais e mantém interações.
- Publicar no mesmo endereço após regressões, navegação, migração e QA visual/mobile.

## Contrato entre módulos

`types.ts`: AnimalSpecies = chicken|sheep|cow|dog|deer|rabbit|fox; AnimalBehavior = idle|walk|graze|rest|flee|approach. AnimalState: id, species, zone, x, y, facing, behavior, target (Point|null), wait (segundos), trust, fear, lastFedDay (number|null), seed (uint32). WildlifeState: animals (Record<string,AnimalState>), observed (string[]). GameState.wildlife obrigatório no v6.

`wildlife-data.ts`: ANIMAL_DEFS e animalDefinition(id), incluindo id/species/zone/name/homeX/homeY/radius/speed/domestic/feed (ItemId|null). `wildlife.ts`: createWildlifeState(day), updateWildlife(state,dt), animalsForZone(state,zone), animalDialog(state,id), executeWildlifeAction(state,action,hooks).

`three/wildlife.ts`: createWildlifeLayer() -> {group, update(state,zone,timeSeconds), dispose()}; grupos dos animais usam userData.animalId. Apresentação não modifica a simulação. Modelos e recursos pertencem à camada.
