# Kingdom Gods alpha 0.2 — produção e mundo vivo

Objetivo: aprofundar a trajetória pacífica do RPG autorizado pelo prompt mestre, com estado e consequências observáveis. Publicar no mesmo Site público, sem contratar serviços pagos. Multiplayer permanece uma dependência futura.

## Escopo concreto

- Moinho autoral (1260,430) e padaria (1230,1410), com colisões e interação física. Receitas: 2 trigo→1 farinha no moinho; 1 farinha+1 madeira→2 pães na padaria; 3 minério+2 madeira→1 espada na forja. Exigem energia, recursos e proximidade; praticam agricultura/culinária/ferraria.
- Estações no plantio: primavera 2 dias/8 trigo; verão 2/10; outono 3/7; inverno 4/4. Condições e rendimento registrados ao plantar. Casas deixam de criar moedas e pão automaticamente; perdem 3 pontos de condição por dia. Reparar custa 2 madeira+1 pedra e restaura 25 pontos, até 100.
- Lina pode trabalhar na parcela construída por 5 coroas por dia. O salário sai da bolsa e entra na poupança da NPC. Lealdade melhora com pagamento; três dias sem pagamento levam à demissão. Trabalho automático planta e colhe usando sementes reais e prazo da estação, sem produção gratuita. O contrato pertence à propriedade e pode sobreviver à sucessão; termina se a trabalhadora morrer, desaparecer ou se tornar o apóstolo.
- Pedidos opcionais de abastecimento gerados por calendário com orçamento cívico finito. Aceitação exige mural ou mercado; entrega exige mercado e mercadorias reais. Paga uma única vez. Pedidos disponíveis podem ser resolvidos por NPCs no prazo consumindo estoque e orçamento; fracassos afetam prosperidade e preços.
- Produção regional agregada passa a consumir trigo/farinha/madeira em vez de criar pão diretamente. Cultivo primário continua simplificado. Diário e painéis mostram pedidos, receitas, manutenção, salários e registros.
- Snapshots v2 são validados; snapshots v1 válidos migram preservando personagem, moeda, bens, parentes, memórias e tempo. Farinha inicia em zero; competências novas em zero; lavouras antigas conservam o prazo original de dois dias. Campanhas fechadas não avançam.

## Arquitetura e limites

`economy.ts` contém receitas, regras sazonais e operações econômicas; `simulation.ts` coordena intenções/dias/memórias; `persistence.ts` migra antes de validar o formato atual. React e Phaser consomem o mesmo estado. Um pedido por ciclo, uma trabalhadora e uma parcela: sem anúncios de sistemas ainda ausentes.

Verificação: conservação de recursos/moeda, ações inválidas sem mutação, salários e abandono, colheitas por estação, prazos e recompensa única, sucessão, migração de arquivo v1 real, backup corrompido, ações de crafting no navegador e controles mobile.
