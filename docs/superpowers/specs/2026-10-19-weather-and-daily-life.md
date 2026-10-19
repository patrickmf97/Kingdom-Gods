# Kingdom Gods alpha 0.11 — clima e cotidiano

## Intenção e referências

O usuário pediu melhorar sistemas, gráficos e outros aspectos usando jogos do gênero como referência. A sessão já autoriza implementar e publicar no mesmo Site, com multiplayer por último. Esta etapa evolui o jogo existente: escolhas de trabalho/abrigo conforme o tempo, cenário com contato e profundidade, descanso previsível e produção artesanal mais prática. Mantém 3D, toque, identidade própria e campanhas.

Referências verificadas: Stardew Valley (calendário e cotidiano), Valheim (3D estilizado valorizado por luz e materiais; preparação), Medieval Dynasty (produção, ferramentas e economia). Fontes: https://www.stardewvalley.net/about/ ; https://wiki.stardewvalley.net/Seasons ; https://www.valheimgame.com/faq/ ; https://www.toplitz-productions.com/medieval-dynasty.html . Adotamos princípios, com código e assets próprios.

## Recorte e contratos

1. Clima puro derivado do calendário: céu limpo, nublado, chuva e neblina, com distribuição sazonal; dia 1 limpo. Mesmo dia/região/horário sempre produz o mesmo perfil, sem sorteio ao abrir painéis ou carregar campanha. Previsão de hoje e dois dias seguintes. Só exteriores recebem precipitação. Sem dano climático ou nova barra de necessidade.
2. Chuva reduz o avanço da coleta externa a 80%; duração nominal salva permanece igual. Minas e interiores mantêm 100%. Reposição regional externa perde no máximo uma unidade de capacidade por produto em dia de chuva; oficinas internas mantêm capacidade. Estoque, insumos, trabalhadores, salários, capital limitado e reservas financeiras continuam determinantes. Preços respondem ao estoque real, sem taxa climática artificial. Diário registra a limitação.
3. Aparência: sombras de contato instanciadas e não interativas para árvores/prédios/recursos, variação ampla do solo, luz quente ao nascer/pôr do sol e noite azul. Chuva leve, nuvens e neblina com orçamento fixo, sem sombras caras ou pós-processamento. Pausa e diálogos congelam animação. Brumavale recebe as partículas externas já existentes. Vegetação e colisões preservam posições.
4. Descanso unificado entre estalagem, acampamento e abrigo de terreno, usando a mesma passagem de calendário/viradas diárias. Prévia informa duração, chegada, viradas e consumo diário de provisões. Estalagem transfere oito coroas ao caixa mercantil e registra pagamento uma vez. Morte durante a virada interrompe cura. Cama da casa própria dá uso ao interior: descanso oito horas, sem taxa, somente na estação doméstica, construída e com condição >=25. Não cura após morte, não ignora alimentação/tributos/salários/prazos.
5. Receitas existentes admitem lotes de 1 a 10, com prévia e débito integral validado pela autoridade: estação, vida, ingredientes, energia e inteiros. Ação antiga sem quantidade equivale a um. Nenhuma produção remota ou parcial silenciosa. Quantidade máxima respeita insumos/energia; o jogador escolhe o lote na oficina.

## APIs e propriedade de arquivos

- `weather.ts`: `weatherFor(day, minutes, zone): WeatherSnapshot`; campos `kind` (`clear|cloudy|rain|fog`), `label`, `description`, `temperature`, `precipitation`, `cloudiness`, `wind`, `gatheringRate`, `supplyPenalty`, `outdoors`. `weatherForecast(day, zone?, count?): WeatherSnapshot[]` inclui `day`; default count3, vila. Sem dependência de economia/simulação/Three/React.
- `frontier.ts`, `economy.ts`: usam clima, validam lotes e preservam fluxos monetários.
- `three/landscape-finish.ts`, `three/weather.ts` e módulos visuais existentes: presentation-only, recursos com descarte idempotente, sem alterar estado.
- `rest.ts`: prévia pura; `simulation.ts` centraliza avanço e ações de descanso. A cama é a estação `home-bed` em (630,350) na moradia, com alcance de 110, ao lado da cama física existente; a escrivaninha continua administrativa.
- `WeatherPanel.tsx`, App/Panels/CSS: previsão, consequências legíveis, lotes e estado doméstico. Sem botões decorativos.

## Compatibilidade e limites

Save continua v7, sem campos climáticos persistidos. Campos, 67 reservas, 22 animais, NPCs, interiores e colheitas anteriores não são alterados ao carregar. Nenhuma dependência externa nova. Sombras/solo até três chamadas extras, <=1024 instâncias e textura <=64²; chuva/nuvens em lotes fixos (até três chamadas extras e <=384 partículas), sem novas luzes. Modelo estilizado, sem cópia de assets comerciais. Sem multiplayer, irrigação/genética/política nova nesta etapa.

## Aceitação

Testes de regra e pacote; fluxos reais no navegador para clima/coleta, lotes e moedas, descanso atravessando madrugada, casa/abrigo e controles mobile. Revisão independente, atualização publicada no mesmo endereço público e campanha antiga preservada. Medição em SwiftShader/toque emulado não será apresentada como FPS de telefone físico.
