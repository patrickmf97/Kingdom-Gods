# Verificação · alpha 0.6 · mundo 3D · 16/10/2026

## Entrega

Apresentação Three.js com modelos volumétricos, câmera elevada, iluminação e animações simples para vila, Ermos, mina, cripta e orfanato. React mantém a interface; GameStore mantém as regras. O formato v4, coordenadas, entidades e campanhas não mudaram. Phaser continua disponível como visual 2D carregado sob demanda.

## Testes e revisão

- `npm test`: 208 testes aprovados, nenhuma falha.
- TypeScript aprovado.
- Testes novos: modelos e cores salvas, equipamento/animação, cinco ambientes, geometria finita, pisos e paredes da mina ao longo das rotas reais, atualização de lavoura/prédios/recursos e descarte de buffers/materiais; conversões de coordenadas, câmera, autonomia expirada e ciclo dos renderizadores.
- Revisão independente identificou e confirmou correções de perda de contexto WebGL, captura de falhas de renderização assíncronas e montagem tardia do Phaser após uma troca rápida. Sem bloqueio restante após reexecução dos casos.

## Navegador real

Chromium com Three.js/WebGL real, usando SwiftShader no ambiente de teste. Desktop 1440×900 e telas móveis emuladas 390×844 e 844×390, com entrada de toque real via protocolo do navegador. Isso verifica funcionalidade e layout; não mede desempenho de um telefone físico.

- Campanha nova: criar órfão de 16 anos, receber pertences, caminhar pela saída do orfanato e entrar na vila 3D. Comprar picareta por 28, reservar tarefa de 52, percorrer vila/Ermos/mina fisicamente, extrair quatro minérios em duas ações, retornar e entregar: 72 ouro, minério entregue, depósito de recompensa zerado, durabilidade 94. Salvar, recarregar e exportar mantiveram o resultado.
- Cripta: combate real por Espaço derrotou inimigo, concedendo oito ouro e um minério conforme as regras existentes.
- Terreno: registro por 80, obra com oito madeiras/quatro pedras e armazém volumétrico, atualização visual, salvamento, recarga e base sólida.
- Celular: joystick, seleção do chão por raio, botões de câmera, aproximação/rotação, mapa, troca 2D/3D, um único canvas, pausa e ausência de transbordamento horizontal. Botão de câmera e paleta têm alvos de 44 px.
- Relógio: medições de tempo simulado antes/depois de 3D→2D→3D ficaram abaixo de seis minutos por segundo real, sem duplicação; pausa e troca congelam a simulação.
- Perda real de contexto por `WEBGL_lose_context`: 3D removido, fallback 2D automático, aviso honesto, preferência atualizada e ouro/inventário/propriedades preservados. Retorno ao 3D funcionou.
- Decodificação inicial de quatro imagens Phaser atrasada em 1,5 segundo: troca imediata de volta ao 3D deixou um canvas, callbacks corretos e interação/navegação funcionando após o boot antigo. A cena descartada não reassume os controles.
- Nenhum erro de execução nos fluxos finais.

Um clique proporcional usado inicialmente no teste móvel atingiu o telhado de uma propriedade e iniciou corretamente uma interação ao chegar; isso interrompeu a paleta de câmera como previsto. O teste passou a projetar um ponto conhecido do chão e a cancelar a rota com o joystick antes de verificar a câmera. Uma segunda tentativa com seletor de teste mal escapado foi corrigida no script. Nenhum desses casos era falha do produto.

Fixtures sintéticas foram usadas apenas para isolar combate, terrenos, aparelhos e falhas gráficas; foram identificadas nos relatórios. O percurso principal nasceu do criador real e não recebeu alterações de posição ou resultados durante as ações. Scripts, JSON e capturas estão em `/workspace/scratch/kg-alpha06-*`.

## Compilação e publicação

O pacote estático de produção foi conferido por HTTP local: Three.js 3D, extração real de dois minérios, câmera, salvar e recarregar aprovados; 72 ouro, durabilidade 91 e uma carga restante no veio. Sem erros de execução. A compilação TypeScript/Vite passou, com os renderizadores em arquivos separados carregados sob demanda. A fonte exata validada é enviada ao repositório e arquivada; Sites mantém o projeto público e a mesma origem. Os retornos das ferramentas registram a publicação e a verificação anônima do pacote, além da campanha pública retida desde versões anteriores.

## Limites

3D estilizado com modelos gerados no código, chão plano, animações simples e construções de posição fixa. Criador, painéis e mapa permanecem 2D. Sem saltos, navegação vertical ou múltiplos andares. Uma região ativa, árvores instanciadas, resolução limitada e sombras de contato simples; taxa de quadros depende do aparelho. Requer WebGL2 para o 3D, com visual 2D disponível. Sem contas, sincronização automática, backend ou multiplayer nesta entrega.
