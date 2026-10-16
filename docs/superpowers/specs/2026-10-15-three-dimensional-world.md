# KINGDOM GODS 3D · alpha 0.6

O usuário aprovou a conversão para ver como fica jogável. Entregar modelos tridimensionais leves, câmera elevada, iluminação e animações, preservando os sistemas, coordenadas, cinco regiões e campanhas da alpha 0.5. Publicar no mesmo endereço. Multiplayer continua por último.

Three.js substitui a apresentação padrão. A interface React e a autoridade GameStore permanecem; apenas o renderizador ativo avança a simulação. Converter coordenadas lógicas (x,y) para (X,Z), na escala 1/24, mantendo colisões, objetos e portais existentes. Chão inicialmente plano: sem saltos, múltiplos andares ou navegação vertical. O esquema de campanha continua v4.

Todos os mapas são jogáveis: vila, Ermos, mina, cripta e orfanato. Casas, árvores, estradas, ponte, água, recursos, terras, armazém/abrigo e personagens têm geometria 3D. Aparência do apóstolo usa as cores salvas. Mostrar movimento, trabalho, espada e ataques com animações simples. Seleção por raio do mouse/toque respeita o chão e os mesmos alvos/interações; o mapa continua oferecendo rotas seguras. WASD, setas, joystick, ataque, esquiva e interação continuam reais.

Câmera elevada acompanha o apóstolo; permitir zoom e rotação limitada com controles acessíveis. Direções de movimento acompanham a câmera. Preservar contraste, leitura da interface, visibilidade do apóstolo e acessos. Instanciar árvores, limitar resolução de renderização, reutilizar geometria/materiais, carregar somente a região atual e liberar recursos ao trocar de mapa/renderizador. Sombras simples e iluminação ajustada ao calendário. Não prometer 60 FPS sem medir em dispositivo real.

Disponibilizar troca para o visual 2D existente, separada dos salvamentos e carregada sob demanda, incluindo fallback honesto se WebGL falhar. Nenhuma campanha é reiniciada ao mudar o visual. Versão 3D tem identidade visível; o criador, painéis e mapa podem continuar em 2D. Sem serviços externos, modelos pagos ou novos sistemas de simulação.

Verificar as regras antigas, coordenadas e entrada relativa à câmera; integração com teclado/toque, portas, paredes, ponte, compras, extração, combate, construção, passagem de tempo e save/reload. Testar troca 2D/3D sem relógio duplicado ou handlers vazando. Conferir o pacote estático e a campanha pública retida antes/depois.
