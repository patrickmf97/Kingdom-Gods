# KINGDOM GODS · alpha 0.4

RPG sandbox medieval **local e jogável**, em português, com mundo externo, mineração pacífica e legado familiar. Multiplayer permanece para a última etapa; esta versão não usa contas nem depende de serviços pagos.

## Executar

```sh
npm ci
npm run dev
```

`npm test` verifica as regras; `npm run build` valida TypeScript e gera `dist/`, servido por HTTP estático. A publicação existente usa Sites e mantém a mesma origem para preservar o IndexedDB.

## Começar e explorar

Crie seu apóstolo de 16 anos, escolha uma bênção e receba os pertences de Elara. Caminhe ao portão sul do orfanato. Depois, todas as oportunidades são opcionais.

- WASD ou setas: movimento. Clique/toque no mundo ou escolha **Caminhar até aqui** no mapa para seguir uma rota segura. Movimento manual e ações interrompem a rota.
- E: interagir; Espaço ou botão direito: ataque; Shift: esquiva.
- I: inventário; C: atributos; J: diário; R: relações; F: família; P: propriedade; M: mapa.
- 1: equipar espada; 2: comer pão; 3: usar erva. Escape fecha painéis ou pausa.
- No celular, use joystick, interação, ataque e esquiva. O guia fica no botão de ajustes do cabeçalho.
- Painéis e diálogos pausam a simulação. A página fechada não faz o tempo avançar.

Compre uma **picareta por 28 coroas** no mercado ou na forja. O mapa de Valeverde mostra a **Trilha para os Ermos de Alvor**, ao sudeste. Caminhe até a placa e siga pela estrada. Nos Ermos, localize a Mina do Ferro Antigo, ao nordeste. Caminhe até a entrada e interaja para entrar. O mapa da mina mostra as galerias e os veios. Retorne pela saída e pela estrada de Valeverde quando quiser.

## Novidades da alpha 0.4

- **Ermos de Alvor:** região aberta de 3072×2304 com bosque, estradas, acampamento, ruínas, lago e recursos. **Mina do Ferro Antigo:** mapa de 1280×1120 com galerias conectadas, três veios de ferro e uma área de pedra. Portais exigem presença física; o mapa não teletransporta. A cripta permanece separada e opcional.
- **Ofícios:** machado e picareta têm estoque finito, propriedade e durabilidade. Comprar movimenta moedas para o comerciante. Reparar na forja usa 1 minério, 1 madeira e 3 coroas, restaurando 50 pontos até o limite de 100.
- **Trabalho físico:** extração e coleta duram segundos, exigem energia, capacidade de carga e ferramenta adequada. Conclusão desgasta 3 pontos e desenvolve mineração, lenharia ou herbalismo. Mover, agir ou sofrer dano interrompe o esforço sem entregar recursos. Cargas esgotadas só retornam no dia previsto; trabalho parcial pode continuar após salvar e carregar.
- **Oportunidades:** exploração de quatro marcos, entrega de quatro minérios e entrega de cinco ervas. Há prazo, materiais e recompensa reservada no orçamento existente; pagamento ocorre uma vez. Pedidos ignorados podem ser atendidos com estoque e fundos regionais reais. O diário registra estado e descobertas.
- **NPCs:** fome e fadiga alteram destinos. Moradores caminham ao mercado e compram pão com economias ou verba disponível da vila, protegendo compromissos existentes; descansam na estalagem. Compartilhar pão presencialmente reduz fome e cria gratidão e confiança.
- **Família:** foco educacional, tutor adulto vivo, lições presenciais uma vez por dia com pão e energia, vínculo e prática. Educação influencia o sucessor. Há regente para menores, preferência de herdeiro restrita à família elegível e histórico datado de nascimento, casamento, educação, morte e herança.
- **Campanhas portáveis:** no guia, exporte um JSON ou importe um arquivo após conferir personagem, região, dia e ouro. A importação válida mantém o salvamento anterior como backup; arquivos inválidos não substituem o progresso. A tela inicial também permite importar em um dispositivo novo.
- **Persistência v3:** migrações v1/v2 preservam campanha, extensões válidas, competências, família, moeda e compromissos. Dados atuais incompletos são rejeitados. O relógio continua pausado enquanto você está fora.

## Sistemas anteriores preservados

Três bênçãos com efeitos concretos; atributos e prática sem níveis globais; combate, equipamento, cripta e missão opcional; inventário, consumo, comércio com estoque/capital e preços; moinho, padaria e forja com receitas; cultivo sazonal; propriedade única ligada ao Reino de Auren; construção, reparos, tributo e contrato de Lina; pedidos rotativos de abastecimento; calendário, fome, envelhecimento, ferimentos e morte; memórias, retirada autônoma diante de perigo e amizade que influencia um aliado.

Quando o apóstolo morre, apenas cônjuge ou filhos vivos podem suceder. Um estranho não pode substituir a família elegível. Menores ficam sob regência e não combatem na cripta nem assinam contratos de terra, construção ou emprego; menores de doze anos não entram na mina. Sem família elegível, a linhagem termina e uma campanha nova começa sem os bens anteriores. A preferência de herdeiro não burla essas regras.

## Salvamentos

IndexedDB mantém snapshot atual e backup; localStorage é fallback. O jogo salva após ações relevantes e periodicamente, além do botão manual do cabeçalho. Limpar dados do navegador remove as cópias locais: use **Exportar campanha** para guardar um arquivo ou transferir entre aparelhos. O arquivo tem limite de 2 MiB e é validado antes da importação. Não há sincronização automática entre dispositivos.

## Simplificações e limites

Duas regiões externas autorais (vila e Ermos), dois mapas subterrâneos/interiores de exploração (mina e cripta), além do orfanato. Apenas a região ativa é instanciada; texturas são geradas sob demanda e ficam em cache, e cenários distantes são ocultados. A navegação usa grade de 24 pixels e segmentos seguros, com pés de raio 9 e colisão por subpassos. Personagens respeitam obstáculos estáticos, sem bloqueio mútuo de suas silhuetas.

Há uma propriedade, uma casa predefinida, uma trabalhadora contratável, duas ferramentas, três receitas e três oportunidades iniciais além dos pedidos rotativos e da missão da cripta. A economia representa produção e consumo regionais por regras agregadas. Necessidades de NPCs não causam mortes aleatórias; Elara permanece no orfanato com rotina simplificada. Educação é prática numérica e vínculo, sem escola completa ou simulação de infância minuto a minuto. Descendência usa traços básicos e dezesseis dias entre união e nascimento. O ano tem 360 dias. Não há linguagem gerada por IA; autonomia e relações seguem regras e memórias.

Ainda não há política completa, guerras, múltiplos reinos, construção livre, genética detalhada, doenças complexas, centenas de profissões, contas, simulação offline ou multiplayer/PvP. O multiplayer será desenvolvido depois dos sistemas locais. A campanha é individual: NPCs não são apresentados como jogadores reais.

## Arquitetura

- `types.ts`, `data.ts`: contratos, atributos, itens e dados básicos.
- `regions.ts`, `navigation.ts`: regiões, conexões físicas, marcos, recursos, colisões e rotas.
- `simulation.ts`: autoridade local e integração dos sistemas, sem autoridade remota fictícia.
- `frontier.ts`: ferramentas, trabalho, recursos finitos, descobertas, reservas e oportunidades.
- `life.ts`: necessidades, tutores, educação, regência e registros familiares.
- `economy.ts`: produção, lavouras, manutenção, salários, orçamento e pedidos.
- `persistence.ts`, `campaign-files.ts`: validação, migração v1/v2/v3, backups e intercâmbio de campanhas.
- `world.ts`, `art.ts`, `region-art.ts`: Phaser, profundidade, câmera, culling e pixel art determinística.
- `App.tsx`, `Panels.tsx`, `ExpansionPanels.tsx`: interface React responsiva e ações reais.
- `transport.ts`: intenções serializáveis para a futura integração de servidor.

## Verificação

As regras e a compilação são verificadas por `npm test` e `npm run build`. O recibo de execução da alpha 0.4 fica em `docs/verification-alpha04.md`, com fluxos no navegador e limites da verificação. O recibo da atualização anterior permanece em `docs/verification-alpha03.md`.
