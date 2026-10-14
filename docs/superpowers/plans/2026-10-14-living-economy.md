# Living Economy Implementation Plan

**Goal:** publicar alpha 0.2 com produção, contratação e pedidos opcionais reais, preservando campanhas.
**Architecture:** módulos econômicos puros integrados ao GameStore existente; snapshots v2 com migração v1; Phaser e React mantêm a autoridade local única.
**Tech Stack:** TypeScript, Phaser, React, IndexedDB, Vite.
**Spec:** ../specs/2026-10-14-living-economy-design.md

## Global constraints

Português; sem níveis globais; origem e sucessão preservadas; nenhuma simulação offline; acesso público atual preservado; sem novos serviços pagos ou multiplayer fictício.

## Tasks

- [x] Regras: criar economy.ts com `RECIPES`, `cropProfile(day)`, `createEconomyState(day,plantedAt?)`; integrar GameStore act/dias/diálogos; escrever testes de conservação, estações, contratos, pedidos e sucessão antes da implementação.
- [x] Migração: persistence.ts reconhece v1, migra para v2 e valida campos novos; testes rejeitam valores corrompidos e preservam campanha real v1, lavoura antiga e backup.
- [x] Interface: crafting, propriedade, relações, mercado e diário representam estado e requisitos reais; ícone farinha; nenhuma moeda gratuita anunciada.
- [x] Mundo: moinho/padaria, colisões, animação leve e aparência sazonal; aproveitar NPC existente como trabalhadora sem duplicatas.
- [x] Integração: HUD alpha0.2, registros, documentação, testes completos e QA desktop/mobile. O pacote validado será publicado no mesmo projeto público.

## Review focus

Não duplicar recompensas; não retirar sementes/salário de tentativas inválidas; migração não apagar bens; mão de obra não duplicar NPC após sucessão; intervalos de múltiplos dias equivalem ao processamento diário; prazo não avança offline ou em painel pausado.

Verificação executada: 55 testes e build passaram; Chromium desktop com ciclo completo de produção/contrato/pedido/salvamento, toque e joystick em três tamanhos e migração IndexedDB de snapshot real da versão pública anterior. Sem serviços pagos adicionais; audiência pública preservada.
