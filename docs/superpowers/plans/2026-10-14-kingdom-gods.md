# Kingdom Gods — plano da primeira versão jogável

**Objetivo:** jogo local persistente, físico e explorável, em português, obedecendo à origem órfã e sucessão familiar do pedido.

**Arquitetura:** TypeScript; Phaser 3 desenha o mundo e controles; React apresenta menus e HUD; um GameStore concentra regras determinísticas e eventos; IndexedDB guarda snapshots versionados. Nenhuma conexão multiplayer será anunciada.

**Arquivos:** types.ts e data.ts definem contratos; simulation.ts implementa regras; persistence.ts salva; world.ts e art.ts renderizam e controlam a cena; App.tsx e styles.css apresentam estado e ações; testes verificam economia, morte, sucessão e tempo.

- [x] Núcleo: criação órfã com 16 anos e bênçãos concretas; inventário, prática, tempo e economia com estoques/capital; memórias; famílias e morte irreversível.
- [x] Mundo: vila autoral, orfanato instanciado, cripta, câmera, colisões, teclado/toque, rotinas NPC e combate.
- [x] Interface: identidade medieval verde/flax, criação, diálogo, HUD, inventário, mapa, diário, relações, árvore, parcela, controles mobile.
- [x] Verificação: sem saldo/estoque negativos; reload preserva campanha; menor sucede sob tutela; sem família encerra linhagem; ações exigem proximidade; navegador desktop e mobile.
- [x] Entrega: build executável, documentação de simplificações e publicação se ferramentas suportarem.

**Limites:** política representada por vínculo jurídico da parcela; genealogia inicial; economia regional agregada; não há servidores, contas, PvP ou simulação offline. As dependências futuras ficam atrás de uma interface de transporte.

Verificação executada: 19 testes, TypeScript e build; Chromium desktop, joystick/esquiva mobile, tamanhos 390×500, 390×844 e 844×390; IndexedDB reload e recuperação de backup após corrupção. A publicação usa o Site privado registrado no hosting.json.
