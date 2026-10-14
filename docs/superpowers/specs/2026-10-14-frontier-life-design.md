# Alpha 0.4 — Além de Valeverde

O usuário autorizou os próximos sistemas locais e pediu explicitamente um mapa de mina e um mundo aberto fora da vila, mantendo multiplayer por último. A entrega inclui os quatro passos anteriores ao multiplayer: ofícios/exploração, transferência de campanhas, necessidades/oportunidades de NPCs e aprofundamento da família/sucessão. A visão política, múltiplos reinos e construção livre continuam etapas posteriores; não serão apresentados como completos.

## Mundo e ofícios

Uma estrada física ao sudeste de Valeverde liga a vila ao Vale de Auren, região externa de 3072×2304 com bosque, acampamento, lago, ruínas e acesso à mina. A mina de 1280×1120 tem câmaras conectadas, paredes sólidas e extração pacífica de ferro e pedra. Portais exigem proximidade e não são teletransportes pelo mapa. Apenas a região ativa é renderizada; objetos distantes são ocultados pela câmera. Solo, estruturas e personagens continuam ordenados por profundidade.

O cadastro de regiões compartilha posições, objetos, portais, recursos e colisões. Navegação usa dimensões reais de cada região e preserva todas as correções da alpha 0.3. Picareta e machado são ferramentas persistentes com estoque comercial, preço, desgaste e reparo. Trabalho leva segundos reais, consome energia e desenvolve mineração, lenharia ou herbalismo; mover ou sofrer dano interrompe a ação. Jazidas têm cargas finitas e regeneração por calendário. Não há níveis globais nem combate obrigatório para obter minério.

Três trabalhos opcionais cobrem exploração, ferro e ervas. Recompensas são reservadas do orçamento real da vila e só pagas uma vez; falhas devolvem o saldo reservado. NPCs podem resolver pedidos ignorados usando estoques e dinheiro existentes. Descobertas, estados dos trabalhos e recursos permanecem no salvamento.

## Vida e legado

Fome e fadiga alteram os objetivos dos NPCs, que se deslocam para comer ou descansar. Comida é retirada de estoque finito e dinheiro circula entre moradores, orçamento e comerciante. O jogador pode oferecer pão a um NPC próximo, melhorando necessidades e vínculos com consequências persistentes.

Filhos menores têm foco educacional, tutor, prática e vínculo. Lições presenciais usam pão, energia e intervalo de um dia. A educação influencia competências e atributos do sucessor, dentro de limites. Um tutor adulto vivo pode assumir regência; menores não assinam contratos ou compram terras nem combatem na cripta. Preferência de herdeiro só aceita parceiro ou filho vivo e não remove a regra obrigatória de sucessão familiar. Nascimento, casamento, morte, educação e herança formam histórico navegável. Memórias herdadas mantêm origem de legado sem duplicar prefixos.

## Persistência e interface

Snapshots v3 incluem os novos sistemas e migram v1/v2 após validar os dados antigos. Migração preserva campanhas e extensões desconhecidas; dados v3 danificados são rejeitados. Exportação gera JSON independente e validado; importação valida antes de substituir, guarda backup e só retoma após gravar com sucesso. O jogo apresenta confirmação de substituição para proteger o progresso atual, sem pedir nova autorização de desenvolvimento.

Mapa muda conforme a região, mostra túneis e rotas válidas, com visão das conexões entre regiões. Inventário, mercado e oficina exibem ferramentas funcionais; diário mostra trabalhos e descobertas; relações mostram necessidades; família apresenta ensino, tutela, preferência e histórico. Controles móveis permanecem responsivos. Nenhum botão anuncia multiplayer, política ou outros sistemas inexistentes.

## Verificação

Testes de regras exercitam portais distantes, paredes da mina, rotas, limites, recursos, desgaste, interrupção, conservação de moedas, recompensas únicas, refeições e tutela, educação/sucessão e migração/importação inválida. Chromium verifica teclado e toque, saída da vila, entrada na mina, compra de ferramenta, extração real, retorno/venda, transferência de campanha e UI em duas orientações. A fonte exata é enviada e publicada no mesmo Site público.
