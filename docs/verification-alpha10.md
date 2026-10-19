# Verificação — alpha 0.10

## Escopo

Jogo exclusivamente 3D, financiamento coerente de oportunidades, rotinas noturnas entre edifícios, 13 interiores mobiliados e acessíveis e Terras Altas de Brumavale. Persistência v7 com migração das campanhas anteriores; multiplayer permanece adiado.

## Regras e revisão

- `npm test`: 366 testes aprovados, nenhum falhando, ignorado ou cancelado.
- `npm run build`: TypeScript e Vite aprovados. O aviso de pacotes acima de 500 kB permanece; Three.js é carregado sob demanda e Phaser foi removido.
- `git diff --check`: sem erros.
- Revisão independente encontrou três problemas corrigidos antes da entrega: salvamento imediato após sucessão com aliado na cripta, clique no modelo da casa e acompanhamento de NPC que troca de região. A regressão de sucessão exercita casamento, morte, herança e salvamento/recarregamento reais.
- Testes verificam orçamento e pagamento único, os 13 interiores, móveis e colisões, estações de depósito, novas conexões e recursos, descanso, ciclo de vida gráfico e migrações históricas.
- As 55 reservas anteriores mantêm identificadores e dados. A migração acrescenta 12 reservas das Terras Altas e a região de cada morador; os 22 animais anteriores são preservados.

## Navegador

Chromium com WebGL via SwiftShader, em sete fluxos completos, todos aprovados e sem erros JavaScript:

- Importação de campanha v6 com 237 coroas e sete pães; entrada física na estalagem, caminhada e compra de pão no serviço interno: 229 coroas, oito pães e capital do comerciante de 450 para 458. Salvamento/recarregamento dentro do edifício e saída pela porta correta preservaram os bens.
- Aceitação real do pedido de ervas no dia seis: tesouro de 180 para 142 e 38 coroas reservadas, sem pagamento antecipado ao apóstolo. Sem verba, a oferta aparece como aguardando financiamento e não pode ser aceita.
- Entradas e saídas reais de todos os 13 interiores, com retorno à porta exterior correspondente. O clique no modelo da casa construída também oferece entrada. Dentro do armazém, guardar e retirar madeira mudou inventário de seis para cinco e de volta para seis; depósito de zero para um e de volta para zero.
- Travessia física dos Ermos às Terras Altas; acesso ao alojamento e à capela. Colheita mudou ervas de zero para duas e reserva de cinco para quatro. Mineração mudou minério de nove para 11 e durabilidade de 67 para 64.
- Às 22h, cinco moradores caminharam até portas e chegaram a pontos distintos de repouso nos interiores. Dez animais da vila descansaram sem deslocamento contínuo ou destino oscilante.
- Toque em 390×844 e 844×390: joystick, entrada e saída da estalagem, um canvas e sem transbordamento horizontal.
- Perda real do contexto WebGL apresentou recuperação; nova tentativa recriou o visual 3D sem apagar o estado.

As primeiras tentativas de dois contextos registraram um recurso HTTP 404 no console, sem erro JavaScript ou falha nos fluxos. Correções de sincronização do ensaio (câmera ainda em movimento, seletor de mapa duplicado e espera de importação) estão separadas de alterações no produto. As campanhas usadas são de QA; a campanha pessoal do usuário não foi editada.

## Limites

Interiores são instâncias autorais de um andar, com estações funcionais; a barraca do mercado, o poço e ruínas abertas continuam a céu aberto. Edifícios privados exigem aquisição e construção. A região das Terras Altas é conectada por uma passagem e contém recursos finitos com regeneração. A economia e as rotinas usam simulação local por regras, sem avanço offline. Não há contas, multiplayer ou PvP. Testes com toque emulado e SwiftShader não medem desempenho em telefone físico.

O pacote estático e a atualização na origem pública são conferidos separadamente durante a publicação; seus relatórios operacionais ficam fora da árvore de fontes para manter a correspondência exata entre fonte e artefato.
