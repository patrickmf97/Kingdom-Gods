# Kingdom Gods alpha 0.12 — presença, paisagem e tempestades

## Intenção

O usuário quer personagens, materiais, formas e efeitos mais profissionais, mais moradores/viajantes/comerciantes, tempestades com raios e dano, caminhos coerentes, lagos naturais, céu vivo e névoa nas bordas. A sessão já autoriza implementar e publicar no mesmo Site; multiplayer permanece por último. Preservar controles por toque, identidade medieval 3D, morte/sucessão e campanhas existentes.

## Entregas

1. Personagens articulados mais expressivos, com rostos/cabelos/roupas e silhuetas de profissão. Metadados opcionais de papel/sexo/idade variam o visual sem alterar o personagem salvo. Mesclar partes estáticas por articulação/cor para reduzir chamadas; alvo <=12 chamadas visíveis por humano e <=2.400 triângulos. Conservar animação, espada/ferramenta, colisão pelos pés, seleção e descarte por ator.
2. Expandir de seis para dezesseis NPCs autorais: seis residentes adicionais (padeira, moleiro, estalajadeira, carregador, guarda-florestal, pescador) e quatro visitantes (duas caravanas, peregrina, mensageiro). Rotas físicas entre vila, acampamento e serra, pausas em destinos, repouso e procura de abrigo durante tempestade. Não teletransportar nem avançar viagens offline. Mantêm relações e memórias; visitantes não são candidatos a casamento/contratação/companhia da cripta. Comerciantes possuem estoque e caixa finitos persistidos; negociação presencial movimenta moeda/itens uma vez, sem reposição diária grátis. Padeira/moleiro assumem capacidades existentes quando disponíveis; não duplicam produção.
3. Lago irregular totalmente contido no envelope antigo (2280,1430)–(2640,1630), com um polígono compartilhado por água, colisões, margens, vegetação e mapa. Pontos antigos de acesso e árvores não mudam. Corrigir estradas pintadas que cruzam sólidos. Congelar estradas originais para geração histórica da floresta e validação/habitats da fauna: a mudança visual não reposiciona árvores nem invalida campanhas.
4. Céu com sol/lua/estrelas e movimento sutil, horizonte e neblina de borda que escondam o corte do chão. Iluminação e contraste devem permitir caminhar à noite. Sem novas colisões de montanhas/névoa, sem interceptar seleção. Até cinco chamadas extras de paisagem/céu além do orçamento anterior; geometrias/lotes limitados e descarte idempotente.
5. Variante climática `storm`, derivada do calendário como o clima atual: céu carregado, chuva e raios. Raio local anuncia um ponto fixo por 3,5 segundos de simulação; impacto em raio de 64 pixels causa 28 de dano ao apóstolo exposto. Nenhum dano em interiores, mina ou cripta, durante pausa/tela inicial/offline. Primeiro evento tem espera de 12 segundos; eventos seguintes espaçados de 36 a 50 segundos. O alvo é escolhido uma vez perto do apóstolo (120–320px), não persegue movimento após o aviso, e deve ser terreno válido. Esquiva e afastamento permitem escapar. Recibo/contagem e aviso ativo persistem para não rerrolar nem repetir dano ao carregar. Descanso em abrigo cancela exposição e não inventa raios ocorridos offline.

## Contratos de estado e módulos

`GameState.version=8`, com novo `worldLife: WorldLifeState`. Tipos em types.ts:
- `TravelerState`: `{routeIndex:number; wait:number; stock:Record<ItemId,number>; gold:number}`.
- `LightningWarning`: `{id:number;zone:OutdoorZone;x:number;y:number;remaining:number}`.
- `LightningImpact`: `{id:number;zone:OutdoorZone;x:number;y:number;remaining:number}`.
- `StormState`: `{sequence:number;cooldown:number;warning:LightningWarning|null;impact:LightningImpact|null}`.
- `WorldLifeState`: `{residents:string[];travelers:Record<string,TravelerState>;storm:StormState;legacyExtension?:unknown}`.

`population.ts` define IDs/perfis/destinos; `initializePopulation(state):void` acrescenta somente novos IDs livres, necessidades e caixas com folga numérica, sem alterar os seis anteriores nem ressuscitar família/apóstolo. IDs em conflito são preservados e a nova identidade é omitida. `travelers.ts` contém cotações, comércio físico e progresso de rota; ações `traveler-buy:<npcId>:<item>` / `traveler-sell:<npcId>:<item>`.

`storms.ts`: `createStormState():StormState`, `updateStorms(state,delta,hooks)` com hooks de dano/mensagem/memória. Estado é a autoridade; apresentação Three somente lê aviso/impacto.

`three/characters.ts`: manter API existente, acrescentando metadados opcionais ao ActorAppearance (`role`, `sex`, `age`, `variant`). Root integra a assinatura visual em world3d.

`water.ts`/`landscape-paths.ts`: dados puros compartilhados, sem dependência circular entre regions/navigation/render. Módulos visuais só apresentam. Root integra mapas React às geometrias novas.

## Persistência e invariantes

Congelar validação v7 completa antes da migração v8. V1–6 continuam pelas migrações anteriores e então v7→8. Carregar não avança tempo, não negocia e não muda ouro/estoques/colheitas/67reservas/22animais existentes. Novas moedas de comerciantes respeitam a folga do total Number.MAX_SAFE_INTEGER; nenhuma moeda antiga é reduzida. Se um save v7 já contiver extensão `worldLife`, seu valor deve ser preservado em `worldLife.legacyExtension`, sem ser interpretado como estado atual. V8 malformado é rejeitado, não preenchido silenciosamente.

## Aceitação e limites

Testes de modelos/rotas/água, comércio atômico, risco/abrigo/uma só aplicação de raio, validação e continuidade histórica, suíte completa/build, revisão independente, navegador desktop/toque, pacote público e perfil antigo. Publicar no endereço existente, mantendo público. Aparência estilizada e fauna local existentes; sem multidões ilimitadas, MMO, combate novo de NPCs ou construção livre nesta etapa. Não afirmar FPS de telefone físico com SwiftShader.
