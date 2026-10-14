# Verificação — alpha 0.4

14 de outubro de 2026. Snapshots atuais v3, com migrações de v1 e v2.

## Testes e compilação

- `npm test`: **144/144 passaram**, sem falhas. Incluem as regras anteriores, geografia e portais, mineração e interrupção, cargas e desgaste, orçamento e pagamentos únicos, necessidades, educação, tutela, sucessão, migração e arquivos portáveis.
- `npm run build`: TypeScript e Vite passaram. Bundle principal de aproximadamente 1,99 MB (502 KB gzip) e CSS de 67 KB. O aviso de chunk grande permanece; esta entrega não estabelece uma garantia de 60 FPS em aparelhos físicos.
- Revisão independente encontrou duas inconsistências: controles familiares desabilitados na porta real da moradia e migração sobrescrevendo competências numéricas estendidas. Ambas foram corrigidas; também foram preservados identificadores antigos de NPCs, quantidades estendidas válidas e referências de tutela após morte/sucessão.

## Jornada física pela interface

Em Chromium 1440×900, o fluxo foi conduzido por criação, teclado, mapa e botões reais. O código de teste observou o estado para verificar chegada e resultados, sem conceder itens, moedas ou teletransportar o personagem durante esta jornada:

1. Criar Elias, receber pertences e sair a pé do orfanato.
2. Caminhar ao mercado e comprar a picareta: ouro 48→20, ferramenta em estoque finito.
3. Aceitar o pedido de quatro minérios: 52 coroas saem do orçamento para uma reserva.
4. Caminhar à estrada sudeste, atravessar os Ermos e entrar fisicamente na mina.
5. Caminhar à galeria oeste e extrair duas vezes: oito segundos de trabalho, quatro minérios, duas cargas consumidas e durabilidade 100→94.
6. Sair da mina, percorrer a estrada de volta e entregar no mercado: minérios 4→0, reserva 52→0 e ouro 20→72. Nenhum pagamento duplicado.
7. Exportar arquivo, importá-lo em outro contexto de navegador, salvar e recarregar: ferramenta, trabalho concluído e 72 coroas preservados. Arquivo inválido rejeitado sem substituir a campanha.

O build estático foi verificado separadamente, usando somente a interface e arquivos reais para conduzir ações. Uma campanha de teste posicionada na mina pela preparação do arquivo foi importada; a extração gerou dois minérios, consumiu uma carga e levou durabilidade 94→91. Recarregar e exportar preservaram os resultados. Nenhum erro de execução ocorreu.

## Celular e tablet

Verificações em 390×844, 844×390 e 1280×800 exercitaram joystick, teclado, paredes da mina, rotas, ferramentas, oportunidades, interrupção de trabalho, oferta de pão, ensino, indicação de herdeiro e transferência de campanha.

Uma aula na porta da moradia (2090,815) mudou prática 0→1,5, vínculo 0→5 e lições 0→1, usando um pão e oito de energia. Uma segunda aula no mesmo dia ficou indisponível. O cancelamento da prévia de importação preservou o estado exato.

A passagem final com fonte congelada verificou documento, aplicativo, cabeçalho e painéis sem overflow ou deslocamento horizontal, acesso ao guia e ausência de sobreposição entre barra de trabalho e identificação da região. O marcador dos recursos foi ajustado abaixo dos pés e revisto em captura final. Sem erros de execução; testes funcionais não usaram recarga HMR como evidência de falha ou sucesso do produto.

## Limites práticos

Os mapas são autorais e finitos, com a região ativa instanciada e objetos distantes ocultados. A mina oferece extração pacífica e não adiciona geração infinita de dungeons. Necessidades, educação, eventos e economia usam regras locais; não há modelos de linguagem ou simulação offline. O jogo continua individual, sem contas, sincronização automática ou PvP. Política completa, múltiplos reinos, construção livre e outros sistemas extensos permanecem futuras expansões.

A campanha sintética da publicação anterior foi capturada para confirmar, após a publicação no mesmo endereço, a migração v2→v3 preservando seu progresso.
