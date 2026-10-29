# KINGDOM GODS · alpha 0.13 · 3D

RPG sandbox medieval **3D, local e jogável**, em português, com mundo externo, mineração pacífica e legado familiar. Multiplayer permanece para a última etapa; esta versão não usa contas nem depende de serviços pagos.

## Executar

```sh
npm ci
npm run dev
```

`npm test` verifica as regras; `npm run build` valida TypeScript e gera `dist/`, servido por HTTP estático. O jogo local usa salvamento no navegador.

## Jogar no GitHub Pages

O repositório publica automaticamente em [patrickmf97.github.io/Kingdom-Gods](https://patrickmf97.github.io/Kingdom-Gods/) quando há um push para `main`. O fluxo executa os testes, cria o build com o caminho do projeto e publica `dist/`. A primeira publicação fica disponível depois que a execução **Build and deploy to GitHub Pages** terminar em verde na aba **Actions**. Cada navegador/dispositivo possui seu próprio salvamento; use **Exportar campanha** para transferir um arquivo.

## Começar e explorar

Crie seu apóstolo de 16 anos, escolha uma bênção e receba os pertences de Elara. Caminhe ao portão sul do orfanato. Depois, todas as oportunidades são opcionais.

- WASD ou setas: movimento. Clique/toque no mundo ou escolha **Caminhar até aqui** no mapa para seguir uma rota segura. Movimento manual e ações interrompem a rota.
- E: interagir; Espaço ou botão direito: ataque; Shift: esquiva.
- I: inventário; C: atributos; J: diário; R: relações; F: família; P: propriedade; M: mapa.
- 1: equipar espada; 2: comer pão; 3: usar erva. Escape fecha painéis ou pausa.
- No celular, use joystick, interação, ataque e esquiva. O guia fica no botão de ajustes do cabeçalho.
- Painéis e diálogos pausam a simulação. A página fechada não faz o tempo avançar.

Compre uma **picareta por 28 coroas** no mercado ou na forja. O mapa de Valeverde mostra a **Trilha para os Ermos de Alvor**, ao sudeste. Caminhe até a placa e siga pela estrada. Nos Ermos, localize a Mina do Ferro Antigo, ao nordeste. Caminhe até a entrada e interaja para entrar. O mapa da mina mostra as galerias e os veios. Retorne pela saída e pela estrada de Valeverde quando quiser.

## Interface repaginada

- **Mundo em tela cheia:** o cabeçalho, as barras laterais e o rodapé deram lugar a um HUD flutuante sobre o mundo 3D. Ficha do apóstolo (vitalidade, energia, coroas), objetivos recolhíveis, região atual, relógio com mostrador dia/noite, clima e minimapa ocupam os cantos.
- **Barra de ações:** itens rápidos (1–3) e atalhos para Inventário, Atributos, Diário, Relações, Linhagem, Propriedades e Mapa numa única barra inferior.
- **Menu de pausa:** Esc ou o botão de menu abre um painel com todos os menus, salvamento, retorno à tela inicial e a última memória do apóstolo.
- **Visual:** vidro escuro com filetes dourados no HUD, diálogos cinematográficos e códices em pergaminho emoldurado para os painéis. Tela inicial e criação do apóstolo seguem a mesma linguagem.
- **Celular:** HUD compacto em retrato e paisagem; a barra mostra itens, mochila, diário, mapa e menu entre o joystick e os botões de ação.

## Novidades da alpha 0.13

- **Personagens refinados:** fantasia estilizada com proporções mais naturais, rosto modelado com superfícies suaves, olhos e expressões discretos, mechas curvas, mãos com polegares, ombros arredondados e roupas ajustadas em camadas. Cabelos, uniformes e acessórios distinguem os ofícios; o fundador de 16 anos não recebe barba adulta.
- **Materiais:** texturas originais de tecido, pele, cabelo, couro, linho e metal, com relevo e rugosidade próprios. As cores escolhidas e salvas continuam sendo a base de cada personagem. Uma iluminação indireta suave mantém os rostos legíveis à noite e em interiores.
- **Movimento e contato:** joelhos e cotovelos articulados, passada proporcional à velocidade real, apoio dos pés no solo, respiração e movimentos discretos de cabeça/capa. Sombras suaves de contato e silhuetas projetadas aproximadas usam um único lote; não são sombras volumétricas nem mapas de profundidade.
- **Câmera de personagem:** abra Câmera e toque no ícone de pessoa para ver seu apóstolo de perto. A rotação permite uma volta completa; Restaurar câmera retorna ao enquadramento de exploração. O mundo continua interativo na aproximação.
- **Efeitos contidos:** pegadas de poeira acompanham o movimento real dos moradores próximos em tempo seco; chuva e tempestades suprimem poeira e partículas de ambiente seco. Ferimentos apresentam um efeito breve sem alterar o dano da simulação.
- **Identidade persistente:** um morador mantém sua aparência e idade ao entrar na família. Campanhas v8 continuam com o mesmo formato, bens e progressão; esta etapa não acrescenta migração nem população artificial.

Os modelos e materiais são próprios e gerados por código. O foco desta etapa é acabamento dos personagens existentes; o cenário, o número de moradores, os sistemas locais e as limitações das etapas anteriores continuam válidos. Não há modelos humanos realistas de alta resolução ou sincronização multiplayer.

## Novidades da alpha 0.12 preservadas

- **Personagens:** rostos, cabelos, proporções, roupas e acessórios próprios de cada ofício, com texturas originais e articulações mescladas para reduzir as chamadas de desenho. As paletas da criação e os equipamentos continuam funcionais.
- **Mundo habitado:** dez novos NPCs, somando 16 na campanha inicial: padeira, moleiro, estalajadeira, carregador, guarda-florestal, pescador e quatro viajantes. Visitantes percorrem estradas, portas e regiões, fazem pausas e procuram abrigo à noite ou em tempestades. Os 22 animais anteriores permanecem.
- **Comércio itinerante:** Gaspar e Samira negociam presencialmente com estoque e caixa próprios. Comprar e vender transfere itens e moedas uma única vez; recarregar não repõe mercadorias. Procure **Viajantes e caravanas** no diário ou converse com um comerciante na estrada. Visitantes podem formar amizades, mas ainda não entram na família, tutela ou expedição à cripta.
- **Paisagem:** caminhos redesenhados onde atravessavam obstáculos; lago de contorno irregular, margens e vegetação alinhadas com a colisão e o mapa. Céu com nuvens em movimento, sol, lua e estrelas; névoa e serras suavizam as bordas.
- **Tempestades:** após um intervalo inicial, um círculo fixo avisa por 3,5 segundos onde o raio cairá. A descarga pode causar 28 de dano em um raio de 64 pixels, interromper trabalho e matar. Saia da marca, esquive no momento certo ou entre num interior. O próximo aviso tem intervalo de 36–50 segundos. Coleta externa ocorre a 65%; minas e oficinas permanecem abrigadas.
- **Persistência v8:** migrações v1–v7 acrescentam população e tempestades sem avançar o relógio nem substituir bens, família, recursos e fauna. Estoques, caixas, progresso de viagem e avisos de raio ficam salvos. Não há dano offline nem enquanto um painel pausa a simulação.

O conteúdo usa código, modelos e texturas procedurais próprios. O céu e as descargas são efeitos visuais; não há trovão sonoro nesta etapa. A população é autoral e limitada, sem geração infinita de comerciantes ou mercadorias. Os novos ofícios de padeira e moleiro recebem os pagamentos das oficinas existentes, sem duplicar sua capacidade de produção.

## Novidades da alpha 0.11 preservadas

- **Clima e preparação:** céu limpo, nuvens, chuva e neblina derivados do calendário, com previsão de três dias. Chuva reduz o ritmo de coleta externa a 80% e a capacidade de reposição externa em uma unidade; minas e oficinas mantêm ritmo normal. O preço reage ao estoque real.
- **Ambiente:** acabamento de solo, sombras de contato e atmosfera horária/climática, com camadas leves e orçamento fixo. Árvores, reservas, estradas e colisões mantêm suas posições.
- **Produção em lotes:** as três receitas existentes aceitam de uma a dez execuções, com custos/saídas escalados e validação integral na oficina. A falta de ingredientes ou energia impede o lote inteiro.
- **Lar e descanso:** cama funcional dentro da casa construída, com condição mínima de 25%; oito horas recuperam até 40 de vitalidade e toda a energia. Hospedagem transfere oito coroas ao caixa da estalagem. A prévia informa chegada, viradas e provisões; todos os descansos compartilham o processamento diário e param na morte.
- **Compatibilidade:** o formato continua v7. Não há sorteio ao carregar, avanço offline ou alteração dos prazos/rendimentos das colheitas existentes.

Esta etapa usa como referência princípios de [Stardew Valley](https://www.stardewvalley.net/about/), [Valheim](https://www.valheimgame.com/faq/) e [Medieval Dynasty](https://www.toplitz-productions.com/medieval-dynasty.html), com código e assets próprios. O clima é regional e diário, sem previsão meteorológica externa. Irrigação e solo fértil continuam para uma etapa posterior.

## Novidades da alpha 0.10 preservadas

- **Apenas 3D:** Phaser e o modo 2D foram removidos. Falhas de WebGL pausam o visual e oferecem uma nova tentativa com o estado preservado.
- **Interiores autorais:** 13 mapas de 900×900, com mobiliário 3D, colisões compartilhadas e estações funcionais. Há orfanato, estalagem, forja, moinho, padaria, casa de Mira, celeiro, casa da linhagem, construções dos dois terrenos, tenda, alojamento e capela. Prédios privados exigem aquisição/construção. Barraca de mercado, poço e ruínas abertas permanecem estruturas a céu aberto.
- **Portas físicas:** entrada por proximidade, saída para a mesma porta, mapa local com móveis e destinos. Comércio, produção, depósito, descanso e relações usam a estação ou pessoa da região atual.
- **Brumavale:** Terras Altas de 2560×1920 ligadas aos Ermos pelo desfiladeiro oriental. Trilhas, escarpas, pinheiros, prados, alojamento/capela e 12 recursos finitos. O catálogo possui 67 reservas; as 55 anteriores mantêm seus IDs e valores.
- **Trabalho financiado:** orçamento compartilhado protege as ofertas financiadas das despesas diárias. Ofertas sem verba ficam identificadas e desabilitadas; aceitação e entrega conservam tesouro, reserva e pagamento único.
- **Rotinas:** moradores caminham até portas e transitam entre suas regiões de trabalho/descanso. Alimento, relações e tutela verificam a região, evitando serviços à distância. Animais que não conseguem recuar param de correr no lugar e mantêm sua intenção sem sortear rotas a cada quadro.
- **Campanhas v7:** migração dos formatos v1–v6 acrescenta as regiões dos NPCs e as 12 reservas. Bens, família, horários, fauna e alimentação permanecem salvos. Corrigido o salvamento na sucessão após morte na cripta com acompanhante.

Interiores usam uma instância por edifício e os prédios não possuem andares navegáveis. Brumavale é uma região autoral conectada; política, novos reinos e multiplayer continuam como etapas posteriores.

## Base da alpha 0.9 preservada

- **Vegetação:** árvores com ramos e copas variadas, pinheiros, tufos de grama, flores, arbustos, samambaias e plantas de margem. Instâncias compartilham geometrias e o vento é calculado na GPU. Troncos físicos, caminhos, pontos de trabalho e os 55 recursos foram mantidos.
- **Fauna persistente:** 22 animais de sete espécies. Valeverde tem quatro galinhas, três ovelhas, duas vacas e Bento, o cão; os Ermos têm quatro cervos, seis coelhos e duas raposas. Eles caminham, pastam, descansam e reagem à aproximação dentro de habitats seguros.
- **Encontros:** clique/toque no animal ou aproxime-se e interaja. Observar cria uma memória; alimentar consome pão (cão) ou trigo (espécies compatíveis), uma vez por animal/dia, aumentando confiança e reduzindo medo. A raposa procura seu alimento. Os animais não bloqueiam o jogador.
- **Apresentação da fauna:** animais representados no mundo 3D; a pausa congela a simulação e as animações. O modo 2D usado na alpha 0.9 foi retirado na alpha 0.10.
- **Saves v6:** migração dos formatos v1–v5 acrescenta somente a fauna após validar os dados antigos. Posições, intenções, confiança, medo, alimentação e observações são persistentes. Nenhum tempo passa offline.

A fauna é uma primeira simulação local: só a região ativa recebe comportamento detalhado. Não há reprodução, caça, criação de rebanhos, produtos animais ou cadeia ecológica de predação nesta versão. Os modelos e texturas são procedurais e estilizados.

## Base da alpha 0.8 preservada

- **Materiais:** sete texturas procedurais de 64×64 para madeira, telhas, pedra, reboco, terra, caminhos e tecido, compartilhadas por região. Telhados, estradas, casas, plantações e mina possuem UVs próprios. As cores e o estilo de fantasia foram mantidos.
- **Assets do cenário:** barris, caixas, bandejas de produtos, bigorna, fornalha, ferramentas e suportes/lamparinas na mina. Os detalhes respeitam as bases já bloqueadas e deixam os acessos existentes livres. Pinheiros coletáveis usam copas próprias.
- **Partículas reais:** poeira dos passos, lascas de madeira, faíscas da mineração, folhas da coleta e efeitos de ataques/dano. Pólen de dia e vaga-lumes à noite usam a mesma reserva de 192 partículas, com no máximo uma chamada de desenho. A pausa congela os efeitos; troca de região, importação e encerramento descartam os recursos.
- **Mercado:** preços graduais por estoque, estação, pedidos vigentes e prosperidade. A prática e Fortuna melhoram as condições dentro de uma margem que evita lucro por comprar e revender imediatamente. O painel explica os fatores da cotação e mostra movimentos reais no registro existente.
- **Produção financiada:** o comerciante paga produtores e mão de obra com seu caixa, transferindo moedas às economias dos moradores. Moinho e padaria consomem insumos reais; falta de caixa, estação ou trabalhador pode suspender a reposição. Mercadorias acima da referência permanecem no estoque. A produção mantém o orçamento reservado para pedidos.
- **Saves v5 preservados:** a atualização não acrescenta campos obrigatórios, muda o formato nem avança o tempo de campanhas fechadas.

## Base da alpha 0.7 preservada

- **Paredes corrigidas:** faces da madeira e do reboco separadas fisicamente, eliminando a cintilação nas laterais das casas. As construções recuperam materiais opacos ao sair da área de transparência.
- **Horizonte externo:** céu e montanhas ao redor de Valeverde e dos Ermos, com cores acompanhando o dia e a noite. O cenário distante não altera os limites físicos nem as passagens entre regiões.
- **Coleta distribuída:** 15 pontos na vila e 36 nos Ermos, além dos quatro recursos da mina. Madeira, pedra e ervas possuem reservas independentes, ferramentas, tempo de trabalho, desgaste e regeneração. Árvores decorativas continuam compondo a floresta; os pontos de trabalho aparecem no mapa.
- **Mapa de recursos:** filtre os destinos por material ou veja apenas locais e passagens. A lista mostra o estoque restante e o dia de retorno dos pontos esgotados.
- **Campanhas v5:** migração dos formatos v1–v4 acrescenta somente as novas reservas. Materiais já coletados, ferramentas, trabalho parcial, datas de regeneração, família e propriedades permanecem salvos. A atualização não avança o relógio.

## Base da alpha 0.6 preservada

- **Mundo tridimensional:** vila, Ermos, mina, cripta e orfanato usam geometria 3D real. Há casas de madeira e pedra, telhados, árvores instanciadas, estradas, ponte, água, plantações e recursos. As coordenadas e colisões autorais foram mantidas.
- **Personagens:** apóstolo e moradores com volume, rosto e cores salvas; esqueletos distintos, espada visível conforme equipamento e animações simples de caminhada, trabalho e ataque.
- **Câmera:** acompanha o apóstolo. Abra o botão de câmera para girar, aproximar, afastar ou restaurar; Z/X giram e a roda do mouse controla a distância. WASD e joystick seguem as direções da tela após a rotação. Clique/toque no cenário seleciona personagens, objetos ou um destino no chão; o mapa continua oferecendo rotas seguras.
- **Sistemas preservados:** comércio, trabalho, combate, terrenos, depósitos, família, memórias e sucessão continuam na mesma simulação. Trocar a aparência não reinicia a campanha.
- **Renderização:** desde a alpha 0.10 há apenas o mundo 3D. Preferências antigas de visual são ignoradas; falhas gráficas oferecem nova tentativa preservando a campanha.
- **Celular:** resolução de renderização limitada, florestas instanciadas e sombras simples para conter o custo gráfico. O desempenho depende do aparelho; os testes automatizados de navegador não equivalem a medir 60 FPS em um telefone real.

O 3D atual é estilizado, com modelos gerados no código, chão plano e construções de posição fixa. A interface, o criador visual e o mapa permanecem como painéis sobre o mundo. Não há saltos, múltiplos andares navegáveis ou animações de captura de movimento.

## Base da alpha 0.5 preservada

- **Terras registradas:** Clareira do Carvalho (80 coroas) e Alto da Pedra (120) nos Ermos de Alvor. Placas físicas e mapa indicam acesso. Cada parcela mede 220×180 e permanece vinculada a Auren. Um adulto pode registrar um terreno adicional; o segundo exige carta do reino.
- **Armazém:** obra de 8 madeiras, 4 pedras e 10 energia; depósito persistente com limite de 120 de peso. Deposite ou retire 1 ou 5 unidades presencialmente. Retiradas respeitam a capacidade da mochila, inclusive quando o prédio precisa de reparos.
- **Abrigo:** obra de 6 madeiras, 3 pedras e 10 energia; uma madeira permite descansar quatro horas, recuperando energia e até 20 de vida. O calendário, a alimentação e os impostos continuam funcionando durante esse descanso.
- **Manutenção e obrigações:** construções perdem 2 de condição por dia; abaixo de 25, depósito e descanso ficam suspensos. Reparo de 3 madeiras, 2 pedras e 8 energia recupera 40 pontos. Cada novo terreno custa 1 coroa/dia, e a carta acrescenta 1. Ouro entra no tesouro cívico; saldo não pago vira dívida, quitável no mural. Dívidas restringem expansão e uso, preservando os bens armazenados.
- **Reconhecimento de Auren:** serviços cumpridos concedem influência uma única vez: 4 por contrato dos Ermos, 3 por até seis pedidos cívicos, 2 pela primeira colheita/casa/obra de cada terreno. No mural, com 12 de influência, propriedade, nenhuma dívida e 60 coroas, obtenha a carta de **Guardião de Alvor**. Ela permite o segundo registro e cria uma obrigação diária; não torna o personagem rei.
- **Legado e salvamentos v4:** terrenos, depósitos, carta e obrigações passam aos sucessores familiares elegíveis. Migrações v1/v2/v3 preservam a campanha e reconhecem serviços anteriores disponíveis no histórico, sem avançar o relógio. Sem família elegível, a nova campanha começa sem vantagens.
- **Construções físicas:** bases bloqueiam movimento, esquiva e rotas do mapa. As duas clareiras removem apenas árvores locais; estradas, água e recursos ficam acessíveis.

Abra **Propriedades** para consultar o registro. Vá pessoalmente à placa do terreno para comprar, construir e usar o depósito/abrigo; procure o mural de Valeverde para a carta e quitação de dívidas.

## Base da alpha 0.4 preservada

- **Ermos de Alvor:** região aberta de 3072×2304 com bosque, estradas, acampamento, ruínas, lago e recursos. **Mina do Ferro Antigo:** mapa de 1280×1120 com galerias conectadas, três veios de ferro e uma área de pedra. Portais exigem presença física; o mapa não teletransporta. A cripta permanece separada e opcional.
- **Ofícios:** machado e picareta têm estoque finito, propriedade e durabilidade. Comprar movimenta moedas para o comerciante. Reparar na forja usa 1 minério, 1 madeira e 3 coroas, restaurando 50 pontos até o limite de 100.
- **Trabalho físico:** extração e coleta duram segundos, exigem energia, capacidade de carga e ferramenta adequada. Conclusão desgasta 3 pontos e desenvolve mineração, lenharia ou herbalismo. Mover, agir ou sofrer dano interrompe o esforço sem entregar recursos. Cargas esgotadas só retornam no dia previsto; trabalho parcial pode continuar após salvar e carregar.
- **Oportunidades:** exploração de quatro marcos, entrega de quatro minérios e entrega de cinco ervas. Há prazo, materiais e recompensa reservada no orçamento existente; pagamento ocorre uma vez. Pedidos ignorados podem ser atendidos com estoque e fundos regionais reais. O diário registra estado e descobertas.
- **NPCs:** fome e fadiga alteram destinos. Moradores caminham ao mercado e compram pão com economias ou verba disponível da vila, protegendo compromissos existentes; descansam na estalagem. Compartilhar pão presencialmente reduz fome e cria gratidão e confiança.
- **Família:** foco educacional, tutor adulto vivo, lições presenciais uma vez por dia com pão e energia, vínculo e prática. Educação influencia o sucessor. Há regente para menores, preferência de herdeiro restrita à família elegível e histórico datado de nascimento, casamento, educação, morte e herança.
- **Campanhas portáveis:** no guia, exporte um JSON ou importe um arquivo após conferir personagem, região, dia e ouro. A importação válida mantém o salvamento anterior como backup; arquivos inválidos não substituem o progresso. A tela inicial também permite importar em um dispositivo novo.
- **Persistência v3:** migrações v1/v2 preservam campanha, extensões válidas, competências, família, moeda e compromissos. Dados atuais incompletos são rejeitados. O relógio continua pausado enquanto você está fora.

## Sistemas anteriores preservados

Três bênçãos com efeitos concretos; atributos e prática sem níveis globais; combate, equipamento, cripta e missão opcional; inventário, consumo, comércio com estoque/capital e preços; moinho, padaria e forja com receitas; cultivo sazonal; Parcela do Moinho ligada ao Reino de Auren; construção, reparos, tributo e contrato de Lina; pedidos rotativos de abastecimento; calendário, fome, envelhecimento, ferimentos e morte; memórias, retirada autônoma diante de perigo e amizade que influencia um aliado.

Quando o apóstolo morre, apenas cônjuge ou filhos vivos podem suceder. Um estranho não pode substituir a família elegível. Menores ficam sob regência e não combatem na cripta nem assinam contratos de terra, construção ou emprego; menores de doze anos não entram na mina. Sem família elegível, a linhagem termina e uma campanha nova começa sem os bens anteriores. A preferência de herdeiro não burla essas regras.

## Salvamentos

IndexedDB mantém snapshot atual e backup; localStorage é fallback. O jogo salva após ações relevantes e periodicamente, além do botão manual do cabeçalho. Limpar dados do navegador remove as cópias locais: use **Exportar campanha** para guardar um arquivo ou transferir entre aparelhos. O arquivo tem limite de 2 MiB e é validado antes da importação. Não há sincronização automática entre dispositivos.

## Simplificações e limites

Três regiões externas autorais (vila, Ermos e Terras Altas), dois mapas de exploração subterrânea (mina e cripta) e 13 interiores de edifícios, incluindo o orfanato. Apenas a região ativa é instanciada; texturas são geradas sob demanda e ficam em cache, e cenários distantes são ocultados. A navegação usa grade de 24 pixels e segmentos seguros, com pés de raio 9 e colisão por subpassos. Personagens respeitam obstáculos estáticos, sem bloqueio mútuo de suas silhuetas.

Há a fazenda original e dois terrenos adicionais, construções em posições fixas (uma por terreno), uma trabalhadora contratável, duas ferramentas, três receitas e três oportunidades iniciais além dos pedidos rotativos e da missão da cripta. A economia representa produção e consumo regionais por regras agregadas. Necessidades de NPCs não causam mortes aleatórias; Elara permanece no orfanato com rotina simplificada. Educação é prática numérica e vínculo, sem escola completa ou simulação de infância minuto a minuto. Descendência usa traços básicos e dezesseis dias entre união e nascimento. O ano tem 360 dias. Não há linguagem gerada por IA; autonomia e relações seguem regras e memórias.

A política inicial limita-se a registro territorial, influência, carta e obrigações. Ainda não há política completa, guerras, múltiplos reinos, construção livre, genética detalhada, doenças complexas, centenas de profissões, contas, simulação offline ou multiplayer/PvP. O multiplayer será desenvolvido depois dos sistemas locais. A campanha é individual: NPCs não são apresentados como jogadores reais.

## Arquitetura

- `types.ts`, `data.ts`: contratos, atributos, itens e dados básicos.
- `regions.ts`, `navigation.ts`: regiões, conexões físicas, marcos, recursos, colisões e rotas.
- `simulation.ts`: autoridade local e integração dos sistemas, sem autoridade remota fictícia.
- `frontier.ts`: ferramentas, trabalho, recursos finitos, descobertas, reservas e oportunidades.
- `territory-data.ts`, `territory.ts`: parcelas, limites de posse, construções, depósitos, influência e obrigações.
- `life.ts`, `npc-routines.ts`: necessidades, deslocamentos entre portas e interiores, tutores, educação, regência e registros familiares.
- `weather.ts`, `rest.ts`, `storms.ts`: clima derivado do calendário, previsão, descanso e descargas persistentes com dano autoritativo.
- `population.ts`, `travelers.ts`: identidades, itinerários, abrigos, estoques e comércio dos visitantes.
- `water.ts`, `landscape-paths.ts`: contornos e caminhos compartilhados entre renderização, mapa e navegação.
- `economy.ts`, `market.ts`, `civic-budget.ts`: produção financiada, cotações, lavouras, manutenção, salários, verbas reservadas e pedidos.
- `interiors.ts`, `highlands.ts`: interiores, móveis, estações, acesso e dados das Terras Altas.
- `persistence.ts`, `campaign-files.ts`: validação, migrações v1–v7 para v8, backups e intercâmbio de campanhas.
- `world.ts`, `world-input.ts`: carregamento 3D sob demanda, recuperação de WebGL, ciclo de vida e entrada compartilhada.
- `three/world3d.ts`, `three/coordinates.ts`: Three.js, câmera, seleção por raio, rotas e apresentação da simulação.
- `three/environment.ts`: cenário tridimensional e seu ciclo de vida.
- `character-identity.ts`: aparência consistente entre o NPC renderizado e seu registro familiar.
- `three/characters.ts`, `three/character-geometry.ts`: formas, roupas e articulações dos personagens, animações e descarte.
- `three/character-materials.ts`, `three/character-grounding.ts`: materiais de superfícies, iluminação indireta e lote de sombras suaves.
- `three/horizon.ts`: céu, serras e transição atmosférica das regiões externas, sem alterar navegação.
- `three/materials.ts`, `three/effects.ts`: texturas procedurais e partículas reutilizadas, com propriedade e descarte por instância.
- `three/interiors.ts`, `three/highlands.ts`: mobiliário, arquitetura interna e paisagem das Terras Altas.
- `three/lightning.ts`: aviso fixo, descarga e clarão a partir dos eventos já decididos pela simulação.
- `three/landscape-finish.ts`, `three/weather.ts`: acabamento instanciado do solo/contato, precipitação, nuvens e paleta atmosférica.
- `village-decor.ts`: posições de decoração compartilhadas por navegação e apresentação.
- `App.tsx`, `Panels.tsx`, `ExpansionPanels.tsx`, `TerritoryPanels.tsx`: interface React responsiva e ações reais.
- `transport.ts`: intenções serializáveis para a futura integração de servidor.

## Verificação

As regras e a compilação são verificadas por `npm test` e `npm run build`. O recibo desta entrega fica em `docs/verification-alpha12.md`, com fluxos no navegador e limites da verificação. Os recibos anteriores permanecem no diretório `docs`.
