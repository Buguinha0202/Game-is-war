# PLAN.md — Plano Estratégico & Arquitetura

## 1. Visão do Produto
**Game is War** é um Party Game interativo mobile-first para jogar em roda de amigos com um único celular passando de mão em mão. Combina blefe, dedução, velocidade mental e adrenalina social com estética minimalista de estúdio (Studio Clean / Dark Mode).

---

## 2. Pilares Técnicos & Convenções
- **Estado Único Centralizado (`store` / `appState`)**: Todo o estado da aplicação é reativo, previsível e persistido via `localStorage`.
- **Zero Poluição de Debug**: Interface 100% limpa para o jogador final, sem botões flutuantes ou ruídos visuais.
- **Game Feel & Física Tátil**: Áudio procedural via Web Audio API, animações elásticas GSAP e feedback háptico (`navigator.vibrate`).
- **Segurança & Hooks**: `.env` estritamente bloqueado via pre-commit hook; notificações de conclusão via scripts de sistema.

---

## 3. Fases de Execução

### ✅ Fase 1 — Redesign e Despoluição do Core
- [x] Home Hub: substituição do carrossel estilo Tinder por Grid 2 colunas escaneável.
- [x] Barra Superior Fixa: header e filtros integrados com vidro fosco translúcido.
- [x] TabBar Inferior: ícones vetoriais estilo Lucide com micro-labels.
- [x] Lobby de Jogo: remoção de banners gigantes, adição de controles segmentados in-app (Tempo de Discussão/Rodada).
- [x] Modal de Regras: formato 3 passos objetivos (1 frase cada) acessível pelo ícone 📖.
- [x] Remoção completa do Modo Deus / painel F2.

### ✅ Fase 2 — Arena de Jogo & Revelação Secreta
- [x] **Tela de Revelação (`#screen-reveal`)**: carta 2.5D com física de deck de estúdio, animação de lift/squash GSAP, som procedural em camadas (card_lift/card_snap) e transição de deslize entre jogadores.
- [x] **Mesa de Partida (`#screen-game-board`)**: anel de cronômetro circular em SVG (`stroke-dashoffset`), pulso orgânico de pânico na bomba com partículas de faísca e dock flutuante de soundboard com efeito de vidro fosco.

### ✅ Fase 3 — Julgamento, Veredito & Resultados
- [x] **Tribunal da Mesa (`#screen-vote`)**: cartões entram escalonados, o toque carimba "ACUSADO!" (squash + som + vibração), os demais escurecem e o veredito abre 650ms depois.
- [x] **Veredito Cinemático (`#screen-verdict`)**: mira e laser removidos; holofote suave + batimento cardíaco; cor do holofote indica o resultado (verde = culpado pego, magenta = inocente eliminado).
- [x] **Fim de Rodada (`#screen-result`)**: contagem animada dos pontos (0 → N) com som de moeda ao finalizar.

### ✅ Fase 4 — Modo Torneio & Polish Geral
- [x] Transição rápida entre minigames sorteados com Roleta Arcade (estilo Supercell/Apple), ticker sonoro procedural rítmico, cards com emojis 3D e botão instantâneo "Pular Animação ⏩".
- [x] Auditoria final de performance e acessibilidade mobile: conformidade com Safe Areas iOS (`env(safe-area-inset-top)` e `env(safe-area-inset-bottom)`), tap targets $\ge 44$px nos botões de navegação, zero overflow horizontal em todas as telas e limpeza completa de CSS legado.
