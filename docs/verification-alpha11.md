# Verificação — alpha 0.11

## Escopo e referências

Evolução dos sistemas e do cenário existentes, a partir de princípios de Stardew Valley (calendário e cotidiano), Valheim (preparação e 3D estilizado com iluminação) e Medieval Dynasty (economia de produção). As fontes oficiais e as decisões constam na especificação desta etapa. Código e assets próprios; multiplayer continua adiado.

## Regras, compilação e revisão

- Suíte completa: **400 testes aprovados, zero falhas**, sem ignorados ou cancelados.
- `npm run build`: TypeScript e Vite concluídos. O aviso de pacotes acima de 500 kB continua; Three permanece carregado sob demanda. Sem novas dependências.
- `git diff --check`: sem erros.
- Revisão independente do conjunto: nenhum novo defeito importante encontrado, com 31 testes focados executados pelo revisor. Revisão específica do descanso também aprovou o fluxo de calendário, cobrança, cama e morte.
- A chuva altera ritmo de coleta externa sem modificar a duração nominal salva; o retorno de trabalho salvo continua validado no v7 e não duplica produção/desgaste. Oficinas e minas continuam abrigadas. A capacidade de reposição externa diminui antes dos limites de estoque, trabalhador e caixa, sem multiplicador artificial de preço.
- Lotes de uma a dez receitas são validados integralmente, incluindo pedidos malformados, remotos, sem energia/ingredientes ou com estouro numérico. A ação antiga sem quantidade continua produzindo uma receita.
- Todos os descansos passam pelo mesmo avanço até a meia-noite. Viradas processam alimentação, salários, impostos, manutenção e prazos uma vez. Morte interrompe a passagem de tempo e impede recuperação posterior. Hospedagem transfere oito coroas ao caixa mercantil e registra a operação.
- O teste anterior de texturas mantém o limite de sete superfícies em cache e passa a permitir exatamente um mapa exterior adicional de 64²; sua propriedade e liberação são verificadas separadamente.

## Orçamento visual

Acabamento: duas chamadas adicionais e uma textura de 64²; 212/254/188 contatos na vila/Ermos/Terras Altas, com teto de 1.024. O contato usa transparência calculada no shader. Recursos esgotados e prédios ainda não construídos atualizam a sombra correspondente. O mapa amplo do chão recebe a iluminação existente.

Clima: até três chamadas e capacidade fixa de 296 instâncias (256 gotas, 16 nuvens, 24 faixas de névoa), sem texturas, novas luzes, pós-processamento ou shadow pass. Geometrias e matrizes são reutilizadas; o mesmo relógio de apresentação preserva as matrizes durante a pausa. Camadas não interceptam seleção/caminhada e possuem descarte idempotente.

## Navegador

Chromium com WebGL via SwiftShader e toque emulado. Fluxos usam campanhas de QA e ações reais; a campanha pessoal do usuário não é editada.

- Estalagem: entrada física e caminhada ao balcão, prévia das 18h, oito coroas debitadas e creditadas ao caixa, um lançamento; salvamento/recarregamento conservou o resultado.
- Casa: campanha com aquisição e construção por ações reais, entrada pela porta e caminhada à cama. Descanso das 23h30 às 7h30 atravessou dia 31→32, consumiu um pão, aplicou duas coroas de tributo e reduziu condição de 100 para 97, sem taxa de hospedagem; salvamento/recarregamento conservou o resultado.
- Produção: caminhada até moinho, padaria e forja, entrada e estação interna. Selecionar três receitas debitou os ingredientes completos e 18/24/42 de energia, com saídas exatas e sem mexer na moeda. Lotes de dez sem recursos ficaram desabilitados. Estado v7 conservado após recarregar.
- Céu limpo, nublado e chuva visíveis; previsão de três dias e diferença de exposição em interiores. Gotas renderizadas sem erro de shader, descanso em interior sem precipitação, pausa sem avanço de apresentação.
- Extração real de minério nas Terras Altas: duração nominal salva de quatro segundos; na chuva, prévia de cinco e ritmo medido de aproximadamente 80%. Céu limpo e mina abrigada mantiveram aproximadamente 100%. Resultado: dois minérios, uma carga de reserva e três pontos de picareta consumidos uma vez.
- Mobile: interface sem transbordamento em 390/320 pixels de largura e orientação horizontal, previsão externa de 80% e interior de 100%, seleção nativa de lote de três e consumo real de seis trigos, movimento por joystick via toque.

Preparações corrigidas no ensaio incluem preservar a data de registros históricos e migrar v6 para v7 antes de usar uma região introduzida no v7. Isso não exigiu alteração do produto. O console identificou apenas o favicon ausente (404), sem erro de execução ou compilação de shader nos fluxos acima.

## Compatibilidade e limites

Formato v7 e mesmos 67 recursos/22 animais. Clima deriva do calendário local; abrir/carregar não sorteia tempo, altera colheitas ou avança o mundo offline. Chuva é diária e regional, sem tempestades, dano, irrigação ou fertilidade do solo. Sombras são de contato aproximado; não há sombras dinâmicas projetadas por luzes. Emulação e SwiftShader não comprovam 60 FPS em telefone físico.

Pacote final, publicação e continuidade da campanha na origem pública são conferidos separadamente; os recibos operacionais ficam fora da árvore de fontes para manter correspondência exata entre commit e artefato.
