# Verificação — alpha 0.9

## Escopo

Paisagem 3D com árvores de copas variadas, ramos, cinco tipos de vegetação rasteira e vento em shader. Fauna local persistente de 22 animais e sete espécies, com apresentação 3D e sprites no modo 2D, rotinas, fuga, confiança, observação e alimentação presencial. Campanhas v1–v5 migram para v6 conservando os campos anteriores.

## Regras e compilação

- `npm test`: 299 testes, 299 aprovados, nenhum ignorado ou falhando.
- `npm run build`: TypeScript e Vite concluídos. O Vite continua avisando sobre os pacotes grandes de renderização; Three e Phaser permanecem carregados sob demanda, conforme o visual escolhido.
- `git diff --check`: sem erros.
- Revisão independente: sem defeitos reproduzíveis. Um ensaio de 60.000 atualizações, alternando horários, manteve todo o estado válido e confirmou movimento dos 22 animais.
- Três campanhas reais v5 de entregas anteriores migraram com todos os campos antigos idênticos, incluindo extração e reservas já esgotadas; importação/exportação conservou o resultado.
- Testes de geometria, habitats, reservas de acesso, recursos, vento, alimentação, sucessão e descarte verificam o comportamento dos módulos.

## Orçamento e limites

A paisagem usa dez lotes instanciados por região: cinco para árvores e cinco para grama, flores, samambaias, arbustos e juncos. Os dados de instâncias permanecem estáticos; a animação altera um uniforme de tempo. Foram mantidos os 189/214 troncos autorais e os 55 pontos de coleta. A camada medida possui cerca de 285 mil triângulos na vila e 352 mil nos Ermos; isso não representa uma medição de FPS em aparelho físico.

A fauna detalhada é simulada somente na região ativa. Não há avanço offline, reprodução, caça, produtos animais ou predação. Os animais não bloqueiam o apóstolo; o acompanhamento por clique termina depois de 12 segundos de simulação se não alcançar a distância de interação. Modelos e texturas são procedurais e estilizados.

## Navegador

Chromium com WebGL em SwiftShader e toque emulado: 19 casos aprovados, sem erros de execução. Três capturas da versão pública anterior e três conjuntos comparáveis da paisagem nova; 13 fluxos funcionais/visuais adicionais.

- Observar e alimentar Bento consumiu um pão, alterou confiança de 55 para 71, registrou memória e bloqueou repetição no dia.
- Salvamento/recarregamento e exportação/reimportação conservaram a fauna v6 e os bens da campanha.
- Clique real no modelo do cão traçou uma rota, caminhou e abriu a interação.
- Aproximação por teclado fez cervo e coelho fugirem; os animais permaneceram em habitats válidos. Pausa congelou campos persistidos e o relógio de apresentação.
- Dia/noite alterou descanso e atividade; sete espécies foram verificadas visualmente.
- Fauna 2D representada; observar/alimentar, salvar/recarregar e trocar repetidamente entre os dois visuais manteve estado e um só canvas.
- Toque: alimentar e mover pelo joystick em 844×390 e 390×844, com um canvas e sem rolagem horizontal.
- O retrato humano genérico dos diálogos foi retirado dos encontros com animais após uma regressão visual reproduzida.

O pacote estático final também passou por mineração real (2 minérios, durabilidade 91 e reserva restante 1), compra real de madeira por 5 coroas, cotações e alimentação/observação de Bento. Salvamento/recarregamento preservou resultados. Nenhum erro de execução. O teste de retrato humano falhou antes da correção e passou após a compilação corrigida.

O perfil público de teste Aelia (v5, 48 coroas, 55 reservas) foi capturado antes da publicação para conferir a atualização na mesma origem. Ensaios usam campanhas de QA, sem alterar a campanha pessoal do usuário. Emulação não substitui medição em um telefone físico.
