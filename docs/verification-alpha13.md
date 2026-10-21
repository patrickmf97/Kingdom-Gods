# Verificação — alpha 0.13

## Escopo

Refinamento dos personagens existentes na direção escolhida: fantasia estilizada com proporções naturais. Formas suaves de rosto, corpo e roupas; mechas curvas, mãos proporcionais, ombros arredondados, articulações de joelhos/cotovelos, materiais de superfícies, sombras suaves, iluminação indireta e câmera de aproximação. Não acrescenta regiões, moradores, contas ou multiplayer.

## Integração e regressões

Os novos testes verificam proporção de cabeça, suavidade das normais, orientação externa das faces, mechas e polegares, ausência de barba adulta no fundador, ajuste de elmo, apoio dos pés nas poses, cadência proporcional à velocidade e estabilidade da pausa. Os testes anteriores de determinismo, cores, profissões, ferramentas, descarte e propriedade dos recursos continuam válidos.

O relógio visual do ataque passou a usar o mesmo tempo de apresentação da animação, evitando prolongamento indevido depois de pausas. A velocidade vem do deslocamento físico; reconstruções e saltos de região não simulam corrida. A animação não muda a posição lógica nem concede atributos, recursos ou dano.

Uma revisão independente encontrou a silhueta projetada invertida. A regressão transformou os pontos reais de cabeça e pernas da sombra para o mundo, reproduziu a falha e passou após corrigir sua rotação. Os pés ficam junto à base e a cabeça no extremo afastado da luz. A camada ignora seleção por raio, reutiliza buffers e descarta apenas os recursos próprios.

## Materiais e orçamento

Albedo original, normal e rugosidade usam atlas de 256², com oito superfícies e bordas copiadas em cada região para reduzir vazamentos entre materiais. As cores salvas ficam nos vértices. As texturas de dados não recebem conversão sRGB. O preenchimento indireto varia por uniforme conforme dia/noite/interior, sem nova luz, passagem de sombras ou recompilação por mudança de horário.

Amostragem dos 15 ofícios, quatro variantes e dois sexos: máximo de 4.432 triângulos alocados por personagem, contando espada e ferramenta ocultas; máximo de 12 chamadas visíveis por personagem. Cada personagem possui três texturas RGBA de 256²: 0,75 MiB de dados básicos antes de mipmaps. As sombras de todos os personagens compartilham uma chamada, com limite padrão de 64 atores. São aproximações suaves de contato e silhueta; não utilizam oclusão tridimensional por mapas de profundidade.

Poeira observa somente deslocamento real de moradores próximos, com limites por quadro e pelo pool existente de 192 partículas, em uma chamada. Pausa, importação, troca de região, teleporte e morte não geram passos falsos. Chuva e tempestades suspendem poeira e partículas secas. Ferimentos são observados a partir da perda real de vida; não causam dano por apresentação.

## Continuidade

O formato permanece v8. Não há nova migração, avanço offline ou alteração de atributos e equipamentos salvos. A aparência canônica do NPC é compartilhada entre renderização e ingresso na família: casamento preserva seus traços e sua idade exibida. Familiares antigos conservam seus dados existentes. As regressões exercitam casamento real, moedas/itens inalterados e salvamento válido.

## Limites da verificação

As capturas usam Chromium com WebGL via SwiftShader e toque emulado; não comprovam desempenho em um telefone físico. O comparativo de modelos em iluminação controlada é um instrumento de QA separado, não uma tela do produto. Os fluxos funcionais usam o jogo real e importações explícitas de campanhas de QA, sem conceder resultados pela manipulação do estado no navegador. A campanha pública preservada é verificada separadamente após a publicação.

Recibos de build, pacote, publicação e capturas permanecem fora da árvore de fontes, permitindo manter o artefato correspondente ao commit publicado.
