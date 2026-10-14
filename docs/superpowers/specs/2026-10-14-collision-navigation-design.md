# Colisões e exploração — alpha 0.3

Corrigir as colisões mostradas pelo jogador e avançar a exploração física de Valeverde, preservando a campanha. A execução e publicação no endereço atual já estão autorizadas.

Uma geometria compartilhada representa paredes, balcões, cercas, troncos, água e ponte. O ponto de referência é o pé do personagem, com raio de 9 pixels. Movimento contínuo, esquiva e NPCs obedecem à mesma geometria; passos pequenos impedem atravessar obstáculos. Posições antigas dentro de obstáculos são recuperadas para um ponto próximo seguro, sem mudar itens, família ou progressão.

Solo e plantações permanecem atrás dos personagens. Cercas e galpão são separados e ordenados por profundidade; a moradia construída fica ao lado leste da parcela, em 2090,790. Paredes usam dimensões físicas da arte, sem transformar telhados em obstáculos. Rótulos de NPCs aparecem por proximidade, com o papel apenas para o encontro mais próximo.

Clique/toque e mapa oferecem caminhada por rotas locais que contornam obstáculos, com ponte como única passagem do rio. O mapa mostra o percurso e a distância caminhável. A rota é cancelada por controle manual ou ação; não teleporta, não atravessa interiores nem entra automaticamente na cripta. NPCs usam rotas limitadas e posições sociais espaçadas.

Mantêm-se o formato de salvamento v2, modo local e recursos existentes. Não são incluídos serviços pagos, contas ou multiplayer. Rotas são um auxílio ao deslocamento, sem obrigar missões.
