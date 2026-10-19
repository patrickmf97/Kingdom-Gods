# Weather and Daily Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute checks below and preserve the existing campaign.

**Goal:** Melhorar preparação, ambiente e economia cotidiana na alpha0.11.
**Architecture:** Clima puro compartilhado entre simulação e apresentação. Regras de trabalho/produção e descanso continuam na autoridade local; Three e React somente apresentam e enviam ações.
**Tech Stack:** TypeScript, React19, Three.js, Vite, testes Node/tsx, IndexedDB.
**Spec:** docs/superpowers/specs/2026-10-19-weather-and-daily-life.md

## Global Constraints

Save v7; sem novas dependências; multiplayer por último; dia1limpo; coleta externa na chuva80%; reposição externa capacidade−1; lotes1–10; estalagem8coroas transferidas; casa condição>=25. Não alterar colheitas salvas, moedas, reservas, flora ou fauna ao carregar. Mesma origem pública.

## Review Focus

- Pausa e carregamento não mudam o clima nem movimentam partículas.
- Coleta interrompida ou salva nunca cobra ferramenta/produção duas vezes.
- Lotes falsificados/remotos não consomem itens nem geram produtos.
- Descanso que cruza data aplica custos/vencimentos uma vez e para na morte.
- Recursos visuais são liberados e nunca interceptam caminhada/toque.

### Task 1: Clima, coleta e produção

Files: criar src/weather.ts; modificar src/frontier.ts e src/economy.ts; testes weather/weather-economy/crafting-batches.
Interfaces: weatherFor e weatherForecast conforme spec; crafting preserva craft:recipe e aceita craft:recipe:count.
- [x] Testes determinismo/estações/abrigo, coleta chuvosa e mina, abastecimento/moedas, lotes inválidos/remotos/insuficientes.
- [x] Registrar falha relevante, implementar perfil e regras, executar testes focados.
- [x] Rever invariantes monetárias e salvamento de trabalho existente.

### Task 2: Acabamento visual e atmosfera

Files: novos three/landscape-finish.ts e three/weather.ts; modificar environment/world3d/horizon/effects/materials se necessário.
Interfaces: consumir WeatherSnapshot sem mudar estado; camada com group/update/dispose; horas e animação vindas do relógio existente.
- [ ] Testar orçamento, não interação, esgotamento, descarte e estado preservado.
- [ ] Implementar sombras/solo, perfil de luz, nuvens/chuva/neblina e partículas das Terras Altas.
- [ ] Verificar capturas claras/chuva/amanhecer/noite e pausa, interiores sem precipitação.

### Task 3: UI de preparação e produção

Files: WeatherPanel.tsx, App.tsx, Panels.tsx, style existente.
Interfaces: weatherFor/Forecast; crafting count; restPreview de Task4.
- [x] Expor previsão hoje+2, efeitos atuais e contraste legível no toque.
- [x] Quantidade1–10 nas receitas com custos/saídas e validações reais.
- [x] Estado doméstico e informação de descanso sem sobrecarregar HUD.

### Task 4: Descanso, hospedagem e cama doméstica

Files: rest.ts, simulation.ts, interiors.ts se estação extra necessária, testes rest-integration.
Interfaces: restPreview(state,hours) retorna dia/horário/viradas/provisões; autoridade usa uma função de avanço para todos descansos.
- [x] Testar hospedagem transferida/registrada uma vez, proximidade, custo, casa condição>=25, virada e morte.
- [x] Unificar avanço e oferecer descanso doméstico na estação interna home-bed; diálogo com prévia.
- [ ] Confirmar campos antigos e processos de virada sem duplicação.

### Task 5: Integração, revisão e publicação

- [ ] Testes completos, build, diffcheck e revisão independente.
- [ ] QA real desktop/mobile e campanha antiga; corrigir falhas observadas.
- [ ] Documentar fatos e limites, versão0.11.0, fonte push/artefato exatos.
- [ ] Publicar Site existente, verificar pacote público e continuidade.
