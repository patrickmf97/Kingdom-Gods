# Verificação da alpha 0.8

## Regras e construção

`npm test`: 265 testes aprovados. `npm run build`: TypeScript e bundle de produção aprovados; permanece o aviso conhecido de tamanho dos chunks de Three/Phaser, carregados separadamente.

- Materiais: sete mapas determinísticos, periódicos e compartilhados por região, com UVs de área válida. Testes cobrem relevo visual dos suportes da mina, limites físicos dos objetos e descarte de texturas sem afetar outra região.
- Efeitos: 16 testes de reserva fixa, emissões limitadas, trabalho por tipo, cancelamento, conclusão, ataques aceitos, dano, pausa, troca de região/importação e descarte idempotente. Até 192 partículas em uma única chamada de desenho, com limite por quadro e por segundo.
- Economia: preços contínuos e determinísticos, fatores sazonais e pedidos ativos, benefícios de negociação limitados, operação real de compra/venda e registros. Produção transfere moedas do comerciante aos moradores, consome insumos e respeita falta de caixa, indisponibilidade e estoques excedentes. Verbas reservadas e escrow permanecem protegidos.
- Compatibilidade: formato v5 sem campos obrigatórios novos; cotações e carregamento não avançam tempo nem alteram os bens salvos.

A revisão independente não encontrou bloqueios de integração. Verificações adicionais abrangeram 51.840 operações de comércio, 721 viradas de dia conservando moeda e preservação de estoques muito grandes. Os testes de partículas também receberam revisão independente.

## Jornada no navegador

Compra e venda reais no mercado movimentaram exatamente o preço mostrado, uma unidade de estoque/inventário e o caixa oposto do comerciante. Os registros têm sinal correto e a campanha manteve bens, ferramentas e reservas após salvar, recarregar e exportar em v5.

Uma passagem de dia pela hospedaria, em fixture financiada, pagou 18 coroas a moradores por reposição e trabalho. O fundo cívico comprou três pães com 18 coroas livres; as receitas consumiram os insumos previstos. O caixa do comerciante fechou com a diferença correta e os registros de produção ficaram visíveis.

Em 844×390 e 390×844, toque no joystick moveu o apóstolo e produziu poeira; um toque no mercado iniciou a caminhada e abriu a interação real. Mundo e painel comercial não transbordaram horizontalmente, e os fatores de preço permaneceram acessíveis.

Coleta real de madeira rendeu três unidades e gastou três pontos do machado; a pausa congelou trabalho e versão das partículas. Cancelamento não alterou produção, reservas ou ferramentas. A mineração rendeu dois minérios com faíscas; a caminhada até a saída e a viagem aos Ermos limparam os efeitos da região anterior. A amostra de trabalho chegou a 14 partículas das 192 disponíveis, com uma chamada de desenho. Trocar 3D→2D→3D preservou a campanha e deixou um único canvas. Os casos finais passaram sem exceções JavaScript.

## Direção visual e limites

Comparações com a alpha 0.7 mantiveram posição e câmera. Casas, mercado, forja e mina exibem materiais e detalhes novos; a geometria jogável e os acessos foram preservados. Os assets são procedurais, sem dependências ou downloads externos. A simulação econômica continua regional e agregada; não simula individualmente cada entrega de matéria-prima. As cores e o estilo de modelos simples permanecem.

Partículas são apresentação e não concedem recompensas. O mundo continua local, sem contas ou multiplayer. A QA de navegador usa Chromium com renderização de software e emulação de toque/tela; seus números de desenho não representam FPS medidos num celular físico.
