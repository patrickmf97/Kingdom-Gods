# Verificação · alpha 0.5 · 15/10/2026

## Escopo

Terrenos finitos nos Ermos, armazém/abrigo, depósitos, manutenção, tributos, dívida, influência e carta de Auren. Sucessão familiar e migração de campanhas preservadas. Sem contas, backend ou multiplayer.

## Regras e compilação

- `npm test`: **178 testes, 178 aprovados, 0 falhas**.
- `npm run build`: TypeScript e Vite aprovados. O aviso de bundle grande permanece pela dependência Phaser; não é falha de compilação.
- `git diff --check`: sem erros de espaços ou conflitos.
- Revisão independente dos módulos e casos de moeda, repetição de ações, herança, migração e geometria: sem falhas bloqueantes.
- Navegação: seis testes novos verificam acesso aos dois terrenos, ida/volta do acampamento e da mina, paredes em movimento/esquiva, cache antes/depois da obra, recuperação de posições e isolamento por região.
- Persistência: validação v4 rigorosa, migração de v1/v2/v3, mercadorias, compromissos, trabalhos em andamento, exportação/importação e backup. Terrenos inválidos ou depósitos excedendo 120 de peso são rejeitados.

## Navegador

Chromium real em desktop 1440×900, celular 390×844 e paisagem 844×390. Campanhas sintéticas identificadas como fixtures forneceram ouro e materiais para testar a etapa sem obrigar horas de coleta; ações depois da importação usaram interface, mapa, teclado e toque, sem alterar posição ou resultados no estado.

- Importação de campanha v3 e migração para v4.
- Caminhada até a placa, registro de 80 ouro transferido ao fundo cívico, construção com 8 madeiras/4 pedras/10 energia.
- Depósito de cinco e retirada de uma unidade; salvar, recarregar e exportar mantêm os bens e a posse.
- Caminhadas por mapa contornam bases construídas; teclado e joystick verificam a base sólida. Sem transposição de paredes.
- Segunda posse bloqueada sem carta. Cenário separado: retirada permitida em depósito danificado/com dívida, caminhada ao mural, pagamento de sete coroas, registro da carta por 60, título e segundo terreno por 120. Transferências preservam moedas.
- Abrigo: descanso das 22h às 02h do dia seguinte, uma madeira e refeição diária consumidas, energia recuperada, cura de 20 mais oito da refeição, um tributo pago e condição 100→98. Salvamento e recarga preservam o resultado.
- Corrigida sobreposição do rodapé sobre a importação na tela inicial em paisagem. Cliques reais de importar/cancelar, criar/voltar, guia e campanha existente passaram nas três dimensões.
- Parcelas usam clareiras locais; comparação com a alpha 0.4 confirmou 20 árvores removidas e 295 preservadas sem mudar coordenadas/aparência. Legenda próxima não encobre o apóstolo.
- Pacote de produção servido por HTTP estático: compra, construção, depósito/retirada, colisão física em Y=1684,17 e salvar/recarregar aprovados, com 420 ouro, 208 no tesouro e quatro madeiras guardadas.
- Sem erros de execução ou transbordamento horizontal nos fluxos finais.

Scripts, JSON e capturas de verificação estão em `/workspace/scratch/kg-alpha05-*`. Não fazem parte da campanha do usuário. A primeira checagem com tempo fixo de movimento foi substituída por contato efetivo com a parede para evitar conclusão falsa em renderização lenta do navegador de teste.

## Publicação

A publicação utiliza o projeto público existente, preservando a origem do IndexedDB. O código exato testado é enviado ao repositório antes de salvar e publicar a versão. O resultado da publicação e a conferência anônima online são registrados pelos retornos das ferramentas desta sessão. A campanha de teste retida desde versões anteriores é comparada antes/depois da atualização sem reiniciar a linhagem.

## Limites

Dois terrenos adicionais, uma implantação fixa por terreno, duas construções e um grau de reconhecimento local. Não há posicionamento livre, vassalagem, guerras, fundação de reino ou multiplayer/PvP. Dados permanecem por navegador; exportação transfere a campanha manualmente entre dispositivos. A economia e as rotinas continuam agregadas fora da região ativa.
