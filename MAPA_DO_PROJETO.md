# MAPA DO PROJETO — GAME IS WAR 3.0 (NEO-BRUTALISM EDITION)

Este documento descreve a arquitetura, o fluxo de execução, a estrutura de estado único e os subsistemas do projeto **Game is War**.

---

## 1. Visão Geral da Arquitetura

O **Game is War** é um Single Page Application (SPA) construído em JavaScript Vanilla com design Neo-Brutalista e layout simulado mobile (centralizado em telas maiores, fluido em dispositivos móveis).

```
+-------------------------------------------------------------+
|                        INDEX.HTML                           |
|  (Dock Nav, Header, Overlays Cinemáticos, Modais e Telas)   |
+-------------------------------------------------------------+
                              |
       +----------------------+----------------------+
       |                                             |
+---------------+                             +---------------+
|    CORE.JS    |                             | MINIGAMES.JS  |
| EventBus      |                             | MiniGameRunner|
| Sandbox       | <==== [window.GIW] ======>  | 16 Minigames  |
| GameStore     |                             | Verdict Motor |
| AudioEngine   |                             | Action Router |
| JuiceManager  |                             +---------------+
| Avatar Forge  |                                     |
+---------------+                                     |
       |                                              |
       +----------------------+-----------------------+
                              |
                     +-----------------+
                     |   STYLE.CSS     |
                     |   STYLE-JUICE   |
                     |  Física Elástica|
                     +-----------------+
```

---

## 2. Telas da Aplicação (`.screen`)

O aplicativo utiliza navegação reativa gerenciada por `appCore.nav(screenId)`. Apenas a tela ativa recebe a classe `.active` (`display: flex;`), enquanto as demais permanecem ocultas.

| ID da Tela | Propósito | Principais Elementos |
| :--- | :--- | :--- |
| `screen-home` | Menu Principal | Showcase de Card Único imersivo com navegação lateral (swipe / setas), Roleta de Sorteio rápido, modal de Catálogo Completo (15 jogos com filtros de categoria), Stack de presença (`#home-presence-stack`), banner de Caos e Streak. |
| `screen-players` | Gestão de Guerreiros | Grade de cartas dos jogadores forjados, botão de Turma Mágica, zerar e encerrar noite. |
| `screen-avatar-builder` | Duolingo Avatar Studio | Palco interativo de preview, abas SVG oficiais, swatches de cores, randomizador e gerador de nomes. |
| `screen-lobby` | Preparação da Partida | Guia interativo rápido de Como Jogar, seletor de tempo/sensibilidade, divisão de equipes e Aposta de Sangue. |
| `screen-game-board` | Tabuleiro do Minigame | Display de pontuação, relógio circular, botão de regras imediatas, loja clandestina e soundboard. |
| `screen-reveal` | Revelação Individual | Cortina de segredo para jogos de passe de mão (Impostor, Duplas, Posições). |
| `screen-vote` | Tribunal da Mesa | Lista de cartas com seleção para eliminação em votação. |
| `screen-verdict` | Veredito Cinemático | Escaneamento biométrico com mira laser, carimbo brutal de Culpado/Inocente e reveal do traidor. |
| `screen-result` | Fim de Rodada | Estante de celebração com avatares, badge de pontos ganhos e atalho de Torneio. |
| `screen-dedo` | Sorteio da Roda | Sensor multi-touch para seleção aleatória de um jogador na mesa. |
| `screen-roleta` | Roleta da Sorte | Seletor giratório de jogos e categorias para o Torneio. |
| `screen-tourney-setup` | Setup do Torneio | Meta de pontos e seleção dos jogos válidos da competição. |
| `screen-podio` | Encerramento da Noite | Pódio do Campeão, Saco de Pancadas e Psicopata da Mesa. |

---

## 3. Estado Centralizado (`window.GIW.store` & `window.GIW.state`)

O estado central reside na classe `GameStore` em `core.js`, com persistência em `localStorage` sob a chave `GIW_STATE_V3`.

```javascript
window.GIW.store = {
    players: [               // Lista de guerreiros forjados
        {
            id: 'p_xxxx',
            name: 'Guerreiro',
            score: 0,
            falhas: 0,
            streak: 0,
            isWanted: false,
            avatarUrl: '...',
            bg: '#fde6d1',
            duoState: { Body: 1, SkinTone: 1, ... },
            stats: { imp: 0, prend: 0 }
        }
    ],
    teams: [],               // Divisão de equipes da rodada
    bench: [],               // Banco de reservas
    currentGameActive: '',   // ID do jogo em execução
    currentEvent: null,      // Evento global (ex: Rodada Dourada 2x)
    isBetting: false,        // Aposta de Sangue ativa (-10 pts para perdedores)
    isMarioKart: false,      // Efeito 2x bônus para quem está perdendo
    isChaos: false,          // Modo Caos (+18 e palavras extremas)
    isEvents: true,          // Eventos dinâmicos habilitados
    isSoundOn: true,         // Controle mestre de som e vibração
    tourneyTarget: 100,      // Pontuação meta do modo torneio
    tournamentMode: false    // Flag se o torneio está ativo
};
```

---

## 4. Núcleos de Infraestrutura

### A. Barramento de Eventos (`EventBus`)
- Instância única em `window.GIW.bus`.
- Desacopla áudio, efeitos visuais (juice), haptics e eventos de estado.
- Principais eventos:
  - `audio:play` — Disparo de sons procedurais (`sfx`, `highTone`).
  - `fx:juice` — Efeitos visuais (`flash`, `confetti`, `crack`).
  - `fx:screenshake` — Tremor de tela (`low`, `medium`, `heavy`).
  - `haptics:trigger` — Vibração física (`tap`, `explosion`, etc.).
  - `state:updated` — Notificação de alteração de dados no store.

### B. Sandbox de Recursos (`ResourceSandbox`)
- Cada jogo roda dentro de uma sandbox segura gerenciada por `MiniGameRunner`.
- Cancela automaticamente todos os `setTimeout`, `setInterval`, listeners de `devicemotion`, animações GSAP e WakeLock ao trocar ou encerrar uma partida.

### C. Motor de Minigames (`MiniGameRunner`)
- Instância em `window.GIW.runner`.
- Loop de tempo de alta precisão via `requestAnimationFrame`.
- Gerencia o ciclo de vida: `launch(gameId)` -> `start()` -> `tick()` -> `action()` -> `complete()`.

---

## 5. Catálogo dos 15 Minigames

1. **O Impostor (`impostor`)**: Caça ao traidor através de palavras secretas com tribunal e votação cinemática.
2. **Duplas (`duplas`)**: Pares com a mesma palavra secreta e infiltrados blefando.
3. **Mistérios (`macabro`)**: Enigmas mórbidos (Dark Stories) com perguntas de sim/não.
4. **Posições (`posicao`)**: Escala de intensidade de 1 a 10 ordenada em equipe.
5. **A Nota (`nota`)**: Dica verbal de intensidade graduada de 1 a 10.
6. **Única Palavra (`unica`)**: Pistas cooperativas onde palavras repetidas são canceladas.
7. **Quem Sou Eu (`quemsoueu`)**: Celular na testa estilo Heads Up com giros para acertar.
8. **Mega Senha (`megasenha`)**: Dicas rápidas de uma palavra em duplas contra o relógio.
9. **Completa (`completa`)**: Painel de 8 palavras abertas por palpites.
10. **Mímica (`mimica`)**: Expressão corporal sem som contra o cronômetro.
11. **Stop de Roda (`stop`)**: Letra aleatória com pavio rápido de 10s.
12. **Se Vira (`sevira`)**: Batata explosiva com tempo decrescente acelerado.
13. **5 Segundos (`cinco`)**: Desafio de falar 3 coisas da categoria em 5 segundos.
14. **Batata Quente (`batata`)**: Sensor de tremor por giroscópio/acelerômetro do celular.
15. **Último a Falar (`ultimo`)**: Eliminação rápida com cronômetro curto de sobrevivência.

---

## 6. Recursos Visuais & Juice (Física AAA)

- **Duolingo SVG Avatar Engine**: Constrói avatares combinando partes oficiais e paletas de cores.
- **Expressões Faciais Reativas**: Avatares reagem automaticamente com caras de pânico no julgamento, deboche na vitória e choro na eliminação.
- **Micro-interações Elásticas**: Transições em `cubic-bezier(0.34, 1.56, 0.64, 1)` para switches, chips de temas, avatares sobrepostos de presença com indicador de líder pulsante (`@keyframes ping`) e arrasto de cartas.
- **Modo Deus (Debug)**: Acessível via tecla `F2` ou botão flutuante `🛠️` para monitoramento e controle total do jogo em tempo real.
