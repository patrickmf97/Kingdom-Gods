# Three-Dimensional World Implementation Plan

> Execução solicitada pelo usuário; tarefas isoladas por arquivos, integração e publicação pela raiz.

**Goal:** Entregar uma conversão 3D jogável das cinco regiões com campanhas preservadas.

**Architecture:** Renderizador Three.js por trás de `mountWorld/worldInput`; GameStore mantém toda a autoridade. Coordenadas lógicas e colisões são compartilhadas, sem alteração do formato v4. Renderizador 2D anterior permanece disponível sob demanda.

**Tech Stack:** TypeScript, Three.js, React, Phaser (fallback), IndexedDB e Vite.

**Spec:** `docs/superpowers/specs/2026-10-15-three-dimensional-world.md`

## Global Constraints

- Campanhas v1/v2/v3/v4 permanecem compatíveis; nenhum reset.
- Apenas um renderizador e um relógio ativos.
- Todas as cinco regiões e suas interações continuam acessíveis.
- Coordenadas (x,y) mapeiam para (X,Z) em escala 1/24; sem navegação vertical.
- Sem serviços pagos ou multiplayer nesta entrega.

## Review Focus

- Trocas rápidas de renderizador ou região não criam simulações ou listeners duplicados.
- Projeção do mouse e rotação da câmera não permitem atravessar sólidos.
- Modelos e telhados não escondem portas ou o personagem controlável.
- Controles de toque e câmera não se sobrepõem a inventário, mapa ou joystick.
- Recarregar ou migrar uma campanha preserva ouro, vínculos, trabalho e propriedade.

### Task 1: Adaptador e controle 3D

Files: `src/world.ts`, `src/world2d.ts`, `src/world-input.ts`, `src/three/coordinates.ts`, `src/three/world3d.ts`, `tests/three-controls.test.ts`.

- [x] Testar conversões reversíveis de coordenadas e direções relativas à câmera.
- [x] Isolar entrada compartilhada e carregar somente o renderizador escolhido.
- [x] Implementar câmera, projeção de clique, rotas, ciclo de vida, efeitos e relógio único.

### Task 2: Cenários e personagens

Files: `src/three/environment.ts`, `src/three/characters.ts`.

- [x] Criar ambientes das cinco regiões com bases alinhadas à colisão autoral.
- [x] Desenhar construções dinâmicas, lavoura, recursos, água e árvores instanciadas.
- [x] Criar apóstolo/NPCs/esqueletos com aparência salva, passos, trabalho e combate.
- [x] Liberar todos os recursos e preservar visibilidade dos acessos e do apóstolo.

### Task 3: Interface, verificação e publicação

Files: `src/App.tsx`, `src/Panels.tsx`, `src/three.css`, `README.md`, `docs/verification-alpha06.md`.

- [x] Expor o modo 3D/2D e câmera com controles responsivos reais.
- [x] Verificar teclado, mouse, toque, cinco regiões, comércio, extração, combate e salvamento no navegador.
- [x] Executar testes, build e revisão independente; corrigir achados.
- [ ] Publicar a fonte exata e verificar acesso público e campanha antiga.

A publicação e a conferência pública são as últimas operações; os retornos das ferramentas registram sua conclusão após este plano ser enviado com a fonte exata.
