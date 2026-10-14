# KINGDOM GODS · alpha 0.1

Primeira versão **local e jogável** de um RPG sandbox medieval, inteiramente em português. Não existe servidor multiplayer nesta versão.

## Executar

```sh
npm ci
npm run dev
```

Abra a URL exibida pelo Vite. Para gerar os arquivos estáticos: `npm run build`. Para verificar as regras: `npm test`. O build em `dist/` pode ser servido por qualquer servidor HTTP estático.

## Jogar

Crie seu apóstolo, escolha uma bênção e converse com Elara. Receba seus pertences, explore o orfanato e caminhe ao portão sul. Depois, escolha seu caminho livremente.

- WASD ou setas: movimento; clique no chão: caminhar.
- E: interação próxima; Espaço ou botão direito: ataque; Shift: esquiva.
- I: inventário; C: atributos; J: diário; R: relações; F: família; P: propriedade; M: mapa.
- 1: equipar espada; 2: comer pão; 3: usar erva. Escape fecha painéis ou pausa.
- No celular, joystick e botões de interação, ataque e esquiva aparecem automaticamente.
- Painéis e diálogos pausam a simulação. Feche-os para continuar o tempo e renovar encontros e recursos.

## Funcionando

Origem órfã com 16 anos; aparência persistente; três bênçãos com efeitos; vila e interiores exploráveis; câmera, colisões e controles de toque; seis NPCs com rotinas e vínculos; inventário, consumo e equipamento; atributos e competências por prática, sem níveis globais; combate contra esqueletos; cripta e missão opcionais; estoque, moeda e preços; coleta, compra de parcela, construção e cultivo; calendário, fome, envelhecimento e morte; memórias emocionais; retirada autônoma diante de perigo e aliados que ajudam com base em amizade; casamento, descendência e árvore navegável; sucessão obrigatória por parceiro ou filhos, com regência para menores; reinício sem vantagens quando a linhagem termina.

Compra, venda, cultivo, missões e relações exigem presença física. Os comerciantes têm estoque e capital. A parcela é única e vinculada ao Reino de Auren: possuí-la não concede soberania.

IndexedDB guarda snapshots versionados e um backup. Há fallback para localStorage, validação de dados, salvamento após ações relevantes e a cada 45 segundos. O botão superior salva manualmente. Limpar os dados do navegador remove a campanha. O mundo não avança quando a página está fechada.

## Simplificações temporárias

Uma região autoral, uma dungeon, uma propriedade e uma missão. A economia representa produção e consumo regionais por regras agregadas; não simula cada elo industrial. A construção é uma casa predefinida, com custo de materiais e renda diária simples. O trigo leva dois dias em todas as estações. Relações usam afinidade, confiança e memórias, sem linguagem gerada por IA. A personalidade possui quatro traços iniciais; a autonomia ocorre em situações determinadas e explicadas. Filhos são gerados após dezesseis dias de casamento, com traços herdados básicos, e o envelhecimento usa um calendário de 360 dias. A tutela restringe combate e acesso à cripta. O relógio pode ser ajustado por `state.timeScale`; controles de teclado são fixos nesta versão.

## Ainda não desenvolvido

Multiplayer real, contas, WebSocket/Colyseus, PostgreSQL, PvP, validação autoritativa remota, justiça criminal, guerras, diplomacia, múltiplos reinos, vassalos/empregados, construção livre, cadeias produtivas completas, genética complexa, patologias detalhadas e simulação offline. Não há jogadores fictícios nem botões que anunciem esses recursos como disponíveis.

## Arquitetura

- `src/types.ts` e `src/data.ts`: contratos e dados autorais.
- `src/simulation.ts`: autoridade local, regras e estado da campanha.
- `src/persistence.ts`: snapshots, validação, recuperação e backups.
- `src/transport.ts`: intenções serializáveis e interface para futura autoridade de servidor; implementação atual local.
- `src/world.ts` e `src/art.ts`: cenas Phaser, câmera, colisões e pixel art determinística.
- `src/App.tsx`, `src/Panels.tsx` e CSS: interface React responsiva, acessível por teclado.
- `tests/simulation.test.ts`: efeitos de bênçãos, invariantes comerciais, cultivo, tempo, morte, sucessão, combate, autonomia e persistência.

Para multiplayer será necessário configurar um servidor Node/Colyseus e PostgreSQL. As intenções do transporte oferecem uma fronteira para essa integração, mas o servidor ainda precisa implementar autenticação, validação, sincronização, propriedade e persistência. O modo local não depende desses serviços.
