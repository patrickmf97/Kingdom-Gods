# Verificação da alpha 0.7

## Regressão automatizada

`npm test`: 230 testes aprovados, sem falhas. `npm run build`: TypeScript e bundle de produção aprovados. O aviso de tamanho dos chunks de Phaser/Three permanece; cada renderizador continua carregado separadamente.

- Geometria: madeira separada do reboco, placas de grama sem sobreposição coplanar e transparência com invalidação de shader apenas nas transições.
- Horizonte: quatro chamadas de desenho e 1.488 triângulos; céu e montanhas não recebem cliques nem mudam os limites físicos. Doze combinações de proporção de tela e rotação mantêm céu e silhueta visíveis. Interiores não recebem horizonte externo.
- Recursos: 55 identificadores únicos, sendo 15 na vila, 36 nos Ermos e quatro na mina. Os dez originais conservam todos os metadados. Todos são alcançáveis a partir das entradas das respectivas regiões, inclusive com as construções adquiridas.
- Trabalho: os 45 pontos adicionados respeitam ferramenta, tempo, energia, produção, desgaste, estoque independente e regeneração pelo calendário.
- Persistência: formatos v1–v4 migram para v5; reservas antigas, datas de retorno, trabalho parcial e extensões permanecem intactos. Arquivos incompletos ou alterados não recebem reparação silenciosa. Uma campanha v4 conquistada durante a QA anterior também passou pela migração e transferência portátil.

## Jornada real no navegador

Uma campanha v4 foi importada pela interface e recebeu as 45 reservas novas. O personagem caminhou até seis pontos novos dos Ermos — dois de madeira, dois de pedra e dois de ervas — e concluiu dez trabalhos reais. A QA observou o custo de energia, a produção no inventário, a redução de uma carga e o desgaste de três pontos das ferramentas.

Um depósito de pedra foi esgotado; o botão de extração ficou desabilitado e o retorno foi marcado para dois dias depois. Reservas, materiais e ferramentas sobreviveram a salvar/recarregar, exportar/reimportar o arquivo v5 e trocar de 3D para 2D e novamente 3D. A troca manteve um único canvas ativo.

Em 844×390 e 390×844, a caminhada até a borda, as rotações e a distância máxima da câmera mantiveram céu e serras visíveis, sem transbordamento da página. A mina conservou seu ambiente fechado. O filtro mostrou as quantidades corretas por material, permitiu selecionar rotas e exibiu o dia de retorno do depósito esgotado. Os seis casos finais passaram sem erros JavaScript.

O bundle estático de produção também foi servido e testado em navegador: importação v4, mineração real de duas unidades de ferro, desgaste para 91, reserva restante de uma carga, zoom da câmera e recarga preservando materiais, ouro e ferramentas, sem exceções JavaScript.

## Revisão visual e limites

Capturas equivalentes da hospedagem anterior e do código novo reproduziram as manchas das paredes e as listras no chão; as capturas finais mantiveram câmera e posição e mostraram a correção. O horizonte foi revisto após reduzir serras excessivamente próximas. Uma revisão independente encontrou a necessidade de recompilar o shader na troca de transparência; a correção foi testada e aprovada na revisão.

O cenário mantém o estilo de modelos simples e terreno jogável plano. O céu aparece com mais força nas bordas por causa da inclinação da câmera. Árvores decorativas continuam compondo a floresta; os pontos com trabalho real são identificados no mapa. Os testes de navegador usam Chromium com renderização de software e emulação de tela/toque; não medem o desempenho de um telefone físico. Multiplayer continua fora desta versão.
