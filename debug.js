/**
 * Game is War 3.0 - Painel Modo Deus (God Mode / Debug Console)
 * Ferramenta avançada para inspeção ao vivo e testes rápidos de mecânicas.
 * Abre com a tecla F2, Ctrl+Shift+D ou clicando no botão flutuante 🛠️.
 */

(function() {
    'use strict';

    // Cria e injeta o HTML e estilos do Painel Modo Deus
    const styleEl = document.createElement('style');
    styleEl.id = 'god-mode-styles';
    styleEl.textContent = `
        /* Gatilho Flutuante Modo Deus */
        #god-mode-trigger {
            position: fixed;
            bottom: 74px;
            left: 12px;
            z-index: 9999;
            background: rgba(16, 16, 24, 0.9);
            backdrop-filter: blur(8px);
            border: 2px solid var(--pop-yellow);
            color: var(--pop-yellow);
            font-family: 'Rubik', sans-serif;
            font-size: 0.75em;
            font-weight: 900;
            padding: 5px 10px;
            border-radius: 20px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            gap: 6px;
            user-select: none;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
            opacity: 0.85;
            -webkit-tap-highlight-color: transparent;
        }
        #god-mode-trigger:hover {
            transform: scale(1.08);
            opacity: 1;
        }
        #god-mode-trigger:active {
            transform: scale(0.92);
        }

        /* Janela do Console Modo Deus */
        #god-mode-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.92);
            width: 94%;
            max-width: 440px;
            max-height: 86vh;
            background: #0d0e17;
            border: 3px solid var(--pop-yellow);
            border-radius: 18px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.85), 6px 6px 0 var(--ink-black);
            z-index: 10001;
            display: none;
            flex-direction: column;
            overflow: hidden;
            font-family: 'Rubik', sans-serif;
            color: #ffffff;
            opacity: 0;
            transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
        }
        #god-mode-panel.active {
            display: flex;
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
        }

        /* Overlay semi-transparente de fundo */
        #god-mode-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: none;
        }
        #god-mode-backdrop.active {
            display: block;
        }

        /* Header do Console */
        .gmode-header {
            background: #161726;
            padding: 10px 14px;
            border-bottom: 2px solid var(--ink-black);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .gmode-title {
            font-size: 0.95em;
            font-weight: 900;
            color: var(--pop-yellow);
            display: flex;
            align-items: center;
            gap: 6px;
            letter-spacing: 0.5px;
        }
        .gmode-status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4cd08a;
            box-shadow: 0 0 8px #4cd08a;
            display: inline-block;
        }
        .gmode-close-btn {
            background: var(--pop-magenta);
            border: 2px solid var(--ink-black);
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8em;
            font-weight: 900;
            cursor: pointer;
        }

        /* Abas de Navegação Interna */
        .gmode-tabs {
            display: flex;
            background: #12131f;
            border-bottom: 2px solid var(--ink-black);
            overflow-x: auto;
        }
        .gmode-tab {
            flex: 1;
            padding: 8px 6px;
            text-align: center;
            font-size: 0.72em;
            font-weight: 900;
            color: var(--ink-muted);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            white-space: nowrap;
            transition: color 0.15s, background 0.15s;
        }
        .gmode-tab:hover {
            color: #ffffff;
        }
        .gmode-tab.active {
            color: var(--pop-cyan);
            border-bottom-color: var(--pop-cyan);
            background: rgba(0, 229, 255, 0.08);
        }

        /* Conteúdo das Abas */
        .gmode-body {
            padding: 12px;
            overflow-y: auto;
            flex-grow: 1;
            font-size: 0.85em;
        }
        .gmode-view {
            display: none;
            flex-direction: column;
            gap: 10px;
        }
        .gmode-view.active {
            display: flex;
        }

        /* Caixas de Inspetor e Status */
        .gmode-card {
            background: #181928;
            border: 1.5px solid #282a3d;
            border-radius: 10px;
            padding: 10px;
        }
        .gmode-card-title {
            font-size: 0.75em;
            font-weight: 900;
            color: var(--pop-cyan);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 6px;
        }
        .gmode-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.82em;
            padding: 3px 0;
            border-bottom: 1px dashed rgba(255,255,255,0.06);
        }
        .gmode-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 900;
            font-size: 0.8em;
            background: #25283d;
            color: #ffffff;
        }
        .gmode-badge.highlight {
            background: var(--pop-yellow);
            color: #000000;
        }
        .gmode-badge.danger {
            background: var(--pop-magenta);
            color: #ffffff;
        }

        /* Grade de Botões de Ação */
        .gmode-btn-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
        }
        .gmode-btn {
            background: #25273c;
            border: 1.5px solid #3d405b;
            color: #ffffff;
            font-family: inherit;
            font-size: 0.78em;
            font-weight: 800;
            padding: 7px 6px;
            border-radius: 8px;
            cursor: pointer;
            text-align: center;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: transform 0.12s, background 0.12s, border-color 0.12s;
        }
        .gmode-btn:hover {
            background: #343753;
            border-color: var(--pop-yellow);
        }
        .gmode-btn:active {
            transform: scale(0.95);
        }
        .gmode-btn.cyan {
            border-color: var(--pop-cyan);
            color: var(--pop-cyan);
        }
        .gmode-btn.yellow {
            border-color: var(--pop-yellow);
            color: var(--pop-yellow);
        }
        .gmode-btn.magenta {
            border-color: var(--pop-magenta);
            color: var(--pop-magenta);
        }
        .gmode-btn.green {
            border-color: var(--pop-green);
            color: var(--pop-green);
        }
    `;
    document.head.appendChild(styleEl);

    // Cria os elementos do painel no DOM
    const backdrop = document.createElement('div');
    backdrop.id = 'god-mode-backdrop';
    document.body.appendChild(backdrop);

    const trigger = document.createElement('div');
    trigger.id = 'god-mode-trigger';
    trigger.innerHTML = '🛠️ MODO DEUS <span style="opacity:0.6; font-size:0.8em;">(F2)</span>';
    document.body.appendChild(trigger);

    const panel = document.createElement('div');
    panel.id = 'god-mode-panel';
    panel.innerHTML = `
        <div class="gmode-header">
            <div class="gmode-title">
                <span class="gmode-status-dot"></span>
                <span>MODO DEUS // CHEAT CONSOLE</span>
            </div>
            <button class="gmode-close-btn" id="gmode-close" title="Fechar (F2)">✕</button>
        </div>
        <div class="gmode-tabs">
            <div class="gmode-tab active" data-tab="status">📊 Status</div>
            <div class="gmode-tab" data-tab="partida">🎮 Partida</div>
            <div class="gmode-tab" data-tab="teleporte">🚀 Telas</div>
            <div class="gmode-tab" data-tab="jogadores">👥 Cheats</div>
            <div class="gmode-tab" data-tab="juice">🎉 Efeitos</div>
        </div>
        <div class="gmode-body">
            <!-- TAB 1: STATUS AO VIVO -->
            <div class="gmode-view active" id="gview-status">
                <div class="gmode-card">
                    <div class="gmode-card-title">Monitor em Tempo Real</div>
                    <div class="gmode-row"><span>Tela Ativa:</span> <span id="gm-stat-screen" class="gmode-badge highlight">--</span></div>
                    <div class="gmode-row"><span>Jogo Atual:</span> <span id="gm-stat-game" class="gmode-badge">Nenhum</span></div>
                    <div class="gmode-row"><span>Fase da Partida:</span> <span id="gm-stat-phase" class="gmode-badge">Inativo</span></div>
                    <div class="gmode-row"><span>Tempo Restante:</span> <span id="gm-stat-time" class="gmode-badge">--</span></div>
                    <div class="gmode-row"><span>Guerreiros:</span> <span id="gm-stat-players" class="gmode-badge">0</span></div>
                    <div class="gmode-row"><span>Líder da Mesa:</span> <span id="gm-stat-leader" class="gmode-badge highlight">Nenhum</span></div>
                    <div class="gmode-row"><span>Procurado (Bounty):</span> <span id="gm-stat-wanted" class="gmode-badge danger">Nenhum</span></div>
                </div>
                <div class="gmode-card">
                    <div class="gmode-card-title">Modificadores Globais</div>
                    <div class="gmode-btn-grid">
                        <button class="gmode-btn yellow" id="gm-mod-mario">🍄 Mario Kart</button>
                        <button class="gmode-btn magenta" id="gm-mod-chaos">🌀 Modo Caos</button>
                        <button class="gmode-btn cyan" id="gm-mod-events">⚡ Eventos 2x</button>
                        <button class="gmode-btn green" id="gm-mod-sound">🔊 Áudio/Vib</button>
                        <button class="gmode-btn yellow" id="gm-mod-roles" style="grid-column: span 2;">🤡 Papéis Extras (Bobo/Sabotador)</button>
                    </div>
                </div>
            </div>

            <!-- TAB 2: CONTROLE DA PARTIDA -->
            <div class="gmode-view" id="gview-partida">
                <div class="gmode-card">
                    <div class="gmode-card-title">Manipular Cronômetro</div>
                    <div class="gmode-btn-grid">
                        <button class="gmode-btn" id="gm-time-add10">⏩ +10 Segundos</button>
                        <button class="gmode-btn" id="gm-time-sub10">⏪ -10 Segundos</button>
                        <button class="gmode-btn magenta" id="gm-time-zero">⏳ Zerar Timer (0s)</button>
                        <button class="gmode-btn cyan" id="gm-time-pause">⏸️ Pausar/Continuar</button>
                    </div>
                </div>
                <div class="gmode-card">
                    <div class="gmode-card-title">Tribunal & Veredito</div>
                    <div class="gmode-btn-grid">
                        <button class="gmode-btn yellow" id="gm-act-vote">⚖️ Abrir Votação</button>
                        <button class="gmode-btn green" id="gm-act-guilty">🚨 Veredito Culpado</button>
                        <button class="gmode-btn magenta" id="gm-act-innocent">❌ Veredito Inocente</button>
                        <button class="gmode-btn green" id="gm-act-forcewin">🏆 Forçar Vitória (+15)</button>
                    </div>
                </div>
                <div class="gmode-card">
                    <button class="gmode-btn yellow" onclick="appCore.sortearMinigame(); document.getElementById('god-mode-panel').classList.remove('active'); document.getElementById('god-mode-backdrop').classList.remove('active');" style="width:100%; margin-bottom:6px;">🎲 Testar Sorteio Aleatório</button>
                    <button class="gmode-btn magenta" id="gm-act-abort" style="width:100%;">🛑 Abortar Partida Atual</button>
                </div>
            </div>

            <!-- TAB 3: TELEPORTE DE TELAS -->
            <div class="gmode-view" id="gview-teleporte">
                <div class="gmode-card">
                    <div class="gmode-card-title">Pular Direto para Tela:</div>
                    <div class="gmode-btn-grid">
                        <button class="gmode-btn" onclick="appCore.nav('screen-home')">🏠 Menu Principal</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-players')">🛡️ Guerreiros</button>
                        <button class="gmode-btn" onclick="appCore.abrirCriador()">🎨 Criador Avatar</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-lobby')">⏳ Lobby Partida</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-game-board')">🎲 Tabuleiro</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-vote')">🗳️ Votação</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-verdict')">⚖️ Veredito</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-result')">🏆 Resultado</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-dedo')">👆 Sorteio Dedo</button>
                        <button class="gmode-btn" onclick="appCore.nav('screen-roleta')">🎰 Roleta</button>
                        <button class="gmode-btn" onclick="appCore.encerrarNoite()">🏁 Pódio da Noite</button>
                        <button class="gmode-btn" onclick="appCore.openTourneySetup()">🏆 Torneio</button>
                    </div>
                </div>
            </div>

            <!-- TAB 4: CHEATS DE JOGADORES -->
            <div class="gmode-view" id="gview-jogadores">
                <div class="gmode-card">
                    <div class="gmode-card-title">Guerreiros & Pontuação</div>
                    <div class="gmode-btn-grid">
                        <button class="gmode-btn yellow" id="gm-cheat-magic">🪄 Gerar 4 Guerreiros</button>
                        <button class="gmode-btn green" id="gm-cheat-add10">➕ +10 Pts para Todos</button>
                        <button class="gmode-btn cyan" id="gm-cheat-leader20">👑 +20 Pts ao Líder</button>
                        <button class="gmode-btn" id="gm-cheat-sub10">➖ -10 Pts para Todos</button>
                        <button class="gmode-btn magenta" id="gm-cheat-wanted">🎯 Alternar WANTED</button>
                        <button class="gmode-btn magenta" id="gm-cheat-prenda">💀 Dar 3 Falhas (Prenda)</button>
                        <button class="gmode-btn" id="gm-cheat-resetscore">🔄 Zerar Pontuações</button>
                        <button class="gmode-btn magenta" id="gm-cheat-clearall">🗑️ Deletar Guerreiros</button>
                    </div>
                </div>
            </div>

            <!-- TAB 5: JUICE & SONS -->
            <div class="gmode-view" id="gview-juice">
                <div class="gmode-card">
                    <div class="gmode-card-title">Testar Efeitos Visuais</div>
                    <div class="gmode-btn-grid">
                        <button class="gmode-btn yellow" onclick="window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 180 })">🎉 Chuva de Confetes</button>
                        <button class="gmode-btn cyan" onclick="window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#00e5ff' })">⚡ Flash Neon</button>
                        <button class="gmode-btn magenta" onclick="window.GIW.bus.emit('fx:juice', { type: 'crack' })">💥 Vidro Quebrado</button>
                        <button class="gmode-btn yellow" onclick="window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 500 })">📳 Tremor Forte</button>
                    </div>
                </div>
                <div class="gmode-card">
                    <div class="gmode-card-title">Testar Sons Procedurais</div>
                    <div class="gmode-btn-grid">
                        <button class="gmode-btn" onclick="window.playSound('click')">🖱️ Click</button>
                        <button class="gmode-btn" onclick="window.playSound('pop')">🫧 Pop</button>
                        <button class="gmode-btn" onclick="window.playSound('nav')">🧭 Nav</button>
                        <button class="gmode-btn" onclick="window.playSound('coin')">🪙 Coin / Moeda</button>
                        <button class="gmode-btn" onclick="window.playSound('victory')">🎺 Vitória</button>
                        <button class="gmode-btn" onclick="window.playSound('error')">❌ Erro</button>
                        <button class="gmode-btn" onclick="window.playSound('kaboom')">💣 Kaboom</button>
                        <button class="gmode-btn" onclick="window.playSound('siren')">🚨 Sirene</button>
                        <button class="gmode-btn" onclick="window.playSound('wasted')">💀 Wasted</button>
                        <button class="gmode-btn" onclick="window.playSound('applause')">👏 Palmas</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // ==========================================
    // LOGICA DE INTERAÇÃO DO PAINEL
    // ==========================================
    function toggleGodMode() {
        const isOpen = panel.classList.contains('active');
        if (isOpen) {
            closeGodMode();
        } else {
            openGodMode();
        }
    }

    function openGodMode() {
        backdrop.classList.add('active');
        panel.classList.add('active');
        updateInspector();
        window.playSound('pop');
    }

    function closeGodMode() {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
        window.playSound('click');
    }

    trigger.addEventListener('click', toggleGodMode);
    backdrop.addEventListener('click', closeGodMode);
    document.getElementById('gmode-close').addEventListener('click', closeGodMode);

    // Atalhos de teclado (F2 e Ctrl+Shift+D)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'F2' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd')) {
            e.preventDefault();
            toggleGodMode();
        } else if (e.key === 'Escape' && panel.classList.contains('active')) {
            closeGodMode();
        }
    });

    // Troca de Abas do Console
    panel.querySelectorAll('.gmode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            panel.querySelectorAll('.gmode-tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.gmode-view').forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            const targetView = document.getElementById(`gview-${tab.dataset.tab}`);
            if (targetView) targetView.classList.add('active');
            window.playSound('click');
        });
    });

    // ==========================================
    // INSPETOR EM TEMPO REAL
    // ==========================================
    function updateInspector() {
        const store = window.GIW?.store;
        const runner = window.GIW?.runner;
        const activeGame = runner?.activeGame;

        const screenEl = document.querySelector('.screen.active');
        const screenId = screenEl ? screenEl.id : 'Nenhuma';
        document.getElementById('gm-stat-screen').innerText = screenId.replace('screen-', '');

        document.getElementById('gm-stat-game').innerText = (store && store.currentGameActive) 
            ? (window.gameTitles?.[store.currentGameActive] || store.currentGameActive) 
            : 'Nenhum';

        document.getElementById('gm-stat-phase').innerText = activeGame?.phase || (runner?.isPaused ? 'Pausado' : 'Pronto');

        if (runner && runner.stageDuration > 0) {
            const rem = Math.max(0, runner.stageDuration - runner.stageElapsed);
            const m = Math.floor(rem / 60);
            const s = Math.ceil(rem % 60);
            document.getElementById('gm-stat-time').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
        } else {
            document.getElementById('gm-stat-time').innerText = '--';
        }

        const players = store?.players || [];
        document.getElementById('gm-stat-players').innerText = `${players.length} guerreiros`;

        const topScore = Math.max(0, ...players.map(p => p.score || 0));
        const leader = players.find(p => p.score > 0 && p.score === topScore);
        document.getElementById('gm-stat-leader').innerText = leader ? `${leader.name} (${leader.score} pts)` : 'Nenhum';

        const wanted = players.find(p => p.isWanted);
        document.getElementById('gm-stat-wanted').innerText = wanted ? wanted.name : 'Nenhum';

        // Atualiza botões de modificadores
        if (store) {
            document.getElementById('gm-mod-mario').style.opacity = store.isMarioKart ? '1' : '0.45';
            document.getElementById('gm-mod-chaos').style.opacity = store.isChaos ? '1' : '0.45';
            document.getElementById('gm-mod-events').style.opacity = store.isEvents ? '1' : '0.45';
            document.getElementById('gm-mod-sound').style.opacity = store.isSoundOn ? '1' : '0.45';
            const rolesBtn = document.getElementById('gm-mod-roles');
            if (rolesBtn) rolesBtn.style.opacity = store.isRoles ? '1' : '0.45';
        }
    }

    // Atualiza periodicamente quando aberto
    setInterval(() => {
        if (panel.classList.contains('active')) {
            updateInspector();
        }
    }, 400);

    // Atualiza imediatamente em eventos de estado
    if (window.GIW?.bus) {
        window.GIW.bus.on('state:updated', () => {
            if (panel.classList.contains('active')) updateInspector();
        });
    }

    // ==========================================
    // AÇÕES DE PARTIDA E CRONÔMETRO
    // ==========================================
    document.getElementById('gm-time-add10').addEventListener('click', () => {
        if (window.GIW?.runner?.stageDuration) {
            window.GIW.runner.stageDuration += 10;
            window.playSound('pop');
            updateInspector();
        }
    });

    document.getElementById('gm-time-sub10').addEventListener('click', () => {
        if (window.GIW?.runner?.stageDuration) {
            window.GIW.runner.stageDuration = Math.max(0, window.GIW.runner.stageDuration - 10);
            window.playSound('click');
            updateInspector();
        }
    });

    document.getElementById('gm-time-zero').addEventListener('click', () => {
        if (window.GIW?.runner) {
            window.GIW.runner.stageElapsed = window.GIW.runner.stageDuration;
            window.playSound('kaboom');
            updateInspector();
        }
    });

    document.getElementById('gm-time-pause').addEventListener('click', () => {
        if (window.GIW?.runner) {
            window.GIW.runner.isPaused = !window.GIW.runner.isPaused;
            window.playSound('click');
            updateInspector();
        }
    });

    document.getElementById('gm-act-vote').addEventListener('click', () => {
        if (window.minigames?.startVoting) {
            window.minigames.startVoting();
            closeGodMode();
        } else {
            appCore.nav('screen-vote');
            closeGodMode();
        }
    });

    document.getElementById('gm-act-guilty').addEventListener('click', () => {
        const store = window.GIW.store;
        const p1 = store.players[0] || { id: 'test_1', name: 'Alvo Culpado' };
        window.GIW.runCinematicVerdict({
            votedPlayer: p1,
            isGuilty: true,
            realCulprit: p1,
            roleLabel: 'INFILTRADO',
            onComplete: () => appCore.nav('screen-home')
        });
        closeGodMode();
    });

    document.getElementById('gm-act-innocent').addEventListener('click', () => {
        const store = window.GIW.store;
        const p1 = store.players[0] || { id: 'test_1', name: 'Inocente Vítima' };
        const p2 = store.players[1] || { id: 'test_2', name: 'Verdadeiro Culpado' };
        window.GIW.runCinematicVerdict({
            votedPlayer: p1,
            isGuilty: false,
            realCulprit: p2,
            roleLabel: 'INFILTRADO',
            onComplete: () => appCore.nav('screen-home')
        });
        closeGodMode();
    });

    document.getElementById('gm-act-forcewin').addEventListener('click', () => {
        const runner = window.GIW?.runner;
        const store = window.GIW?.store;
        if (runner && runner.activeGame && runner.activeGame.ctx) {
            const p = store.players[0];
            runner.activeGame.ctx.complete({
                title: 'Vitória Forçada!',
                titleColor: 'var(--pop-green)',
                detailHTML: '<p style="font-weight:900;">Ação simulada pelo Modo Deus.</p>',
                scoreMutations: p ? [{ playerId: p.id, baseDelta: 15 }] : [],
                celebrateWithConfetti: true
            });
            closeGodMode();
        }
    });

    document.getElementById('gm-act-abort').addEventListener('click', () => {
        if (window.GIW?.runner) {
            window.GIW.runner.abortCurrentGame();
        }
        appCore.nav('screen-home');
        closeGodMode();
    });

    // ==========================================
    // CHEATS DE MODIFICADORES
    // ==========================================
    document.getElementById('gm-mod-mario').addEventListener('click', () => {
        const store = window.GIW.store;
        store.isMarioKart = !store.isMarioKart;
        store.syncSettingsUI();
        store.save();
        updateInspector();
        window.playSound('pop');
    });

    document.getElementById('gm-mod-chaos').addEventListener('click', () => {
        const store = window.GIW.store;
        store.isChaos = !store.isChaos;
        store.syncSettingsUI();
        store.save();
        updateInspector();
        window.playSound('pop');
    });

    document.getElementById('gm-mod-events').addEventListener('click', () => {
        const store = window.GIW.store;
        store.isEvents = !store.isEvents;
        store.syncSettingsUI();
        store.save();
        updateInspector();
        window.playSound('pop');
    });

    document.getElementById('gm-mod-sound').addEventListener('click', () => {
        const store = window.GIW.store;
        store.isSoundOn = !store.isSoundOn;
        store.isVibOn = store.isSoundOn;
        store.syncSettingsUI();
        store.save();
        updateInspector();
        window.playSound('click');
    });

    const gmRolesBtn = document.getElementById('gm-mod-roles');
    if (gmRolesBtn) {
        gmRolesBtn.addEventListener('click', () => {
            const store = window.GIW.store;
            store.isRoles = !store.isRoles;
            store.syncSettingsUI();
            store.save();
            updateInspector();
            window.playSound('pop');
        });
    }

    // ==========================================
    // CHEATS DE GUERREIROS
    // ==========================================
    document.getElementById('gm-cheat-magic').addEventListener('click', () => {
        appCore.gerarTurmaMagica();
        window.playSound('victory');
        updateInspector();
    });

    document.getElementById('gm-cheat-add10').addEventListener('click', () => {
        const store = window.GIW.store;
        store.players.forEach(p => p.score = (p.score || 0) + 10);
        store.save();
        window.renderPlayers();
        window.playSound('coin');
        updateInspector();
    });

    document.getElementById('gm-cheat-leader20').addEventListener('click', () => {
        const store = window.GIW.store;
        if (store.players.length === 0) return;
        const topScore = Math.max(...store.players.map(p => p.score || 0));
        const leader = store.players.find(p => p.score === topScore) || store.players[0];
        if (leader) {
            leader.score += 20;
            store.save();
            window.renderPlayers();
            window.playSound('coin');
            updateInspector();
        }
    });

    document.getElementById('gm-cheat-sub10').addEventListener('click', () => {
        const store = window.GIW.store;
        store.players.forEach(p => p.score = Math.max(0, (p.score || 0) - 10));
        store.save();
        window.renderPlayers();
        window.playSound('badum');
        updateInspector();
    });

    document.getElementById('gm-cheat-wanted').addEventListener('click', () => {
        const store = window.GIW.store;
        if (store.players.length === 0) return;
        const currentWanted = store.players.find(p => p.isWanted);
        if (currentWanted) {
            currentWanted.isWanted = false;
        } else {
            store.players[0].isWanted = true;
        }
        store.save();
        window.renderPlayers();
        window.playSound('glitch');
        updateInspector();
    });

    document.getElementById('gm-cheat-prenda').addEventListener('click', () => {
        const store = window.GIW.store;
        if (store.players.length === 0) return;
        const p = store.players[0];
        p.falhas = 3;
        store.save();
        window.renderPlayers();
        appCore.dispararPrenda(p);
        closeGodMode();
    });

    document.getElementById('gm-cheat-resetscore').addEventListener('click', () => {
        const store = window.GIW.store;
        store.players.forEach(p => { p.score = 0; p.falhas = 0; p.streak = 0; p.isWanted = false; });
        store.save();
        window.renderPlayers();
        window.playSound('click');
        updateInspector();
    });

    document.getElementById('gm-cheat-clearall').addEventListener('click', () => {
        if (confirm("Resetar e apagar todos os jogadores?")) {
            window.GIW.store.players = [];
            window.GIW.store.save();
            window.renderPlayers();
            window.playSound('badum');
            updateInspector();
        }
    });

    window.GIW.toggleGodMode = toggleGodMode;
})();
