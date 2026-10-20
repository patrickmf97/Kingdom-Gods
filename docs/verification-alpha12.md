# Verificação — alpha 0.12

## Escopo

Personagens tridimensionais com formas, rostos, cabelos, roupas e ferramentas próprias; seis moradores e quatro visitantes adicionais; caravanas presenciais; estradas e lago coerentes com a navegação; céu e horizonte; tempestades com aviso e dano persistente. Modelos, texturas e efeitos originais. Não há dependências novas, contas, servidor fictício ou multiplayer nesta etapa.

## Regras e revisão

- `npm test`: **464 testes aprovados, zero falhas, ignorados ou cancelados**.
- `npm run build`: TypeScript e Vite concluídos. Permanece o aviso de pacotes maiores que 500 kB; Three é carregado sob demanda.
- `git diff --check`: sem erros.
- Revisão independente de integração: sem bloqueios encontrados; 42 testes focados e uma descarga letal real em `GameStore.tick` conferidos pelo revisor.
- Raios usam alvo fixo, anúncio de 3,5 segundos, alcance de 64 pixels e 28 de dano. O aviso é consumido e o recibo gravado antes do dano, inclusive na morte. Pausa, esquiva, afastamento, abrigo e retomada de aviso/recibo possuem regressões diretas na autoridade local.
- Caravanas verificam presença, região, vida, estoque, inventário e moedas antes de qualquer transferência. Compra e venda conservam os totais, geram um lançamento e desenvolvem negociação uma vez. Os dois caixas iniciais consomem apenas a margem numérica disponível; não retiram moeda antiga.
- Visitantes não podem ser cônjuges, tutores ou companheiros da cripta. Sua alimentação consome os pães finitos da viagem. Os novos padeira e moleiro recebem o trabalho remunerado das oficinas existentes, sem duplicar a capacidade regional.

## Continuidade

A validação histórica v7 permanece independente da atual. Migrações v1–v7 para v8 acrescentam o estado novo sem simular tempo offline. A campanha pública anterior, preservada como fixture imutável, mantém apóstolo, 48 coroas, família, inventários, datas, memórias, necessidades e NPCs antigos, 67 reservas e 22 animais. IDs antigos conflitantes prevalecem sobre as novas identidades; uma extensão antiga chamada `worldLife` é arquivada.

Os 81 testes de persistência abrangem corrente e backup, importação/exportação, esquema atual incompleto, limites monetários, colisões de identidade, avisos pendentes, recibos e caixas/estoques/itinerários. A recarga não repõe mercadorias nem causa uma descarga extra.

## Navegação e orçamento visual

Os caminhos são amostrados em intervalos de até dois pixels contra os obstáculos reais, inclusive com propriedades construídas. Água, margem, juncos, mapa e colisão usam o mesmo contorno irregular. As posições históricas da floresta e a aceitação dos habitats dos 22 animais conservam suas impressões digitais de referência.

Humanos usam no máximo oito chamadas visíveis e 2.360 triângulos alocados, incluindo equipamento oculto; as peças compartilham material e textura de 64² por personagem. As regressões verificam variantes, animações, pés, cores e descarte. O céu e o horizonte usam cinco chamadas e 1.968 triângulos, uma chamada acima da versão anterior. A água e a margem mantêm duas chamadas. A apresentação dos raios usa até duas chamadas sem luz ou shadow pass adicional. Decoração não intercepta a seleção.

Uma captura de borda revelou névoa azul opaca demais sobre terreno caminhável. A correção conserva a cor e a iluminação do chão junto ao apóstolo, cobre a lateral da base com uma junção estável e estende a transição atmosférica para fora do limite; não altera colisões. Rótulos priorizam o apóstolo e o alvo de interação e evitam sobreposição em encontros.

## Navegador e limites

Chromium com WebGL via SwiftShader e toque emulado. As preparações usam importação explícita de campanhas de QA; resultados vêm de cliques, teclado, toque e ações reais. Nenhum resultado é concedido por alteração do estado no navegador. A campanha do usuário não é sobrescrita.

Conferidos:

- Uma tela 3D, personagens e roupas distintos, iluminação diurna/entardecer/noturna e lago orgânico, sem erro de execução ou shader nos fluxos examinados.
- Compra e venda presenciais com estoque, dois caixas e lançamentos exatos; negociação remota desabilitada e conservação após salvar/recarregar.
- Os quatro visitantes caminharam através de portas e alcançaram outra região externa com o apóstolo no orfanato. Contagens de parada avançaram somente após chegada; não houve concessão de chegada pelo navegador.
- O lago impediu avanço real dos pés na margem irregular. Três trajetos com caminhos redesenhados foram percorridos por cliques e chegada física.
- Aviso de raio gerado pelo próprio jogo, pausado e salvo/recarregado sem trocar alvo. Para conferir o dano sem ambiguidade da seleção por raio da câmera, uma importação explícita de QA posicionou o apóstolo sobre aquele alvo já gerado, conservando vitalidade, ouro e inventário. A simulação aplicou 28 de dano, de 125 para 97, registrou memória e recibo; recarregar não repetiu o ferimento. Movimento real de teclado saiu da área de outra descarga, e um interior cancelou exposição sem precipitação.
- Toque emulado em 390×844 e 844×390: joystick moveu o apóstolo, ações de comércio mantiveram alvos de pelo menos 44 pixels, painéis não transbordaram e o aviso ativo de tempestade permaneceu dentro da tela.

Ensaios anteriores corrigidos no harness incluem seleção de uma padaria/copa de árvore ao clicar num ponto de solo oculto, que escolhia legitimamente outra rota e/ou abria diálogo pausando o jogo; e uma asserção antiga de margem retangular, substituída pela distância ao polígono real. Esses ensaios não concederam resultados ao jogo. Capturas finais da névoa e recibos de pacote/publicação ficam fora da árvore de fontes.

O conteúdo permanece autoral e limitado a 16 NPCs iniciais e 22 animais, mais os familiares da campanha. Não há população ou mercadorias infinitas. Raios ferem o apóstolo; não há incêndios propagados, dano de raio em NPCs ou trovão sonoro. O céu é procedural; nuvens e precipitação usam lotes limitados. A emulação não comprova 60 FPS em telefone físico.

O pacote e a continuidade na origem pública são conferidos separadamente. Recibos operacionais, capturas e hashes permanecem fora da árvore para preservar a correspondência entre o commit publicado e o artefato.
