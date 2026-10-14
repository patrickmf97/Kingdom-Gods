# KINGDOM GODS · alpha 0.3

Versão **local e jogável** de um RPG sandbox medieval, inteiramente em português. Não existe servidor multiplayer nesta versão.

## Executar

```sh
npm ci
npm run dev
```

Abra a URL exibida pelo Vite. Para gerar os arquivos estáticos: `npm run build`. Para verificar as regras: `npm test`. O build em `dist/` pode ser servido por qualquer servidor HTTP estático.

## Jogar

Crie seu apóstolo, escolha uma bênção e converse com Elara. Receba seus pertences, explore o orfanato e caminhe ao portão sul. Depois, escolha seu caminho livremente.

- WASD ou setas: movimento; clique/toque no chão: caminhar por uma rota que contorna obstáculos.
- Mapa: selecione um local e use **Caminhar até aqui** para ir a pé. Controles manuais e ações cancelam a rota; o mapa não entra automaticamente em interiores.
- E: interação próxima; Espaço ou botão direito: ataque; Shift: esquiva.
- I: inventário; C: atributos; J: diário; R: relações; F: família; P: propriedade; M: mapa.
- 1: equipar espada; 2: comer pão; 3: usar erva. Escape fecha painéis ou pausa.
- No celular, joystick e botões de interação, ataque e esquiva aparecem automaticamente.
- Painéis e diálogos pausam a simulação. Feche-os para continuar o tempo e renovar encontros e recursos.

## Novidades da alpha 0.3

- Colisões compartilhadas pela simulação e cena: paredes, balcões, cercas, troncos, pedra, poço e rio respeitam os pés dos personagens. Esquivas percorrem subpassos, evitando atravessar barreiras; movimento diagonal desliza por paredes.
- Rotas físicas por clique/toque e mapa, com percurso visível, distância e tempo estimado. Caminhos contornam prédios e atravessam o rio pela ponte. Não há teletransporte nem entrada automática da navegação pelo mapa.
- NPCs caminham por rotas válidas, com pontos de encontro espaçados e rótulos por proximidade. A trabalhadora entra na lavoura pela abertura da cerca.
- Solo, plantações, galpão e cercas usam camadas separadas. A moradia construída fica ao lado leste da parcela, sem duplicar o galpão; sua porta continua interativa.
- Salvamentos v1/v2 mantêm progressão e formato v2. Posições antigas dentro de obstáculos são ajustadas para um ponto próximo seguro, sem alterar moeda, inventário, família ou memórias.

## Economia da alpha 0.2

- Moinho e padaria físicos, com oficinas e receitas: 2 trigo → 1 farinha; 1 farinha + 1 madeira → 2 pães; 3 minério + 2 madeira → 1 espada na forja. Produção exige proximidade, ingredientes e energia, e desenvolve competências.
- Cultivo sazonal: primavera 2 dias/8 trigo; verão 2/10; outono 3/7; inverno 4/4. A prática pode melhorar o rendimento registrado ao plantar. Lavouras da versão anterior mantêm seu prazo original.
- Casas perdem 3 pontos de condição por dia. Reparos usam 2 madeira + 1 pedra e restauram 25 pontos. Um tributo de até 2 coroas por dia vai para o orçamento da vila. Casas não criam renda nem pão automaticamente.
- Lina pode trabalhar por 5 coroas diárias. Salários entram na poupança da NPC; pagamentos melhoram lealdade e três dias sem receber levam à demissão e memórias de ressentimento. Uma casa em condição inferior a 25 suspende o cultivo. Plantio e colheita automáticos usam sementes e prazos reais.
- Pedidos opcionais no mural e no mercado têm mercadorias, prazo e orçamento finito. A recompensa é paga uma vez. Moradores podem resolver pedidos ignorados; fracassos reduzem prosperidade e afetam preços.
- Migração automática dos salvamentos v1 para v2, com validação de lavouras, contratos, compromissos e moedas. Personagens, recursos, famílias, memórias e tempo ficam preservados.

## Funcionando

Origem órfã com 16 anos; aparência persistente; três bênçãos com efeitos; vila e interiores exploráveis; câmera, colisões e controles de toque; seis NPCs com rotinas e vínculos; inventário, consumo e equipamento; atributos e competências por prática, sem níveis globais; combate contra esqueletos; cripta e missão opcionais; estoque, moeda e preços; coleta, compra de parcela, construção e cultivo; calendário, fome, envelhecimento e morte; memórias emocionais; retirada autônoma diante de perigo e aliados que ajudam com base em amizade; casamento, descendência e árvore navegável; sucessão obrigatória por parceiro ou filhos, com regência para menores; reinício sem vantagens quando a linhagem termina.

Compra, venda, cultivo, missões e relações exigem presença física. Os comerciantes têm estoque e capital. A parcela é única e vinculada ao Reino de Auren: possuí-la não concede soberania.

IndexedDB guarda snapshots versionados e um backup. Há fallback para localStorage, validação de dados, salvamento após ações relevantes e a cada 45 segundos. O botão superior salva manualmente. Limpar os dados do navegador remove a campanha. O mundo não avança quando a página está fechada.

## Simplificações temporárias

Uma região autoral, uma dungeon, uma propriedade, uma missão da cripta e pedidos rotativos de abastecimento. A economia representa produção e consumo regionais por regras agregadas; não simula cada elo industrial. A construção é uma casa predefinida, com custo de materiais, manutenção e tributo. Há uma trabalhadora contratável e três receitas; os demais ofícios ainda precisam de expansão. Relações usam afinidade, confiança e memórias, sem linguagem gerada por IA. A personalidade possui quatro traços iniciais; a autonomia ocorre em situações determinadas e explicadas. Filhos são gerados após dezesseis dias de casamento, com traços herdados básicos, e o envelhecimento usa um calendário de 360 dias. A tutela restringe combate e acesso à cripta. O relógio pode ser ajustado por `state.timeScale`; controles de teclado são fixos nesta versão. A navegação usa uma grade de busca local, limitada e simplificada em segmentos seguros; personagens podem compartilhar uma trilha, sem bloqueio físico entre suas próprias silhuetas.

## Ainda não desenvolvido

Multiplayer real, contas, WebSocket/Colyseus, PostgreSQL, PvP, validação autoritativa remota, justiça criminal, guerras, diplomacia, múltiplos reinos, vassalos, múltiplos empregados e contratos personalizados, construção livre, cadeias produtivas completas, genética complexa, patologias detalhadas e simulação offline. Não há jogadores fictícios nem botões que anunciem esses recursos como disponíveis.

## Arquitetura

- `src/types.ts` e `src/data.ts`: contratos e dados autorais.
- `src/simulation.ts`: autoridade local, regras e estado da campanha.
- `src/economy.ts`: receitas, plantio sazonal, manutenção, contratos, circulação de moedas e pedidos.
- `src/persistence.ts`: snapshots, validação, recuperação e backups.
- `src/transport.ts`: intenções serializáveis e interface para futura autoridade de servidor; implementação atual local.
- `src/navigation.ts`: geometria física, colisão contínua por subpassos, recuperação de posição e busca limitada de caminhos.
- `src/world.ts` e `src/art.ts`: cenas Phaser, câmera, rotas e pixel art determinística em camadas.
- `src/App.tsx`, `src/Panels.tsx` e CSS: interface React responsiva, acessível por teclado.
- `tests/`: verificações de simulação, economia, invariantes financeiros, contratos e sucessão, migração v1/v2, corrupção, backups, colisões, rotas e recuperação de posições.

Para multiplayer será necessário configurar um servidor Node/Colyseus e PostgreSQL. As intenções do transporte oferecem uma fronteira para essa integração, mas o servidor ainda precisa implementar autenticação, validação, sincronização, propriedade e persistência. O modo local não depende desses serviços.

## Verificação

Execute `npm test` e `npm run build` para verificar regras e compilação. A atualização anterior passou 55 testes e fluxos de produção, contratos e salvamento em Chromium. A alpha 0.3 passou 78 testes, 22 verificações no navegador e o fluxo completo do build estático. O recibo registra colisões, rotas, camadas, controles e recuperação em `docs/verification-alpha03.md`.
