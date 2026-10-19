# Alpha 0.10 — interiores e mundo vivo

O usuário autorizou corrigir ofertas anunciadas sem caixa para pagamento, revisar movimento noturno de moradores/animais, retirar o modo 2D, tornar todos os edifícios acessíveis com interiores 3D detalhados e continuar a expansão fora da vila. Preservar estilo, controles, calendário, bens, família, fauna e atividades anteriores; publicar no mesmo Site público. Multiplayer permanece posterior.

## Contratos

- Apenas Three.js. Falha de WebGL mostra recuperação/repetição com campanha preservada, sem carregar Phaser nem oferecer botão 2D.
- Tipos: OutdoorZone=village|wilderness|highlands. InteriorZone=orphanage|inn-room|forge-room|mill-room|bakery-room|mira-room|farm-store-room|farmhouse-room|oak-room|stone-room|camp-room|ranger-room|chapel-room. Zone inclui também mine|dungeon. Npc.zone obrigatório no v7.
- Interiores instanciados: 900×900, spawn (450,730), saída (450,790). Registro autoral associa porta exterior, propriedade requerida, estação, móveis e colisões. Nenhuma troca de personagem nem teletransporte remoto: entrar exige a porta correta e sair retorna à sua frente.
- interiors.ts exporta INTERIORS, interiorForZone(zone), entranceForObject(zone,id), interiorRegion(def), interiorAllowed(state,def). InteriorDefinition contém zone,name,theme,entrance:{zone,objectId,x,y},spawn,exit,service?:string,stations:WorldObject[],furniture:InteriorFurniture[]. Furniture: kind,x,y,w,d,rotation?:number,blocking?:boolean,color?:number. Tipos dos móveis incluem bed/table/chair/shelf/counter/oven/anvil/barrel/crate/sack/rug/desk/stove/altar/bench/wardrobe/plant/basin/lantern/books/wheel/grain.
- Móveis físicos e navegação usam o mesmo registro. Reservar saída, corredor central e aproximações de todas as estações. Orfanato preserva (400,290) da matrona e o fluxo da introdução.
- Estações com IDs antigos (market/forge/mill/bakery/property/wild-camp/estate IDs) funcionam dentro das salas e conservam as operações e custos atuais. Entradas dinâmicas só aparecem quando a construção existe; terrenos mantêm direito e tributos. Poço, pontes e cercas são estruturas abertas, sem sala fictícia.
- NPCs possuem região persistente. Rotinas usam portas para trabalho/descanso, navegação compartilhada, destinos seguros e recuperação de referências de acompanhante. A noite é descanso coerente, sem sobreposição de todos em um ponto nem loops de fuga/oscilação. Fauna preserva seus 22 IDs e populações.
- Terras Altas de Brumavale: nova região 2560×1920 ligada aos Ermos por portal físico. Alojamento dos guardas em (900,680), capela em (1750,1000), acessos livres, paisagem montanhosa, trilhas e 12 recursos finitos (3 madeira/pedra/erva/minério). highlands.ts exporta HIGHLANDS_REGION, HIGHLAND_RESOURCE_NODES, WILDERNESS_HIGHLANDS_PORTAL e HIGHLAND_ROADS. O portal dos Ermos usa origem (2960,580), reservada a leste do habitat histórico dos coelhos, e chegada nas Terras Altas (360,1640).
- Save v7 valida NPC.zone, novas regiões e catálogo expandido. v6 histórico mantém contrato anterior de 55 recursos e 22 animais; migrar adiciona NPC.zone e as 12 novas reservas após validar a campanha antiga, sem alterar o restante nem avançar o tempo. v1–v5 seguem cadeia histórica.

## Economia e horários

Investigar e reproduzir antes de corrigir. O quadro não deve anunciar trabalho impossível de financiar. Reservas e tesouro devem ser explicados, aceitação deve garantir pagamento, entrega paga uma vez e nenhuma correção cria dinheiro sem origem. Rotina noturna deve ser legível e segura; congelar animação de locomoção quando o animal não sai do lugar.

## Validação

Testes de fluxo de entrada/saída por todas as portas, estações e propriedade; acesso a móveis sem atravessá-los; migração com moedas/estoques/família/fauna preservados; reserva e entrega de trabalho com pouco caixa; horários 06/07/18/20/22 e retorno; ferramentas/extração; apenas um renderer/canvas; WebGL indisponível com repetição; desktop e toque; publicar e conferir campanha anterior na mesma origem.
