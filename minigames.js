/**
 * Game is War 3.0 - MiniGame Engine
 * 16 State Machines Autônomas e 100% Interativas
 */

window.minigames = window.minigames || {};

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ==========================================
// RUNNER CENTRAL
// ==========================================
class MiniGameRunner {
    constructor() {
        this.activeGame = null;
        this.sandbox = null;
        this.rafId = null;
        this.lastTime = 0;
        this.stageDuration = 0;
        this.stageElapsed = 0;
        this.isPaused = true;
    }

    launch(gameId) {
        this.abortCurrentGame();

        const boardEl = document.getElementById('screen-game-board') || document.body;
        this.sandbox = new window.GIW.ResourceSandbox(boardEl);

        const store = window.GIW.store;
        const timeInput = document.getElementById('config-time');
        const sensInput = document.getElementById('config-sens');
        const selectedTime = timeInput ? parseInt(timeInput.value, 10) : store.gameConfigs.time;
        const selectedSens = sensInput ? parseInt(sensInput.value, 10) : store.gameConfigs.sensibilidade;

        const config = {
            gameId,
            time: selectedTime || 60,
            sensibilidade: selectedSens || 25,
            modes: store.gameConfigs.modes || 'classico',
            themes: store.gameConfigs.themes.length > 0 ? store.gameConfigs.themes : Object.keys(window.categoriasIniciais),
            isMarioKart: store.isMarioKart,
            isChaos: store.isChaos,
            isRoles: store.isRoles ?? true
        };

        const ctx = {
            sandbox: this.sandbox,
            bus: window.GIW.bus,
            store,
            timer: {
                start: (sec) => {
                    this.stageDuration = sec;
                    this.stageElapsed = 0;
                    this.isPaused = false;
                },
                add: (sec) => { this.stageDuration = Math.max(0, this.stageDuration + sec); },
                pause: () => { this.isPaused = true; },
                resume: () => { this.isPaused = false; },
                stop: () => { this.isPaused = true; this.stageElapsed = 0; }
            },
            complete: (resultPayload) => this.onGameComplete(resultPayload)
        };

        this.activeGame = createGameInstance(gameId, config, store.teams, ctx);
        if (this.activeGame) {
            this.sandbox.requestWakeLock();
            this.activeGame.start();
            this.startLoop();
        }
    }

    startLoop() {
        this.lastTime = performance.now();
        const loop = (now) => {
            if (!this.activeGame) return;
            const delta = Math.min((now - this.lastTime) / 1000, 0.1);
            this.lastTime = now;

            if (!this.isPaused && this.stageDuration > 0) {
                this.stageElapsed += delta;
            }
            const remaining = Math.max(0, this.stageDuration - this.stageElapsed);

            if (this.activeGame.tick) {
                this.activeGame.tick(delta, this.stageElapsed, remaining);
            }

            if (this.activeGame) {
                this.rafId = requestAnimationFrame(loop);
            }
        };
        this.rafId = requestAnimationFrame(loop);
    }

    onGameComplete(resultPayload) {
        if (!this.activeGame) return;
        if (this.rafId) cancelAnimationFrame(this.rafId);

        this.teardown();
        window.GIW.store.applyGameResult(resultPayload);

        const titleEl = document.getElementById('result-title');
        const detailEl = document.getElementById('result-detail-box');
        const shelfEl = document.getElementById('result-shelf');
        const badgeEl = document.getElementById('result-score-badge');

        if (titleEl) {
            titleEl.innerText = resultPayload.title || 'Fim de Rodada';
            titleEl.style.color = resultPayload.titleColor || 'var(--pop-cyan)';
        }
        if (detailEl) {
            detailEl.innerHTML = resultPayload.detailHTML || '';
        }

        // Estante comemorativa com Avatares Duolingo
        if (shelfEl) {
            shelfEl.innerHTML = '';
            const allPlayers = window.GIW.store.players || [];
            const mutations = resultPayload.scoreMutations || [];
            
            const winners = mutations
                .filter(m => (m.baseDelta || 0) > 0)
                .map(m => allPlayers.find(p => p.id === m.playerId))
                .filter(Boolean);

            const losers = (resultPayload.losers || [])
                .map(id => allPlayers.find(p => p.id === id))
                .filter(Boolean);

            const displayPlayers = winners.length > 0 ? winners.slice(0, 3) : losers.slice(0, 2);

            displayPlayers.forEach(p => {
                const isWinner = winners.some(w => w.id === p.id);
                const wrapper = document.createElement('div');
                wrapper.style.position = 'relative';
                wrapper.style.display = 'inline-block';
                wrapper.style.margin = '0 6px';
                wrapper.innerHTML = `
                    <div style="transform: scale(0.92); transform-origin: bottom center;">
                        ${window.generateCardHTML(p)}
                    </div>
                    <div style="position:absolute; top:-10px; right:-6px; font-size:1.8em; z-index:15; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
                        ${isWinner ? '👑' : '💥'}
                    </div>
                `;
                shelfEl.appendChild(wrapper);
            });
        }

        // Badge de Pontos com bounce impact
        const mutations = resultPayload.scoreMutations || [];
        const topPts = Math.max(0, ...mutations.map(m => m.baseDelta || 0));
        if (badgeEl) {
            if (topPts > 0) {
                badgeEl.style.display = 'inline-flex';
                badgeEl.innerText = `+${topPts} PONTOS`;
            } else {
                badgeEl.style.display = 'none';
            }
        }

        if (resultPayload.celebrateWithConfetti) {
            window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 160 });
            window.playSound('applause');
        }

        // Suporte ao Botão de Continuação do Torneio
        const btnNextTourney = document.getElementById('btn-next-tourney');
        if (btnNextTourney) {
            const allPlayers = window.GIW.store.players || [];
            const tourneyOver = window.GIW.store.tournamentMode && allPlayers.some(p => (p.score || 0) >= window.GIW.store.tourneyTarget);
            if (window.GIW.store.tournamentMode) {
                btnNextTourney.style.display = 'block';
                if (tourneyOver) {
                    btnNextTourney.className = 'btn btn-success';
                    btnNextTourney.innerText = '🏆 VER O CAMPEÃO SUPREMO!';
                    btnNextTourney.onclick = () => appCore.encerrarNoite();
                } else {
                    btnNextTourney.className = 'btn btn-warning';
                    btnNextTourney.innerText = '🎰 PRÓXIMO JOGO DO TORNEIO ➔';
                    btnNextTourney.onclick = () => window.playTournamentNext();
                }
            } else {
                btnNextTourney.style.display = 'none';
            }
        }

        appCore.nav('screen-result');

        // Animação GSAP na tela de resultados
        if (typeof window.gsap !== 'undefined') {
            if (titleEl) {
                window.gsap.fromTo(titleEl, 
                    { scale: 0.7, opacity: 0, y: -20 }, 
                    { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: 'back.out(2)' }
                );
            }
            if (shelfEl && shelfEl.children.length > 0) {
                window.gsap.fromTo(shelfEl.children, 
                    { scale: 0, rotation: -12, opacity: 0 }, 
                    { scale: 1, rotation: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'elastic.out(1, 0.6)' }
                );
            }
            if (badgeEl && topPts > 0) {
                window.gsap.fromTo(badgeEl, 
                    { scale: 2.2, opacity: 0 }, 
                    { scale: 1, opacity: 1, duration: 0.45, delay: 0.35, ease: 'bounce.out' }
                );
            }
        }
    }

    abortCurrentGame() {
        if (this.activeGame) {
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.teardown();
        }
    }

    teardown() {
        if (this.activeGame && this.activeGame.destroy) {
            this.activeGame.destroy();
        }
        if (this.sandbox) {
            this.sandbox.dispose();
            this.sandbox = null;
        }
        this.activeGame = null;
        this.isPaused = true;
        const sb = document.getElementById('soundboard-ui');
        if (sb) sb.style.display = 'none';
        const st = document.getElementById('btn-in-game-store');
        if (st) st.style.display = 'none';
    }

    action(type, payload) {
        if (!this.activeGame) return;
        if (this.activeGame.handleAction) {
            this.activeGame.handleAction(type, payload);
        }
    }
}

const runner = new MiniGameRunner();
window.GIW.runner = runner;

// ==========================================
// MOTOR CINEMATOGRÁFICO DE VEREDITO
// ==========================================
function runCinematicVerdict({ votedPlayer, isGuilty, realCulprit, roleLabel = 'INFILTRADO', isBobo = false, onComplete }) {
    appCore.nav('screen-verdict');
    const vSlot = document.getElementById('verdict-player-slot');
    const vStamp = document.getElementById('verdict-stamp');
    const vLaser = document.getElementById('verdict-laser');
    const vCardWrap = document.getElementById('verdict-card-container');
    const vBadge = document.getElementById('verdict-status-badge');
    const vIcon = document.getElementById('verdict-status-icon');
    const vText = document.getElementById('verdict-status-text');
    const vExtra = document.getElementById('verdict-extra-reveal');
    const vSubtitle = document.getElementById('verdict-phase-subtitle');

    if (vSubtitle) vSubtitle.innerText = 'A mesa votou para eliminar:';
    if (vSlot && votedPlayer) {
        // Expressão de Pânico / Suando Frio durante o escaneamento
        vSlot.innerHTML = window.generateCardHTML(votedPlayer, '', '', 22, false);
    }

    // Reset de estilos e classes
    if (vStamp) {
        vStamp.className = 'verdict-stamp';
        vStamp.style.display = 'none';
        vStamp.style.transform = 'translate(-50%, -50%) rotate(-12deg) scale(0)';
        vStamp.style.opacity = '0';
    }
    if (vExtra) {
        vExtra.style.opacity = '0';
        vExtra.style.transform = 'translateY(20px)';
        vExtra.innerHTML = '';
    }
    if (vLaser) {
        vLaser.style.opacity = '1';
    }
    if (vBadge) {
        vBadge.style.color = 'var(--pop-cyan)';
        vBadge.style.borderColor = 'var(--ink-black)';
    }
    if (vIcon) vIcon.innerText = '🔍';
    if (vText) vText.innerText = 'ESCANEANDO BIOMETRIA...';

    window.playSound('scan');
    window.playSound('heartbeat');
    window.hapticTap();

    if (typeof window.gsap !== 'undefined') {
        window.gsap.fromTo(vLaser, 
            { top: '-10%' }, 
            { top: '110%', duration: 0.7, repeat: 2, yoyo: true, ease: 'sine.inOut' }
        );
        window.gsap.fromTo(vCardWrap, 
            { scale: 0.95 }, 
            { scale: 1.05, duration: 1.0, repeat: 1, yoyo: true, ease: 'power1.inOut' }
        );
    }

    // Fase 1: Álibi sob suspeita aos 1.1s
    setTimeout(() => {
        if (vIcon) vIcon.innerText = '⚡';
        if (vText) vText.innerText = 'ANALISANDO ÁLIBI...';
        if (vBadge) vBadge.style.color = 'var(--pop-yellow)';
        window.playSound('scan');
        window.hapticTap();
    }, 1100);

    // Fase 2: Carimbada brutal de impacto aos 2.2s
    setTimeout(() => {
        if (vLaser) vLaser.style.opacity = '0';

        if (isBobo) {
            // BOBO DA CORTE VENCEU - Expressão 19 (Deboche supremo)
            if (vSlot && votedPlayer) {
                vSlot.innerHTML = window.generateCardHTML(votedPlayer, '', '', 19, false);
            }
            if (vStamp) {
                vStamp.innerText = 'BOBO DA CORTE!';
                vStamp.className = 'verdict-stamp stamp-bobo';
                vStamp.style.display = 'block';
                if (typeof window.gsap !== 'undefined') {
                    window.gsap.fromTo(vStamp, 
                        { scale: 4, opacity: 0, rotation: -20 }, 
                        { scale: 1, opacity: 1, rotation: -6, duration: 0.35, ease: 'back.out(2)' }
                    );
                }
            }
            if (vIcon) vIcon.innerText = '🤡';
            if (vText) vText.innerText = 'O BOBO ENGANOU A MESA!';
            if (vBadge) {
                vBadge.style.color = 'var(--pop-yellow)';
                vBadge.style.borderColor = 'var(--pop-yellow)';
            }

            window.playSound('applause');
            window.playSound('badum');
            window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#ffe600' });
            window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 500 });
            window.vibrar(500);

            setTimeout(() => {
                window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 150 });
            }, 500);

            setTimeout(() => {
                if (vExtra && realCulprit) {
                    vExtra.innerHTML = `
                        <div style="width:100%;">
                            <div style="font-size:0.85em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">O Bobo venceu sozinho! O verdadeiro ${roleLabel} era:</div>
                            <div style="display:flex; align-items:center; justify-content:center; gap:14px;">
                                <div style="transform: scale(0.75); transform-origin: center center; margin: -15px 0;">
                                    ${window.generateCardHTML(realCulprit, '', '', null, false)}
                                </div>
                                <div style="text-align:left;">
                                    <div style="font-size:1.4em; font-weight:900; color:var(--pop-magenta); line-height:1.1;">${realCulprit.name}</div>
                                    <div style="font-size:0.85em; color:var(--ink-muted); font-weight:800; margin-top:4px;">Escapou da eliminação! 🕵️</div>
                                </div>
                            </div>
                        </div>
                    `;
                    if (typeof window.gsap !== 'undefined') {
                        window.gsap.to(vExtra, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.5)' });
                    } else {
                        vExtra.style.opacity = '1';
                        vExtra.style.transform = 'translateY(0)';
                    }
                }
            }, 1200);

            setTimeout(() => {
                if (onComplete) onComplete();
            }, 3600);

        } else if (isGuilty) {
            // CULPADO / DESMASCARADO - Expressão 19 (Maligno / Sorriso de deboche)
            if (vSlot && votedPlayer) {
                vSlot.innerHTML = window.generateCardHTML(votedPlayer, '', '', 19, false);
            }
            if (vStamp) {
                vStamp.innerText = `${roleLabel}!`;
                vStamp.classList.add('stamp-guilty');
                vStamp.style.display = 'block';
                if (typeof window.gsap !== 'undefined') {
                    window.gsap.fromTo(vStamp, 
                        { scale: 4, opacity: 0, rotation: -25 }, 
                        { scale: 1, opacity: 1, rotation: -8, duration: 0.35, ease: 'back.out(2)' }
                    );
                }
            }
            if (vIcon) vIcon.innerText = '🚨';
            if (vText) vText.innerText = `${roleLabel} DETECTADO!`;
            if (vBadge) {
                vBadge.style.color = 'var(--pop-green)';
                vBadge.style.borderColor = 'var(--pop-green)';
            }

            window.playSound('success');
            window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#00e676' });
            window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 400 });
            window.vibrar(400);

            setTimeout(() => {
                window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 80 });
            }, 600);

            setTimeout(() => {
                if (onComplete) onComplete();
            }, 2600);

        } else {
            // INOCENTE ELIMINADO - Expressão 24 (Chorando / Desesperado)
            if (vSlot && votedPlayer) {
                vSlot.innerHTML = window.generateCardHTML(votedPlayer, '', '', 24, false);
            }
            if (vStamp) {
                vStamp.innerText = 'INOCENTE!';
                vStamp.classList.add('stamp-innocent');
                vStamp.style.display = 'block';
                if (typeof window.gsap !== 'undefined') {
                    window.gsap.fromTo(vStamp, 
                        { scale: 4, opacity: 0, rotation: 25 }, 
                        { scale: 1, opacity: 1, rotation: 8, duration: 0.35, ease: 'back.out(2)' }
                    );
                }
            }
            if (vIcon) vIcon.innerText = '❌';
            if (vText) vText.innerText = 'ERRO FATAL! INOCENTE ELIMINADO';
            if (vBadge) {
                vBadge.style.color = 'var(--pop-magenta)';
                vBadge.style.borderColor = 'var(--pop-magenta)';
            }

            window.playKaboom();
            window.playSound('siren');
            window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#ff2a85' });
            window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 700 });
            window.vibrar(700);

            // Revela quem era o verdadeiro culpado aos 1.3s após o impacto
            setTimeout(() => {
                if (vExtra && realCulprit) {
                    vExtra.innerHTML = `
                        <div style="width:100%;">
                            <div style="font-size:0.85em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">O verdadeiro ${roleLabel} era:</div>
                            <div style="display:flex; align-items:center; justify-content:center; gap:14px;">
                                <div style="transform: scale(0.75); transform-origin: center center; margin: -15px 0;">
                                    ${window.generateCardHTML(realCulprit, '', '', null, false)}
                                </div>
                                <div style="text-align:left;">
                                    <div style="font-size:1.4em; font-weight:900; color:var(--pop-magenta); line-height:1.1;">${realCulprit.name}</div>
                                    <div style="font-size:0.85em; color:var(--ink-muted); font-weight:800; margin-top:4px;">Enganou a mesa inteira! 😈</div>
                                </div>
                            </div>
                        </div>
                    `;
                    if (typeof window.gsap !== 'undefined') {
                        window.gsap.to(vExtra, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.5)' });
                    } else {
                        vExtra.style.opacity = '1';
                        vExtra.style.transform = 'translateY(0)';
                    }
                    window.playSound('badum');
                    window.hapticTap();
                }
            }, 1300);

            setTimeout(() => {
                if (onComplete) onComplete();
            }, 3600);
        }
    }, 2200);
}
window.GIW.runCinematicVerdict = runCinematicVerdict;

// ==========================================
// FÁBRICA DOS 15 JOGOS
// ==========================================
function createGameInstance(gameId, config, teams, ctx) {
    switch (gameId) {
        case 'impostor': return new GameImpostor(config, teams, ctx);
        case 'duplas': return new GameDuplas(config, teams, ctx);
        case 'macabro': return new GameMacabro(config, teams, ctx);
        case 'posicao': return new GamePosicoes(config, teams, ctx);
        case 'nota': return new GameNota(config, teams, ctx);
        case 'unica': return new GameUnica(config, teams, ctx);
        case 'quemsoueu': return new GameQuemSouEu(config, teams, ctx);
        case 'megasenha': return new GameMegaSenha(config, teams, ctx);
        case 'completa': return new GameCompleta(config, teams, ctx);
        case 'mimica': return new GameMimica(config, teams, ctx);
        case 'stop': return new GameStop(config, teams, ctx);
        case 'sevira': return new GameSeVira(config, teams, ctx);
        case 'cinco': return new GameCinco(config, teams, ctx);
        case 'batata': return new GameBatata(config, teams, ctx);
        case 'ultimo': return new GameUltimo(config, teams, ctx);
        default: return null;
    }
}

// ----------------------------------------------------
// 1. O IMPOSTOR
// ----------------------------------------------------
class GameImpostor {
    constructor(config, teams, ctx) {
        this.config = config;
        this.ctx = ctx;
        this.players = shuffle(teams[0]?.players?.length ? teams[0].players : window.GIW.store.players || []);
        this.turn = 0;
        this.phase = 'REVEAL';

        const themes = config.themes.length > 0 ? config.themes : Object.keys(window.categoriasIniciais);
        this.category = themes[Math.floor(Math.random() * themes.length)];
        let pool = window.categoriasIniciais[this.category] || ['Pipoca'];
        if (config.isChaos) pool = [...pool, ...window.caosWords];
        this.secretWord = pool[Math.floor(Math.random() * pool.length)];

        this.impostorIdx = Math.floor(Math.random() * this.players.length);
        this.impostor = this.players[this.impostorIdx];

        // Papel Secreto: O Bobo da Corte
        this.isRoles = config.isRoles ?? window.GIW.store?.isRoles ?? true;
        this.boboIdx = -1;
        this.bobo = null;
        if (this.isRoles && this.players.length >= 4) {
            const pool = this.players.map((_, i) => i).filter(i => i !== this.impostorIdx);
            this.boboIdx = pool[Math.floor(Math.random() * pool.length)];
            this.bobo = this.players[this.boboIdx];
        }
    }

    start() {
        appCore.nav('screen-reveal');
        this.renderTurn();
    }

    renderTurn() {
        const btnNext = document.getElementById('btn-next-player');
        if (btnNext) btnNext.style.display = 'none';
        this.hideCover();

        const catEl = document.getElementById('reveal-category-display');
        if (catEl) {
            catEl.style.display = 'inline-flex';
            catEl.innerText = `Tema: ${this.category}`;
        }

        if (this.turn < this.players.length) {
            const p = this.players[this.turn];
            const isImp = this.turn === this.impostorIdx;
            const isBobo = this.turn === this.boboIdx;
            document.getElementById('turn-player-name').innerText = p.name;
            const sec = document.getElementById('secret-text');

            if (isImp) {
                document.getElementById('role-title').innerText = 'VOCÊ É O INFILTRADO!';
                sec.innerText = 'Descubra a palavra e blefe!';
                sec.style.color = 'var(--pop-magenta)';
            } else if (isBobo) {
                document.getElementById('role-title').innerText = 'PALAVRA SECRETA (BOBO DA CORTE)';
                sec.innerHTML = `
                    <span style="color:var(--pop-cyan);">${this.secretWord}</span>
                    <div style="font-size:0.62em; color:var(--pop-yellow); margin-top:10px; line-height:1.25; background:rgba(255,230,0,0.12); padding:8px 10px; border-radius:10px; border:1.5px solid var(--pop-yellow); text-align:center;">
                        🤡 <b>MISSÃO DO BOBO DA CORTE:</b><br>Finja suspeita e faça a mesa votar em VOCÊ para roubar a vitória (+25 Pts)!
                    </div>
                `;
                sec.style.color = 'var(--ink-white)';
            } else {
                document.getElementById('role-title').innerText = 'PALAVRA SECRETA';
                sec.innerText = this.secretWord;
                sec.style.color = 'var(--ink-white)';
            }
        } else {
            this.startDiscussion();
        }
    }

    startDiscussion() {
        this.phase = 'DISCUSSION';
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Discussão';
        document.getElementById('soundboard-ui').style.display = 'flex';

        const starter = this.players[Math.floor(Math.random() * this.players.length)];
        const gb = document.getElementById('gb-content');
        gb.innerHTML = `
            <div class="game-box-display">
                <div style="font-size:1.1em; color:var(--pop-cyan); font-weight:900;">TEMA DA SALA</div>
                <div style="font-size:2.2em; font-weight:900; color:var(--pop-yellow);">${this.category}</div>
                <p style="color:var(--ink-muted); margin-top:6px; font-weight:800;">Dica inicial por: <b>${starter.name}</b></p>
            </div>
            <div class="big-timer-circle">
                <div id="imp-timer" class="timer-number">--</div>
            </div>
            <button class="btn btn-danger" style="max-width:320px;" onclick="minigames.startVoting()">🔥 ABRIR VOTAÇÃO</button>
        `;
        this.ctx.timer.start(this.config.time || 240);
    }

    tick(delta, elapsed, remaining) {
        if (this.phase === 'DISCUSSION') {
            const el = document.getElementById('imp-timer');
            if (el) {
                const s = Math.ceil(remaining);
                el.innerText = `${Math.floor(s/60)}:${s%60 < 10 ? '0' : ''}${s%60}`;
            }
            if (remaining <= 0) {
                this.ctx.timer.stop();
                this.startVoting();
            }
        }
    }

    startVoting() {
        this.phase = 'VOTING';
        this.ctx.timer.stop();
        document.getElementById('soundboard-ui').style.display = 'none';
        appCore.nav('screen-vote');

        const c = document.getElementById('vote-list-container');
        c.innerHTML = '';
        this.players.forEach(p => {
            c.innerHTML += `
                <div class="vote-card-btn" style="display:inline-block; margin:6px; cursor:pointer;" onclick="minigames.castVote('${p.id}')">
                    <div style="transform: scale(0.92); transform-origin: center; pointer-events: none;">${window.generateCardHTML(p, '', '', null, false)}</div>
                </div>
            `;
        });
    }

    castVote(vId) {
        if (this.phase === 'VERDICT') return;
        this.phase = 'VERDICT';

        const votedPlayer = this.players.find(p => String(p.id) === String(vId)) || window.GIW.store.players.find(p => String(p.id) === String(vId));
        const isBoboCaught = this.bobo && String(vId) === String(this.bobo.id);
        const isCaught = !isBoboCaught && String(vId) === String(this.impostor.id);

        runCinematicVerdict({
            votedPlayer,
            isGuilty: isCaught,
            isBobo: isBoboCaught,
            realCulprit: this.impostor,
            roleLabel: 'INFILTRADO',
            onComplete: () => {
                if (isBoboCaught) {
                    this.ctx.complete({
                        title: 'O Bobo da Corte Venceu! 🤡',
                        titleColor: 'var(--pop-yellow)',
                        detailHTML: `<p style="font-weight:900; font-size:1.15em;"><b style="color:var(--pop-yellow);">${this.bobo.name}</b> foi eliminado de propósito e roubou todos os pontos!<br><span style="font-size:0.9em; color:var(--ink-muted);">Palavra: <b>${this.secretWord}</b> • Infiltrado: <b style="color:var(--pop-magenta);">${this.impostor.name}</b></span></p>`,
                        scoreMutations: [{ playerId: this.bobo.id, baseDelta: 25 }],
                        losers: this.players.filter(p => p.id !== this.bobo.id).map(p => p.id),
                        celebrateWithConfetti: true
                    });
                    return;
                }

                const mutations = [];
                const losers = [];
                if (isCaught) {
                    this.players.forEach(p => {
                        if (p.id !== this.impostor.id) mutations.push({ playerId: p.id, baseDelta: 10 });
                    });
                    losers.push(this.impostor.id);
                } else {
                    mutations.push({ playerId: this.impostor.id, baseDelta: 15, statImpDelta: 1 });
                    this.players.forEach(p => { if (p.id !== this.impostor.id) losers.push(p.id); });
                }

                this.ctx.complete({
                    title: isCaught ? 'Infiltrado Derrotado!' : 'O Infiltrado Venceu!',
                    titleColor: isCaught ? 'var(--pop-green)' : 'var(--pop-magenta)',
                    detailHTML: `<p style="font-weight:900; font-size:1.2em;">Palavra: <b style="color:var(--pop-cyan);">${this.secretWord}</b><br>Infiltrado: <b style="color:var(--pop-magenta);">${this.impostor.name}</b></p>`,
                    scoreMutations: mutations,
                    losers,
                    celebrateWithConfetti: true
                });
            }
        });
    }

    showCover() {
        const cov = document.getElementById('secret-cover');
        if (cov) cov.style.transform = 'translateY(100%)';
        const btn = document.getElementById('btn-next-player');
        if (btn) btn.style.display = 'block';
        window.hapticTap();
    }

    hideCover() {
        const cov = document.getElementById('secret-cover');
        if (cov) cov.style.transform = 'translateY(0%)';
    }

    nextTurn() {
        this.turn++;
        this.renderTurn();
    }

    handleAction(type, payload) {
        if (type === 'SHOW_SECRET') this.showCover();
        else if (type === 'HIDE_SECRET') this.hideCover();
        else if (type === 'NEXT_TURN') this.nextTurn();
        else if (type === 'START_VOTING') this.startVoting();
        else if (type === 'CAST_VOTE') this.castVote(payload);
    }
}

// ----------------------------------------------------
// 2. DUPLAS
// ----------------------------------------------------
class GameDuplas {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = shuffle(teams[0]?.players?.length ? teams[0].players : window.GIW.store.players || []);
        this.turn = 0;

        const pairsPool = [
            ['Fogo', 'Gelo'], ['Batman', 'Coringa'], ['Café', 'Biscoito'],
            ['Sol', 'Lua'], ['Praia', 'Piscina'], ['Hambúrguer', 'Batata Frita'],
            ['Cinema', 'Pipoca'], ['Gato', 'Cachorro'], ['Cerveja', 'Churrasco']
        ];
        const selectedPair = pairsPool[Math.floor(Math.random() * pairsPool.length)];
        const [w1, w2] = selectedPair;

        this.roles = [];
        this.impostorIdx = Math.floor(Math.random() * this.players.length);
        this.players.forEach((p, idx) => {
            if (idx === this.impostorIdx) {
                this.roles.push({ id: p.id, word: 'VOCÊ NÃO TEM DUPLA (INFILTRADO)', isImp: true });
            } else {
                this.roles.push({ id: p.id, word: idx % 2 === 0 ? w1 : w2, isImp: false });
            }
        });

        // Papel Secreto Extra: Bobo da Corte
        this.isRoles = config?.isRoles ?? window.GIW.store?.isRoles ?? true;
        this.boboIdx = -1;
        this.bobo = null;
        if (this.isRoles && this.players.length >= 4) {
            const pool = this.players.map((_, i) => i).filter(i => i !== this.impostorIdx);
            this.boboIdx = pool[Math.floor(Math.random() * pool.length)];
            this.bobo = this.players[this.boboIdx];
        }
    }

    start() {
        appCore.nav('screen-reveal');
        this.renderTurn();
    }

    renderTurn() {
        const btnNext = document.getElementById('btn-next-player');
        if (btnNext) btnNext.style.display = 'none';
        document.getElementById('secret-cover').style.transform = 'translateY(0%)';

        if (this.turn < this.players.length) {
            const p = this.players[this.turn];
            const r = this.roles[this.turn];
            const isBobo = this.turn === this.boboIdx;
            document.getElementById('turn-player-name').innerText = p.name;
            const sec = document.getElementById('secret-text');

            if (r.isImp) {
                document.getElementById('role-title').innerText = 'ALERTA!';
                sec.innerText = r.word;
                sec.style.color = 'var(--pop-magenta)';
            } else if (isBobo) {
                document.getElementById('role-title').innerText = 'SUA PALAVRA (BOBO DA CORTE)';
                sec.innerHTML = `
                    <span>${r.word}</span>
                    <div style="font-size:0.62em; color:var(--pop-yellow); margin-top:10px; line-height:1.25; background:rgba(255,230,0,0.12); padding:8px 10px; border-radius:10px; border:1.5px solid var(--pop-yellow); text-align:center;">
                        🤡 <b>MISSÃO DO BOBO DA CORTE:</b><br>Finja que não tem par ou dê pistas falsas para ser eliminado no tribunal (+25 Pts)!
                    </div>
                `;
                sec.style.color = 'var(--ink-white)';
            } else {
                document.getElementById('role-title').innerText = 'SUA PALAVRA';
                sec.innerText = r.word;
                sec.style.color = 'var(--ink-white)';
            }
        } else {
            appCore.nav('screen-game-board');
            document.getElementById('gb-title').innerText = 'Encontre o Par';
            document.getElementById('gb-content').innerHTML = `
                <div class="game-box-display">
                    <p style="font-weight:900; font-size:1.1em;">Descubra sua dupla sem entregar sua palavra ao Infiltrado Solitário!</p>
                </div>
                <button class="btn btn-danger" style="max-width:320px;" onclick="minigames.startVoting()">ELIMINAR INFILTRADO ➔</button>
            `;
        }
    }

    handleAction(type, payload) {
        if (type === 'SHOW_SECRET') {
            document.getElementById('secret-cover').style.transform = 'translateY(100%)';
            document.getElementById('btn-next-player').style.display = 'block';
            window.hapticTap();
        } else if (type === 'HIDE_SECRET') {
            document.getElementById('secret-cover').style.transform = 'translateY(0%)';
        } else if (type === 'NEXT_TURN') {
            this.turn++;
            this.renderTurn();
        } else if (type === 'START_VOTING') {
            appCore.nav('screen-vote');
            const c = document.getElementById('vote-list-container');
            c.innerHTML = '';
            this.players.forEach(p => {
                c.innerHTML += `
                    <div class="vote-card-btn" style="display:inline-block; margin:6px; cursor:pointer;" onclick="minigames.castVote('${p.id}')">
                        <div style="transform: scale(0.92); transform-origin: center; pointer-events: none;">${window.generateCardHTML(p, '', '', null, false)}</div>
                    </div>
                `;
            });
        } else if (type === 'CAST_VOTE') {
            const impostor = this.players[this.impostorIdx];
            const votedPlayer = this.players.find(p => String(p.id) === String(payload)) || window.GIW.store.players.find(p => String(p.id) === String(payload));
            const isCaught = String(payload) === String(impostor.id);
            const isBoboCaught = this.bobo && String(payload) === String(this.bobo.id);
            runCinematicVerdict({
                votedPlayer,
                isGuilty: isCaught,
                realCulprit: impostor,
                roleLabel: 'INFILTRADO',
                isBobo: isBoboCaught,
                onComplete: () => {
                    const mutations = [];
                    const losers = [];
                    if (isBoboCaught) {
                        mutations.push({ playerId: this.bobo.id, baseDelta: 25 });
                        this.players.forEach(p => { if (p.id !== this.bobo.id) losers.push(p.id); });
                        this.ctx.complete({
                            title: 'O Bobo Venceu Tudo! 🤡',
                            titleColor: 'var(--pop-yellow)',
                            detailHTML: `<p style="font-weight:900; font-size:1.15em;">O Bobo <b style="color:var(--pop-yellow);">${this.bobo.name}</b> foi acusado de ser o infiltrado e roubou o jogo!</p>`,
                            scoreMutations: mutations,
                            losers,
                            celebrateWithConfetti: true
                        });
                    } else if (isCaught) {
                        this.players.forEach(p => {
                            if (p.id !== impostor.id) mutations.push({ playerId: p.id, baseDelta: 10 });
                        });
                        losers.push(impostor.id);
                        this.ctx.complete({
                            title: 'Infiltrado Eliminado!',
                            titleColor: 'var(--pop-green)',
                            detailHTML: `<p style="font-weight:900; font-size:1.15em;">Infiltrado: <b style="color:var(--pop-magenta);">${impostor.name}</b></p>`,
                            scoreMutations: mutations,
                            losers,
                            celebrateWithConfetti: true
                        });
                    } else {
                        mutations.push({ playerId: impostor.id, baseDelta: 15, statImpDelta: 1 });
                        this.players.forEach(p => { if (p.id !== impostor.id) losers.push(p.id); });
                        this.ctx.complete({
                            title: 'O Infiltrado Enganou a Todos!',
                            titleColor: 'var(--pop-magenta)',
                            detailHTML: `<p style="font-weight:900; font-size:1.15em;">Infiltrado: <b style="color:var(--pop-magenta);">${impostor.name}</b></p>`,
                            scoreMutations: mutations,
                            losers,
                            celebrateWithConfetti: true
                        });
                    }
                }
            });
        }
    }
}

// ----------------------------------------------------
// 4. MISTÉRIOS (DARK STORIES)
// ----------------------------------------------------
class GameMacabro {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        const stories = [
            { q: "Um homem entra num restaurante, come carne de gaivota, sai e se mata. Por quê?", a: "Ele esteve em um naufrágio cego. Disseram que a carne servida para sobreviver era gaivota, mas ao provar a real, percebeu que comeu o filho falecido." },
            { q: "Um homem é achado morto no deserto com uma palha de fósforo apagada na mão.", a: "Ele e amigos estavam num balão de ar caindo. Tiraram a menor palha para ver quem pulava e salvava o balão." },
            { q: "Um homem empurra o carro até um hotel e grita: 'Estou falido!'.", a: "Ele estava jogando Banco Imobiliário (Monopoly) e caiu no hotel adversário." },
            { q: "Um homem acorda de madrugada, acende um cigarro, apaga uma luz e vai dormir. No dia seguinte, ouve o rádio e se desespera.", a: "Ele era o operador de um farol náutico e acidentalmente desligou a luz. Um navio colidiu nos recifes por causa disso." },
            { q: "Cinco pedaços de carvão, uma cenoura e um cachecol estão jogados no gramado de um sítio.", a: "Um boneco de neve derreteu sob o sol do meio-dia." },
            { q: "Uma mulher dispara uma arma contra o marido, segura a cabeça dele embaixo d'água por 5 minutos, e em seguida vão jantar juntos felizes.", a: "Ela é fotógrafa! Tirou uma foto dele, revelou o papel fotográfico no líquido escuro e pendurou para secar." },
            { q: "Dois homens entram num bar e pedem a mesma bebida com muito gelo. Um bebe tudo de um gole só e sobrevive; o outro bebe devagar e morre.", a: "O veneno estava congelado nos cubos de gelo. Quem bebeu rápido não deu tempo do veneno derreter." }
        ];
        this.chosen = stories[Math.floor(Math.random() * stories.length)];
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Mistério Macabro';
        const gb = document.getElementById('gb-content');
        gb.innerHTML = `
            <div class="game-box-display">
                <p style="font-size:1.2em; font-weight:900; line-height:1.4;">${this.chosen.q}</p>
                <button class="btn btn-dark" style="margin-top:14px;" onpointerdown="document.getElementById('mac-ans').style.display='block'" onpointerup="document.getElementById('mac-ans').style.display='none'">👁️ Segure para Ler a Solução</button>
                <div id="mac-ans" style="display:none; margin-top:12px; color:var(--pop-yellow); font-size:0.95em; font-weight:800; text-align:left;">${this.chosen.a}</div>
            </div>
            <div style="display:flex; gap:10px; max-width:320px; width:100%; margin-top:12px;">
                <button class="btn btn-danger" onclick="minigames.surrenderMacabro()">❌ DESISTIR</button>
                <button class="btn btn-success" onclick="minigames.finishDirect()">✅ DESVENDADO! (+15)</button>
            </div>
        `;
    }

    handleAction(type) {
        if (type === 'FINISH_DIRECT') {
            this.ctx.complete({
                title: 'Mistério Solucionado!',
                titleColor: 'var(--pop-green)',
                detailHTML: `<p style="font-weight:900; font-size:1.1em;">A mesa desvendou o caso com sucesso!</p>`,
                scoreMutations: this.players.map(p => ({ playerId: p.id, baseDelta: 15 })),
                celebrateWithConfetti: true
            });
        } else if (type === 'SURRENDER_MACABRO') {
            this.ctx.complete({
                title: 'Mistério Não Revelado!',
                titleColor: 'var(--pop-magenta)',
                detailHTML: `<p style="font-weight:900; font-size:1.1em;">A mesa não conseguiu desvendar o enigma. Nenhum ponto ganho.</p>`,
                scoreMutations: [],
                celebrateWithConfetti: false
            });
        }
    }
}

// ----------------------------------------------------
// 5. POSIÇÕES (ORDENAÇÃO INTERATIVA NA TELA)
// ----------------------------------------------------
class GamePosicoes {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = shuffle(teams[0]?.players || []);
        this.turn = 0;
        this.assigned = [];
        const nums = shuffle(Array.from({ length: 10 }, (_, i) => i + 1));
        this.players.forEach((p, idx) => {
            this.assigned.push({ id: p.id, name: p.name, num: nums[idx] });
        });
        this.tableOrder = [...this.assigned];

        // Papel Secreto Extra: O Sabotador
        this.isRoles = config?.isRoles ?? window.GIW.store?.isRoles ?? true;
        this.sabotadorIdx = -1;
        this.sabotador = null;
        if (this.isRoles && this.players.length >= 4) {
            this.sabotadorIdx = Math.floor(Math.random() * this.players.length);
            this.sabotador = this.players[this.sabotadorIdx];
        }
    }

    start() {
        appCore.nav('screen-reveal');
        this.renderTurn();
    }

    renderTurn() {
        const btnNext = document.getElementById('btn-next-player');
        if (btnNext) btnNext.style.display = 'none';
        document.getElementById('secret-cover').style.transform = 'translateY(0%)';

        if (this.turn < this.players.length) {
            const a = this.assigned[this.turn];
            const isSabotador = this.turn === this.sabotadorIdx;
            document.getElementById('turn-player-name').innerText = a.name;
            const sec = document.getElementById('secret-text');

            if (isSabotador) {
                document.getElementById('role-title').innerText = 'SUA NOTA (SABOTADOR! 🧨)';
                sec.innerHTML = `
                    <span style="color:var(--pop-yellow);">${a.num} / 10</span>
                    <div style="font-size:0.62em; color:var(--pop-magenta); margin-top:10px; line-height:1.25; background:rgba(255,0,85,0.12); padding:8px 10px; border-radius:10px; border:1.5px solid var(--pop-magenta); text-align:center;">
                        🧨 <b>VOCÊ É O SABOTADOR:</b><br>Dê dicas sutis e confusas! Se a mesa errar a ordenação, você fatura +20 Pts sozinho!
                    </div>
                `;
            } else {
                document.getElementById('role-title').innerText = 'SUA NOTA (1 A 10)';
                sec.innerText = `${a.num} / 10`;
                sec.style.color = 'var(--pop-yellow)';
            }
        } else {
            this.startOrdering();
        }
    }

    startOrdering() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Ordenar Cartas';
        this.renderOrderScreen();
    }

    renderOrderScreen() {
        const slots = this.tableOrder.map((item, idx) => `
            <div class="order-slot reorder-item">
                <span style="font-weight:900; font-size:1.1em;">${idx + 1}º: ${item.name}</span>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-dark btn-sm" onclick="minigames.movePos(${idx}, -1)">▲</button>
                    <button class="btn btn-dark btn-sm" onclick="minigames.movePos(${idx}, 1)">▼</button>
                </div>
            </div>
        `).join('');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:340px;">
                <p style="font-size:0.9em; font-weight:900; color:var(--pop-cyan); margin-bottom:10px;">DÊEM DICAS E COLOQUEM EM ORDEM CRESCENTE:</p>
                ${slots}
            </div>
            <button class="btn btn-success" style="max-width:320px;" onclick="minigames.verifyPos()">VERIFICAR GABARITO ✅</button>
        `;
    }

    movePos(idx, dir) {
        const target = idx + dir;
        if (target >= 0 && target < this.tableOrder.length) {
            const temp = this.tableOrder[idx];
            this.tableOrder[idx] = this.tableOrder[target];
            this.tableOrder[target] = temp;
            window.hapticTap();
            this.renderOrderScreen();
        }
    }

    verifyPos() {
        if (this.isVerifying) return;
        this.isVerifying = true;
        const realSorted = [...this.assigned].sort((a, b) => a.num - b.num);
        let correct = 0;
        const slots = document.querySelectorAll('.order-slot');

        let step = 0;
        const interval = setInterval(() => {
            if (step < this.tableOrder.length) {
                const item = this.tableOrder[step];
                const isMatch = item.id === realSorted[step].id;
                if (isMatch) correct++;

                const slotEl = slots[step];
                if (slotEl) {
                    slotEl.style.transition = 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    if (isMatch) {
                        slotEl.style.background = 'var(--pop-green)';
                        slotEl.style.color = '#ffffff';
                        slotEl.innerHTML = `
                            <span style="font-weight:900; font-size:1.1em;">${step + 1}º: ${item.name} (${item.num})</span>
                            <span style="font-size:1.3em;">✅</span>
                        `;
                        window.playSound('beep');
                        window.hapticTap();
                    } else {
                        slotEl.style.background = 'var(--pop-magenta)';
                        slotEl.style.color = '#ffffff';
                        slotEl.innerHTML = `
                            <span style="font-weight:900; font-size:1.1em;">${step + 1}º: ${item.name} (${item.num})</span>
                            <span style="font-size:1.1em;">❌</span>
                        `;
                        window.playSound('badum');
                    }
                    if (typeof window.gsap !== 'undefined') {
                        window.gsap.fromTo(slotEl, { scale: 1.08 }, { scale: 1, duration: 0.25 });
                    }
                }
                step++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    this.isVerifying = false;
                    const isFullWin = correct === this.assigned.length;
                    
                    if (this.sabotador && !isFullWin) {
                        // O Sabotador conseguiu fazer a mesa falhar!
                        window.playSound('wasted');
                        this.ctx.complete({
                            title: 'O Sabotador Triunfou! 🧨',
                            titleColor: 'var(--pop-magenta)',
                            detailHTML: `<p style="font-weight:900; font-size:1.15em;">A mesa errou a ordem! Acertos: <b>${correct} de ${this.assigned.length}</b>.<br>O Sabotador <b style="color:var(--pop-magenta);">${this.sabotador.name}</b> roubou +20 Pts sozinho!</p>`,
                            scoreMutations: [{ playerId: this.sabotador.id, baseDelta: 20 }],
                            losers: this.players.filter(p => p.id !== this.sabotador.id).map(p => p.id),
                            celebrateWithConfetti: true
                        });
                    } else {
                        const pts = correct * 5;
                        this.ctx.complete({
                            title: isFullWin ? 'Sintonia Perfeita!' : 'Fim da Ordenação!',
                            titleColor: isFullWin ? 'var(--pop-green)' : 'var(--pop-yellow)',
                            detailHTML: `<p style="font-weight:900; font-size:1.2em;">Acertos: <b>${correct} de ${this.assigned.length}</b> (+${pts} Pts)</p>` + (this.sabotador ? `<p style="font-size:0.85em; color:var(--ink-muted); margin-top:4px;">O Sabotador era <b>${this.sabotador.name}</b> e foi derrotado!</p>` : ''),
                            scoreMutations: this.players.map(p => ({ playerId: p.id, baseDelta: pts })),
                            celebrateWithConfetti: pts > 0
                        });
                    }
                }, 700);
            }
        }, 420);
    }

    handleAction(type, payload) {
        if (type === 'SHOW_SECRET') {
            document.getElementById('secret-cover').style.transform = 'translateY(100%)';
            document.getElementById('btn-next-player').style.display = 'block';
            window.hapticTap();
        } else if (type === 'HIDE_SECRET') {
            document.getElementById('secret-cover').style.transform = 'translateY(0%)';
        } else if (type === 'NEXT_TURN') {
            this.turn++;
            this.renderTurn();
        } else if (type === 'MOVE_POS') {
            this.movePos(payload.idx, payload.dir);
        } else if (type === 'VERIFY_POS') {
            this.verifyPos();
        }
    }
}

// ----------------------------------------------------
// 6. A NOTA (OCULTAÇÃO REAL ANTES DO CHUTE)
// ----------------------------------------------------
class GameNota {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        const allPlayers = teams[0]?.players?.length ? teams[0].players : (window.GIW.store.players || []);
        const shuf = shuffle([...allPlayers]);
        this.evaluator = shuf[0] || { id: 'p_eval', name: 'Avaliador' };
        this.guesser = shuf[1] || (shuf[0] ? { id: shuf[0].id + '_2', name: 'Adivinhador' } : { id: 'p_guess', name: 'Adivinhador' });
        this.secretNum = Math.floor(Math.random() * 10) + 1;
        this.categories = [
            '🍕 Uma Comida com essa nota',
            '🎬 Um Filme / Série com essa nota',
            '🎵 Uma Música com essa nota',
            '🦸 Um Superpoder com essa nota',
            '🚗 Um Carro com essa nota',
            '✈️ Um Destino de Férias com essa nota',
            '🎮 Um Jogo com essa nota',
            '📱 Um Aplicativo com essa nota'
        ];
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'A Nota (Em Dupla)';
        const gb = document.getElementById('gb-content');
        gb.innerHTML = `
            <div class="game-box-display">
                <p style="color:var(--pop-cyan); font-weight:900; font-size:1.05em; margin-bottom:4px;">DUPLA ATIVA:</p>
                <div style="font-size:1.25em; font-weight:900; color:var(--pop-yellow); margin-bottom:12px;">${this.evaluator.name} & ${this.guesser.name}</div>
                
                <div style="background:rgba(255,230,0,0.06); border:2px dashed var(--pop-yellow); border-radius:14px; padding:16px 12px; margin:10px 0;">
                    <p style="color:var(--pop-yellow); font-size:0.85em; font-weight:900; margin:0 0 8px 0;">APENAS ${this.evaluator.name.toUpperCase()} PODE VER:</p>
                    
                    <div id="nota-secret-display" style="min-height:90px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                        <div id="nota-hidden-placeholder" style="display:flex; flex-direction:column; align-items:center; gap:6px;">
                            <span style="font-size:2.4em;">🔒</span>
                            <span style="font-size:0.8em; font-weight:800; color:var(--ink-muted);">Segure o botão abaixo para revelar a nota</span>
                        </div>
                        <div id="nota-revealed-val" style="display:none; font-size:4em; font-weight:900; color:var(--pop-yellow); line-height:1; text-shadow:0 0 16px rgba(255,230,0,0.6);">
                            ${this.secretNum} <span style="font-size:0.4em; color:var(--ink-muted);">/ 10</span>
                        </div>
                    </div>
                </div>
                
                <button id="btn-hold-nota" class="btn btn-warning" style="user-select:none; touch-action:manipulation; font-size:1.05em; padding:15px; width:100%; max-width:320px;"
                    onpointerdown="minigames.revealNota(true)" 
                    onpointerup="minigames.revealNota(false)" 
                    onpointerleave="minigames.revealNota(false)"
                    ontouchstart="minigames.revealNota(true); event.preventDefault();"
                    ontouchend="minigames.revealNota(false); event.preventDefault();"
                    onmousedown="minigames.revealNota(true)"
                    onmouseup="minigames.revealNota(false)">
                    👆 SEGURE PARA VER A NOTA
                </button>
            </div>
            <button class="btn btn-primary" style="max-width:320px; margin-top:8px;" onclick="minigames.startNotaGuess()">JÁ MEMORIZEI — INICIAR PERGUNTAS ➔</button>
        `;
    }

    setRevealed(show) {
        const placeholder = document.getElementById('nota-hidden-placeholder');
        const val = document.getElementById('nota-revealed-val');
        const btn = document.getElementById('btn-hold-nota');
        if (!placeholder || !val) return;
        if (show) {
            placeholder.style.display = 'none';
            val.style.display = 'block';
            if (btn) btn.style.background = '#ffe600';
            window.playSound('pop');
            window.hapticTap();
        } else {
            placeholder.style.display = 'flex';
            val.style.display = 'none';
            if (btn) btn.style.background = '';
        }
    }

    startGuess() {
        const catButtons = this.categories.map(c => `
            <div class="chip" style="font-size:0.75em; cursor:pointer;" onclick="this.classList.toggle('on'); window.playSound('pop'); window.hapticTap();">
                ${c}
            </div>
        `).join('');

        const buttons = Array.from({ length: 10 }, (_, i) => `
            <button class="btn btn-dark" style="width:52px; padding:12px 6px; font-size:1.15em; font-weight:900;" onclick="minigames.guessNota(${i+1})">${i+1}</button>
        `).join('');

        const gb = document.getElementById('gb-content');
        gb.innerHTML = `
            <div class="game-box-display">
                <p style="color:var(--pop-cyan); font-weight:900; font-size:0.95em; margin-bottom:4px;">VEZ DE ${this.guesser.name.toUpperCase()} FAZER PERGUNTAS:</p>
                <p style="font-size:0.8em; color:var(--ink-muted); font-weight:800; margin-bottom:12px;">Faça perguntas para ${this.evaluator.name} ("Uma comida com essa nota?", etc.) para calibrar!</p>
                
                <div style="margin-bottom:14px;">
                    <button class="btn btn-dark btn-sm" style="font-size:0.78em; padding:6px 12px; border-radius:20px;" onclick="const el = document.getElementById('nota-suggestions-box'); el.style.display = el.style.display === 'none' ? 'flex' : 'none'; window.playSound('pop');">
                        💡 Sugestões de Perguntas (Toque para ver)
                    </button>
                    <div id="nota-suggestions-box" style="display:none; flex-wrap:wrap; gap:6px; justify-content:center; margin-top:8px; background:rgba(0,0,0,0.3); padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
                        ${catButtons}
                    </div>
                </div>

                <div style="border-top:1.5px solid rgba(255,255,255,0.1); padding-top:12px;">
                    <p style="font-size:0.9em; font-weight:900; color:var(--pop-yellow); margin-bottom:8px;">QUAL É A NOTA FINAL DE ${this.evaluator.name.toUpperCase()}?</p>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center;">${buttons}</div>
                </div>
            </div>
        `;
    }

    guess(n) {
        const diff = Math.abs(n - this.secretNum);
        const pts = diff === 0 ? 20 : diff === 1 ? 10 : 0;

        const gb = document.getElementById('gb-content');
        if (gb) {
            gb.innerHTML = `
                <div class="game-box-display">
                    <p style="color:var(--pop-cyan); font-weight:900;">VEREDITO DA DUPLA</p>
                    <div style="display:flex; justify-content:center; align-items:center; gap:20px; margin:16px 0;">
                        <div style="text-align:center;">
                            <div style="font-size:0.82em; font-weight:900; color:var(--ink-muted);">CHUTE DE ${this.guesser.name.toUpperCase()}</div>
                            <div style="font-size:3em; font-weight:900; color:var(--pop-yellow);">${n}</div>
                        </div>
                        <div style="font-size:2em; font-weight:900; color:var(--ink-muted);">VS</div>
                        <div style="text-align:center;">
                            <div style="font-size:0.82em; font-weight:900; color:var(--ink-muted);">NOTA DE ${this.evaluator.name.toUpperCase()}</div>
                            <div id="nota-real-val" style="font-size:3em; font-weight:900; color:var(--pop-green);">${this.secretNum}</div>
                        </div>
                    </div>
                    <div id="nota-verdict-tag" style="font-size:1.25em; font-weight:900; color:${diff === 0 ? 'var(--pop-green)' : diff === 1 ? 'var(--pop-yellow)' : 'var(--pop-magenta)'};">
                        ${diff === 0 ? '🎯 NA MOSCA! SINTONIA TOTAL!' : diff === 1 ? '🔥 QUASE LÁ! DIFERENÇA DE 1!' : '❌ LONGE DEMAIS!'}
                    </div>
                </div>
            `;
            if (typeof window.gsap !== 'undefined') {
                window.gsap.fromTo('#nota-real-val', { scale: 2.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' });
            }
            if (diff === 0) {
                window.playSound('success');
                window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 90 });
            } else if (diff === 1) {
                window.playSound('beep');
            } else {
                window.playSound('badum');
            }
            window.hapticTap();
        }

        setTimeout(() => {
            const duoIds = Array.from(new Set([this.evaluator.id, this.guesser.id]));
            const mutations = pts > 0 ? duoIds.map(id => ({ playerId: id, baseDelta: pts })) : [];
            this.ctx.complete({
                title: diff === 0 ? 'Sintonia Perfeita! 🎯' : diff === 1 ? 'Passou Raspando! 🔥' : 'Falta de Sintonia! ❌',
                titleColor: diff === 0 ? 'var(--pop-green)' : diff === 1 ? 'var(--pop-yellow)' : 'var(--pop-magenta)',
                detailHTML: `<p style="font-weight:900; font-size:1.15em;">Nota Real: <b>${this.secretNum}</b> | Chute da Dupla: <b>${n}</b><br>${pts > 0 ? `<b style="color:var(--pop-green);">+${pts} Pts para ${this.evaluator.name} e ${this.guesser.name}!</b>` : 'Nenhum ponto marcado pela dupla.'}</p>`,
                scoreMutations: mutations,
                celebrateWithConfetti: pts > 0
            });
        }, 1800);
    }

    handleAction(type, payload) {
        if (type === 'START_NOTA_GUESS') this.startGuess();
        else if (type === 'GUESS_NOTA') this.guess(payload);
        else if (type === 'REVEAL_NOTA') this.setRevealed(payload);
    }
}

// ----------------------------------------------------
// 7. ÚNICA PALAVRA (FILTRO AUTOMÁTICO DE REPETIDAS)
// ----------------------------------------------------
class GameUnica {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = shuffle(teams[0]?.players || []);
        this.guesser = this.players[0];
        this.clueGivers = this.players.slice(1);
        this.clueIdx = 0;
        this.clues = [];

        const words = ['Astronauta', 'Guitarra', 'Vampiro', 'Dinossauro', 'Cachoeira', 'Hambúrguer'];
        this.secretWord = words[Math.floor(Math.random() * words.length)];
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Única Palavra';
        this.renderClueInput();
    }

    renderClueInput() {
        if (this.clueIdx < this.clueGivers.length) {
            const p = this.clueGivers[this.clueIdx];
            document.getElementById('gb-content').innerHTML = `
                <div class="game-box-display">
                    <p style="color:var(--pop-magenta); font-weight:900;">${this.guesser.name} NÃO DEVE OLHAR!</p>
                    <p style="color:var(--pop-cyan); font-weight:900; font-size:1.1em;">Vez de: ${p.name}</p>
                    <div style="font-size:2em; font-weight:900; color:var(--pop-yellow); margin:10px 0;">${this.secretWord}</div>
                    <input type="text" id="clue-input-val" class="brutal-input" placeholder="DIGITE 1 PALAVRA" maxlength="15">
                </div>
                <button class="btn btn-primary" style="max-width:300px;" onclick="minigames.submitClue()">ENVIAR DICA ➔</button>
            `;
        } else {
            this.showFilteredClues();
        }
    }

    submitClue() {
        const val = document.getElementById('clue-input-val')?.value.trim().toUpperCase();
        if (!val) return window.showCustomAlert("Atenção", "Digite uma palavra de dica!");
        this.clues.push(val);
        this.clueIdx++;
        window.hapticTap();
        this.renderClueInput();
    }

    showFilteredClues() {
        const counts = {};
        this.clues.forEach(c => counts[c] = (counts[c] || 0) + 1);

        const clueTags = this.clues.map((c, idx) => `
            <div id="clue-tag-${idx}" class="btn btn-warning btn-sm" style="width:auto; font-size:1.15em; font-weight:900; transition:all 0.35s ease;">
                ${c}
            </div>
        `).join('');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display">
                <p style="color:var(--pop-cyan); font-weight:900;">ADIVINHADOR: ${this.guesser.name}</p>
                <p id="clue-audit-title" style="color:var(--ink-muted); font-size:0.9em; font-weight:800; margin-bottom:8px;">AUDITANDO DICAS DA MESA...</p>
                <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:14px 0;">${clueTags}</div>
            </div>
            <div style="display:flex; gap:10px; max-width:320px; width:100%;">
                <button class="btn btn-danger" onclick="minigames.finishUnica(false)">ERROU ❌</button>
                <button class="btn btn-success" onclick="minigames.finishUnica(true)">ACERTOU! ✅</button>
            </div>
        `;

        setTimeout(() => {
            let hasDuplicates = false;
            this.clues.forEach((c, idx) => {
                if (counts[c] > 1) {
                    hasDuplicates = true;
                    const tag = document.getElementById(`clue-tag-${idx}`);
                    if (tag) {
                        tag.style.background = 'var(--ink-dark)';
                        tag.style.color = 'var(--pop-magenta)';
                        tag.style.borderColor = 'var(--pop-magenta)';
                        tag.style.textDecoration = 'line-through';
                        tag.style.opacity = '0.55';
                        tag.innerHTML = `${c} <span style="font-size:0.8em;">(ANULADA)</span>`;
                    }
                }
            });

            const auditTitle = document.getElementById('clue-audit-title');
            if (hasDuplicates) {
                window.playSound('badum');
                window.GIW.bus.emit('fx:screenshake', { intensity: 'light', durationMs: 250 });
                if (auditTitle) auditTitle.innerHTML = '<b style="color:var(--pop-magenta);">DICAS REPETIDAS FORAM ANULADAS! 💥</b>';
            } else {
                window.playSound('success');
                if (auditTitle) auditTitle.innerHTML = '<b style="color:var(--pop-green);">TODAS AS DICAS SÃO ÚNICAS! 🌟</b>';
            }
        }, 750);
    }

    finish(isWin) {
        this.ctx.complete({
            title: isWin ? 'Acertou a Palavra!' : 'Errou o Alvo!',
            titleColor: isWin ? 'var(--pop-green)' : 'var(--pop-magenta)',
            detailHTML: `<p style="font-weight:900; font-size:1.2em;">Palavra Secreta: <b>${this.secretWord}</b> (+${isWin ? 20 : 0} Pts)</p>`,
            scoreMutations: isWin ? this.players.map(p => ({ playerId: p.id, baseDelta: 10 })) : [],
            celebrateWithConfetti: isWin
        });
    }

    handleAction(type, payload) {
        if (type === 'SUBMIT_CLUE') this.submitClue();
        else if (type === 'FINISH_UNICA') this.finish(payload);
    }
}

// ----------------------------------------------------
// 8. QUEM SOU EU (BATALHA EM EQUIPES - CELULAR DEITADO)
// ----------------------------------------------------
class GameQuemSouEu {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.teams = teams;
        const all = teams[0]?.players?.length ? teams[0].players : (window.GIW.store.players || []);
        
        // Forma 2 equipes com 2 jogadores cada (Adivinhador + Responde Dicas)
        if (teams.length >= 2 && teams[0]?.players?.length >= 2 && teams[1]?.players?.length >= 2) {
            this.t1Guesser = teams[0].players[0];
            this.t1Clue = teams[0].players[1];
            this.t2Guesser = teams[1].players[0];
            this.t2Clue = teams[1].players[1];
            this.team1List = teams[0].players;
            this.team2List = teams[1].players;
        } else {
            const shuf = shuffle([...all]);
            this.t1Guesser = shuf[0] || { id: 'p_g1', name: 'Guerreiro 1' };
            this.t1Clue = shuf[1] || { id: 'p_c1', name: 'Parceiro 1' };
            this.t2Guesser = shuf[2] || { id: 'p_g2', name: 'Guerreiro 2' };
            this.t2Clue = shuf[3] || { id: 'p_c2', name: 'Parceiro 2' };
            this.team1List = [this.t1Guesser, this.t1Clue];
            this.team2List = [this.t2Guesser, this.t2Clue];
        }

        const pool = shuffle([
            'Neymar', 'Batman', 'Silvio Santos', 'Cachorro', 'Homem-Aranha', 
            'Faustão', 'Bob Esponja', 'Coringa', 'Galinha', 'Shrek', 
            'Albert Einstein', 'Pikachu', 'Monalisa', 'Chaves', 'Voldemort',
            'Mário Bros', 'Barbie', 'Darth Vader', 'Gato', 'Goku'
        ]);
        this.w1 = pool[0];
        this.w2 = pool[1];
        this.elapsed = 0;
        this.ended = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Quem Sou Eu (Batalha em Equipes)';
        this.renderDuel();
    }

    renderDuel() {
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:540px; padding:14px 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="color:var(--pop-yellow); font-weight:900; font-size:0.85em; text-transform:uppercase; letter-spacing:1px;">📱 CELULAR DEITADO NA MESA</span>
                    <span id="qse-stopwatch" class="timer-number" style="font-size:1.3em; color:var(--pop-cyan);">⏱️ 00:00</span>
                </div>
                
                <p style="font-size:0.75em; color:var(--ink-muted); font-weight:800; margin-bottom:12px; line-height:1.3;">
                    Cada equipe joga ao mesmo tempo e responde <b>apenas entre si</b> ("Sim / Não")!<br>
                    Quem descobrir a sua palavra primeiro vence a corrida!
                </p>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    <!-- Lado Equipe 1 -->
                    <div style="background:rgba(0,229,255,0.06); border:2px solid var(--pop-cyan); border-radius:14px; padding:12px 6px; text-align:center; display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <span style="font-size:0.75em; font-weight:900; color:var(--pop-cyan); text-transform:uppercase;">EQUIPE 1</span>
                            <div style="font-size:0.8em; font-weight:800; color:#fff; margin:2px 0 6px 0;">
                                <b>${this.t1Clue.name}</b> responde para <b>${this.t1Guesser.name}</b>
                            </div>
                            <div style="background:rgba(0,0,0,0.35); border-radius:10px; padding:8px 4px; margin:4px 0;">
                                <div style="font-size:0.65em; font-weight:800; color:var(--ink-muted); text-transform:uppercase;">Palavra da Equipe 1:</div>
                                <div style="font-size:1.4em; font-weight:900; color:#fff; text-shadow:2px 2px 0 #000; word-break:break-word;">
                                    ${this.w1}
                                </div>
                            </div>
                        </div>
                        <button class="btn btn-success btn-sm" style="width:100%; font-size:0.85em; padding:12px 4px; margin-top:8px; font-weight:900;" onclick="minigames.qseHit(1)">
                            🏆 EQUIPE 1 ACERTOU!
                        </button>
                    </div>

                    <!-- Lado Equipe 2 -->
                    <div style="background:rgba(255,230,0,0.06); border:2px solid var(--pop-yellow); border-radius:14px; padding:12px 6px; text-align:center; display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <span style="font-size:0.75em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase;">EQUIPE 2</span>
                            <div style="font-size:0.8em; font-weight:800; color:#fff; margin:2px 0 6px 0;">
                                <b>${this.t2Clue.name}</b> responde para <b>${this.t2Guesser.name}</b>
                            </div>
                            <div style="background:rgba(0,0,0,0.35); border-radius:10px; padding:8px 4px; margin:4px 0;">
                                <div style="font-size:0.65em; font-weight:800; color:var(--ink-muted); text-transform:uppercase;">Palavra da Equipe 2:</div>
                                <div style="font-size:1.4em; font-weight:900; color:#fff; text-shadow:2px 2px 0 #000; word-break:break-word;">
                                    ${this.w2}
                                </div>
                            </div>
                        </div>
                        <button class="btn btn-warning btn-sm" style="width:100%; font-size:0.85em; padding:12px 4px; margin-top:8px; font-weight:900; color:#000;" onclick="minigames.qseHit(2)">
                            🏆 EQUIPE 2 ACERTOU!
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    tick(delta, elapsed) {
        if (this.ended) return;
        this.elapsed += delta;
        const mins = Math.floor(this.elapsed / 60).toString().padStart(2, '0');
        const secs = Math.floor(this.elapsed % 60).toString().padStart(2, '0');
        const el = document.getElementById('qse-stopwatch');
        if (el) el.innerText = `⏱️ ${mins}:${secs}`;
    }

    handleAction(type, payload) {
        if (this.ended) return;
        if (type === 'QSE_HIT') {
            this.ended = true;
            window.playSound('victory');
            window.hapticTap();
            window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 100 });

            const isTeam1 = Number(payload) === 1;
            const winningTeamName = isTeam1 ? 'Equipe 1' : 'Equipe 2';
            const winningPlayers = isTeam1 ? this.team1List : this.team2List;
            const losingPlayers = isTeam1 ? this.team2List : this.team1List;
            const winWord = isTeam1 ? this.w1 : this.w2;

            const mutations = winningPlayers.map(p => ({ playerId: p.id, baseDelta: 20 }));

            const mins = Math.floor(this.elapsed / 60);
            const secs = Math.floor(this.elapsed % 60);
            const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

            this.ctx.complete({
                title: `${winningTeamName.toUpperCase()} VENCEU A CORRIDA! 🏆`,
                titleColor: isTeam1 ? 'var(--pop-cyan)' : 'var(--pop-yellow)',
                detailHTML: `
                    <p style="font-weight:900; font-size:1.15em; margin-bottom:6px;">
                        Palavra acertada: <b>${winWord}</b> em apenas <b>${timeStr}</b>!
                    </p>
                    <p style="color:var(--pop-green); font-weight:800; font-size:0.95em;">
                        +20 Pts para todos os membros da ${winningTeamName}! (${winningPlayers.map(p => p.name).join(', ')})
                    </p>
                    <p style="font-size:0.8em; color:var(--ink-muted); margin-top:6px;">
                        A outra palavra era <i>${isTeam1 ? this.w2 : this.w1}</i>.
                    </p>
                `,
                scoreMutations: mutations,
                losers: losingPlayers.map(p => p.id),
                celebrateWithConfetti: true
            });
        }
    }
}

// ----------------------------------------------------
// 9. MEGA SENHA (DUELO ALTERNADO DE 5 PALAVRAS)
// ----------------------------------------------------
class GameMegaSenha {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.teams = teams;
        this.allPlayers = teams[0]?.players?.length ? teams[0].players : (window.GIW.store.players || []);
        
        // Garante 2 equipes/duplas para o duelo
        this.t1 = teams[0]?.players?.length ? teams[0] : { id: 0, players: [this.allPlayers[0] || { id: 'p1', name: 'Time 1' }] };
        this.t2 = teams[1]?.players?.length ? teams[1] : { id: 1, players: [this.allPlayers[1] || { id: 'p2', name: 'Time 2' }] };
        
        this.activeTeam = 0; // 0 = Time 1, 1 = Time 2
        this.teamScores = [0, 0];
        this.words = shuffle([
            'Astronauta', 'Chocolate', 'Vulcão', 'Castelo', 'Hospital', 
            'Bicicleta', 'Submarino', 'Dinossauro', 'Canguru', 'Pirata', 
            'Helicóptero', 'Microfone', 'Pizzaria', 'Fantasmas', 'Diamante'
        ]);
        this.wordIdx = 0;
        this.maxWords = 5;
        this.mordaca = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Mega Senha (Duelo)';
        document.getElementById('btn-in-game-store').style.display = 'block';
        this.renderTurn();
    }

    renderTurn() {
        const w = this.words[this.wordIdx % this.words.length];
        const teamName = this.activeTeam === 0 ? 'TIME 1' : 'TIME 2';
        const teamColor = this.activeTeam === 0 ? 'var(--pop-cyan)' : 'var(--pop-yellow)';
        const teamPlayers = this.activeTeam === 0 ? this.t1.players.map(p => p.name).join(' & ') : this.t2.players.map(p => p.name).join(' & ');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display word-card-flip" style="padding:18px 14px; width:100%; max-width:360px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-weight:900; font-size:0.85em;">
                    <span style="color:var(--pop-cyan);">Time 1: ${this.teamScores[0]} Pts</span>
                    <span style="color:var(--pop-yellow);">Palavra ${this.wordIdx + 1} de ${this.maxWords}</span>
                    <span style="color:var(--pop-magenta);">Time 2: ${this.teamScores[1]} Pts</span>
                </div>
                
                <div class="word-card-inner" id="ms-card-inner">
                    <div style="background:${teamColor}; color:#000; font-weight:900; font-size:0.82em; padding:3px 12px; border-radius:12px; display:inline-block; margin-bottom:6px;">
                        VEZ DO ${teamName} (${teamPlayers})
                    </div>
                    <p style="color:var(--ink-muted); font-size:0.75em; font-weight:800; margin:0 0 6px 0;">Oradores veem a senha e dão 1 palavra de dica:</p>
                    <div style="font-size:2.8em; font-weight:900; color:#fff; margin:10px 0; text-shadow:3px 3px 0 var(--ink-black); line-height:1.1;">
                        ${w}
                    </div>
                    <div id="ms-stamp" class="word-stamp-badge" style="display:none;"></div>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; max-width:340px; width:100%; margin-top:10px;">
                <button class="btn btn-success" style="font-size:0.95em;" onclick="minigames.hitWord()">
                    🎯 ${teamName} ACERTOU! (+10)
                </button>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-dark" style="flex:1; font-size:0.82em;" onclick="minigames.passTurn()">
                        ❌ ERROU (PASSA A VEZ) ➔
                    </button>
                    <button class="btn btn-danger" style="width:100px; font-size:0.82em;" onclick="minigames.skipWord()">
                        Pular ⏩
                    </button>
                </div>
            </div>
        `;
    }

    finish() {
        const mutations = [];
        if (this.t1?.players) {
            this.t1.players.forEach(p => mutations.push({ playerId: p.id, baseDelta: this.teamScores[0] || 0 }));
        }
        if (this.t2?.players) {
            this.t2.players.forEach(p => mutations.push({ playerId: p.id, baseDelta: this.teamScores[1] || 0 }));
        }
        const s0 = this.teamScores[0] || 0;
        const s1 = this.teamScores[1] || 0;
        const winnerTitle = s0 > s1 ? 'Vitória do Time 1!' : s1 > s0 ? 'Vitória do Time 2!' : 'Empate Técnico!';
        const losers = s0 > s1 ? this.t2.players.map(p => p.id) : s1 > s0 ? this.t1.players.map(p => p.id) : [];

        this.ctx.complete({
            title: winnerTitle,
            titleColor: s0 !== s1 ? 'var(--pop-green)' : 'var(--pop-yellow)',
            detailHTML: `<p style="font-weight:900; font-size:1.2em;">Time 1: <b>${s0} Pts</b> | Time 2: <b>${s1} Pts</b></p>`,
            scoreMutations: mutations,
            losers,
            celebrateWithConfetti: s0 !== s1
        });
    }

    handleAction(type, payload) {
        if (type === 'WORD_HIT') {
            this.teamScores[this.activeTeam] += 10;
            this.wordIdx++;
            window.playSound('success');
            window.hapticTap();
            if (this.wordIdx >= this.maxWords) {
                this.finish();
            } else {
                this.renderTurn();
            }
        } else if (type === 'PASS_TURN') {
            this.activeTeam = 1 - this.activeTeam;
            window.playSound('nav');
            window.hapticTap();
            this.renderTurn();
        } else if (type === 'WORD_SKIP') {
            this.wordIdx++;
            window.playBeep(false);
            if (this.wordIdx >= this.maxWords) {
                this.finish();
            } else {
                this.renderTurn();
            }
        } else if (type === 'SABOTAGE') {
            if (payload === 'mordaca') {
                this.mordaca = true;
                window.playSound('glitch');
                this.renderTurn();
            } else if (payload === 'tempo') {
                this.ctx.timer.add(-10);
                window.playKaboom();
                window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#00e5ff' });
            }
        }
    }
}

// ----------------------------------------------------
// 10. COMPLETA (SPEEDRUN 40s - TIMES DE 3)
// ----------------------------------------------------
class GameCompleta {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.teams = teams && teams.length > 0 ? teams : [{ id: 0, players: window.GIW.store.players || [] }];
        this.teamIdx = 0;
        this.teamScores = this.teams.map(() => 0);

        const pool = {
            'Animes & Séries': ['Demon Slayer', 'Naruto', 'One Piece', 'Stranger Things', 'Breaking Bad', 'Game of Thrones', 'Round 6', 'Pokémon'],
            'Filmes Clássicos': ['Titanic', 'Vingadores', 'Harry Potter', 'O Rei Leão', 'Star Wars', 'Shrek', 'Jurassic Park', 'Avatar'],
            'Super-Heróis': ['Homem-Aranha', 'Batman', 'Superman', 'Homem de Ferro', 'Coringa', 'Mulher-Maravilha', 'Hulk', 'Thor'],
            'Lugares & Cidades': ['Paris', 'Praia', 'Hospital', 'Navio Pirata', 'Estação Espacial', 'Cinema', 'Escola', 'Cassino']
        };
        const catKeys = Object.keys(pool);
        this.category = catKeys[Math.floor(Math.random() * catKeys.length)];
        this.deck = shuffle(pool[this.category]).slice(0, 8);
        this.wordIdx = 0;
        this.duration = 40;
        this.remaining = 40;
        this.ended = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Completa (40s Speedrun)';
        document.getElementById('btn-in-game-store').style.display = 'block';
        this.startTeamRun();
    }

    startTeamRun() {
        this.wordIdx = 0;
        this.remaining = this.duration;
        this.ctx.timer.start(this.duration);
        this.renderWord();
    }

    renderWord() {
        const team = this.teams[this.teamIdx];
        const teamName = this.teams.length > 1 ? `EQUIPE ${this.teamIdx + 1}` : 'EQUIPE';
        const teamMembers = team?.players?.map(p => p.name).join(', ') || 'Guerreiros';
        const currentWord = this.deck[this.wordIdx] || 'Fim das Palavras';

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display word-card-flip" style="padding:18px 14px; width:100%; max-width:360px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:0.85em; font-weight:900; color:var(--pop-cyan);">${teamName}</span>
                    <span id="completa-timer" class="timer-number" style="font-size:1.8em; color:var(--pop-magenta);">${Math.ceil(this.remaining)}s</span>
                    <span style="font-size:0.85em; font-weight:900; color:var(--pop-yellow);">Acertos: ${this.teamScores[this.teamIdx]}/8</span>
                </div>
                
                <div style="font-size:0.75em; color:var(--ink-muted); font-weight:800; margin-bottom:6px;">Membros: ${teamMembers}</div>
                <div style="background:rgba(0,229,255,0.08); border:2px solid var(--pop-cyan); border-radius:14px; padding:12px; margin:8px 0;">
                    <div style="font-size:0.8em; font-weight:900; color:var(--pop-yellow);">PALAVRA ${this.wordIdx + 1} DE 8:</div>
                    <div style="font-size:2.2em; font-weight:900; color:#fff; text-shadow:2px 2px 0 #000; margin:6px 0; min-height:44px; display:flex; align-items:center; justify-content:center;">
                        ${currentWord}
                    </div>
                    <p style="font-size:0.75em; color:var(--ink-muted); margin:0; line-height:1.2;">
                        Dica 1 diz 1 palavra ➔ Dica 2 diz 1 palavra ➔ Gritem <b>"COMPLETA!"</b> na vida real ➔ Adivinhador responde!
                    </p>
                </div>
            </div>

            <div style="display:flex; gap:8px; max-width:340px; width:100%; margin-top:8px;">
                <button class="btn btn-success" style="flex:1; font-size:1.05em; padding:14px 8px; font-weight:900;" onclick="minigames.hitWord()">
                    ✅ ACERTOU! (+10)
                </button>
                <button class="btn btn-dark" style="width:110px; font-size:0.9em; padding:14px 8px;" onclick="minigames.skipWord()">
                    Pular ⏩
                </button>
            </div>
        `;
    }

    tick(delta, elapsed, remaining) {
        if (this.ended) return;
        this.remaining = remaining;
        const el = document.getElementById('completa-timer');
        if (el) el.innerText = `${Math.ceil(remaining)}s`;
        if (remaining <= 0) {
            this.ctx.timer.stop();
            window.playSound('badum');
            this.finishTeamRun();
        }
    }

    finishTeamRun() {
        if (this.teamIdx + 1 < this.teams.length) {
            this.teamIdx++;
            window.playSound('victory');
            window.showCustomAlert(
                `Fim da Equipe ${this.teamIdx}!`, 
                `Eles acertaram ${this.teamScores[this.teamIdx - 1]} palavras!\nAgora é a vez da Equipe ${this.teamIdx + 1} (40s)!`, 
                '⏱️'
            );
            setTimeout(() => this.startTeamRun(), 1200);
        } else {
            this.ended = true;
            this.ctx.timer.stop();
            const mutations = [];
            this.teams.forEach((t, i) => {
                const pts = this.teamScores[i] * 10;
                t.players.forEach(p => mutations.push({ playerId: p.id, baseDelta: pts }));
            });

            const s0 = this.teamScores[0] || 0;
            const s1 = this.teamScores[1] || 0;
            const title = this.teams.length > 1
                ? (s0 > s1 ? 'Equipe 1 Venceu o Speedrun! 🏆' : s1 > s0 ? 'Equipe 2 Venceu o Speedrun! 🏆' : 'Empate no Speedrun! ⏱️')
                : 'Fim do Speedrun Completa!';

            this.ctx.complete({
                title,
                titleColor: 'var(--pop-green)',
                detailHTML: `<p style="font-weight:900; font-size:1.15em;">${this.teams.length > 1 ? `Equipe 1: <b>${s0} acertos</b> | Equipe 2: <b>${s1} acertos</b>` : `Acertos da Equipe: <b>${s0} de 8</b>`}</p>`,
                scoreMutations: mutations,
                celebrateWithConfetti: true
            });
        }
    }

    handleAction(type) {
        if (this.ended) return;
        if (type === 'WORD_HIT') {
            this.teamScores[this.teamIdx]++;
            this.wordIdx++;
            window.playSound('success');
            window.hapticTap();
            if (this.wordIdx >= this.deck.length) {
                this.ctx.timer.stop();
                this.finishTeamRun();
            } else {
                this.renderWord();
            }
        } else if (type === 'WORD_SKIP') {
            this.wordIdx++;
            window.playBeep(false);
            if (this.wordIdx >= this.deck.length) {
                this.ctx.timer.stop();
                this.finishTeamRun();
            } else {
                this.renderWord();
            }
        }
    }
}

// ----------------------------------------------------
// 11. MÍMICA (ESCOLHA DE 3 CARTAS & PONTOS DO ATOR)
// ----------------------------------------------------
class GameMimica {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.teams = teams;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.actor = this.players[Math.floor(Math.random() * this.players.length)] || { id: 'p_actor', name: 'Mímico' };

        const easyPool = shuffle([
            { t: "Fácil (+10)", w: "Escovando os Dentes", p: 10 },
            { t: "Fácil (+10)", w: "Tocando Bateria", p: 10 },
            { t: "Fácil (+10)", w: "Comendo Pizza Quente", p: 10 },
            { t: "Fácil (+10)", w: "Tirando Selfie no Espelho", p: 10 }
        ]);
        const medPool = shuffle([
            { t: "Médio (+20)", w: "Zumbi Dançando Balé", p: 20 },
            { t: "Médio (+20)", w: "Pescador Pegando Tubarão", p: 20 },
            { t: "Médio (+20)", w: "Astronauta Sem Gravidade", p: 20 },
            { t: "Médio (+20)", w: "Lutador de Sumô com Câimbra", p: 20 }
        ]);
        const hardPool = shuffle([
            { t: "Difícil (+30)", w: "Cirurgião em Montanha-Russa", p: 30 },
            { t: "Difícil (+30)", w: "Super-Herói Lavando Roupa", p: 30 },
            { t: "Difícil (+30)", w: "Ninja Trocando Fralda de Bebê", p: 30 }
        ]);

        this.cardOptions = [easyPool[0], medPool[0], hardPool[0]];
        this.chosenCard = null;
        this.duration = 60;
        this.remaining = 60;
        this.ended = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Mímica';
        document.getElementById('btn-in-game-store').style.display = 'none';
        this.renderSelection();
    }

    renderSelection() {
        const optionCards = this.cardOptions.map((c, i) => `
            <div onclick="minigames.pickMimicaCard(${i})" style="background:var(--bg-surface-elevated); border:2px solid ${c.p === 10 ? 'var(--pop-green)' : c.p === 20 ? 'var(--pop-yellow)' : 'var(--pop-magenta)'}; border-radius:14px; padding:12px; margin-bottom:10px; cursor:pointer; text-align:left; transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:900; font-size:0.85em; color:${c.p === 10 ? 'var(--pop-green)' : c.p === 20 ? 'var(--pop-yellow)' : 'var(--pop-magenta)'};">${c.t}</span>
                    <span style="font-size:0.9em; font-weight:900; color:#fff;">+${c.p} Pts</span>
                </div>
                <div style="font-size:1.25em; font-weight:900; color:#fff; margin-top:4px;">${c.w}</div>
            </div>
        `).join('');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:360px;">
                <p style="color:var(--pop-cyan); font-weight:900; font-size:0.95em; margin-bottom:4px;">ATOR DA VEZ: ${this.actor.name.toUpperCase()}</p>
                <p style="font-size:0.8em; color:var(--ink-muted); font-weight:800; margin-bottom:12px;">Escolha 1 das 3 cartas. O risco e os pontos são seus!</p>
                ${optionCards}
            </div>
        `;
    }

    pickCard(idx) {
        this.chosenCard = this.cardOptions[idx] || this.cardOptions[0];
        window.playSound('pop');
        window.hapticTap();
        this.ctx.timer.start(this.duration);
        this.renderActing();
    }

    renderActing() {
        const c = this.chosenCard;
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display word-card-flip" style="padding:22px 16px; width:100%; max-width:360px;">
                <span style="color:var(--pop-yellow); font-weight:900; font-size:1em;">${c.t}</span>
                <div style="font-size:2.2em; font-weight:900; color:var(--ink-white); margin:12px 0; text-shadow:3px 3px 0 var(--ink-black); line-height:1.2;">
                    ${c.w}
                </div>
                <div id="mimica-timer" class="timer-number" style="font-size:2.2em; margin-top:8px;">${Math.ceil(this.remaining)}s</div>
                <p style="font-size:0.75em; color:var(--ink-muted); font-weight:800; margin:6px 0 0 0;">Proibido sons! Atue apenas com gestos.</p>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; max-width:320px; width:100%; margin-top:10px;">
                <button class="btn btn-success" style="font-size:1.05em; padding:12px;" onclick="minigames.hitWord()">
                    ✅ ALGUÉM ADIVINHOU!
                </button>
                <button class="btn btn-dark" style="font-size:0.85em;" onclick="minigames.skipWord()">
                    Desistir / Tempo Esgotado ➔
                </button>
            </div>
        `;
    }

    tick(delta, elapsed, remaining) {
        if (this.ended) return;
        this.remaining = remaining;
        const el = document.getElementById('mimica-timer');
        if (el) el.innerText = `${Math.ceil(remaining)}s`;
        if (remaining <= 0) {
            this.ended = true;
            this.ctx.timer.stop();
            window.playKaboom();
            this.ctx.complete({
                title: 'Tempo Esgotado!',
                titleColor: 'var(--pop-yellow)',
                detailHTML: `<p style="font-weight:900; font-size:1.15em;">O tempo de 60s acabou! Ninguém pontuou nesta rodada.</p>`,
                scoreMutations: [],
                celebrateWithConfetti: false
            });
        }
    }

    handleAction(type, payload) {
        if (this.ended) return;
        if (type === 'PICK_MIMICA_CARD') {
            this.pickCard(Number(payload));
        } else if (type === 'WORD_HIT') {
            this.ctx.timer.stop();
            const cardPts = this.chosenCard ? this.chosenCard.p : 10;
            
            // Abre o modal pop para selecionar quem adivinhou na mesa
            const guesserCandidates = (window.GIW.store.players || []).filter(p => p.id !== this.actor.id);
            window.showPlayerSelectorModal({
                icon: '🤹',
                title: 'Quem da Mesa Adivinhou?',
                subtitle: `${this.actor.name} ganha +${cardPts} Pts e o adivinhador ganha +10 Pts!`,
                players: guesserCandidates.length > 0 ? guesserCandidates : window.GIW.store.players,
                cancelable: false,
                onSelect: (guesser) => {
                    this.ended = true;
                    window.playSound('victory');
                    window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 90 });

                    const mutations = [
                        { playerId: this.actor.id, baseDelta: cardPts },
                        { playerId: guesser.id, baseDelta: 10 }
                    ];

                    this.ctx.complete({
                        title: 'Mímica Desvendada! 🎭',
                        titleColor: 'var(--pop-green)',
                        detailHTML: `<p style="font-weight:900; font-size:1.15em;">Carta: <b>${this.chosenCard.w}</b><br><b style="color:var(--pop-yellow);">${this.actor.name}</b> faturou <b>+${cardPts} Pts</b> pelo risco!<br><b style="color:var(--pop-green);">${guesser.name}</b> foi rápido e faturou <b>+10 Pts</b>!</p>`,
                        scoreMutations: mutations,
                        celebrateWithConfetti: true
                    });
                }
            });
        } else if (type === 'WORD_SKIP') {
            this.ended = true;
            this.ctx.timer.stop();
            window.playSound('badum');
            this.ctx.complete({
                title: 'Mímica Não Revelada',
                titleColor: 'var(--pop-magenta)',
                detailHTML: `<p style="font-weight:900; font-size:1.15em;">A mímica era: <b>${this.chosenCard?.w || 'Desconhecida'}</b>. Nenhum ponto ganho.</p>`,
                scoreMutations: [],
                celebrateWithConfetti: false
            });
        }
    }
}

// ----------------------------------------------------
// 12. STOP DE RODA (DECAY SUAVE & ELIMINAÇÃO CONTÍNUA)
// ----------------------------------------------------
class GameStop {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.alivePlayers = [...this.players];
        this.eliminated = [];

        this.categories = [
            'Comida ou Fruta', 'Animal Selvagem', 'Nome de Cidade ou País',
            'Objeto de Casa', 'Filme ou Série', 'Profissão / Ocupação',
            'Marca Famosa', 'Bebida Gelada', 'Cor ou Estampa', 'Coisa de Praia'
        ];
        this.letters = 'ABCDEFGHIJKLMNOPRSTUV';
        this.category = this.categories[Math.floor(Math.random() * this.categories.length)];
        this.letter = this.letters[Math.floor(Math.random() * this.letters.length)];
        
        this.currIdx = 0;
        this.baseLimit = 10.0;
        this.timeLimit = 10.0;
        this.timeLeft = 10.0;
        this.ended = false;
        this.isIntermission = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Stop de Roda (Sobrevivência)';
        this.render();
    }

    render() {
        if (this.isIntermission) return;
        const currP = this.alivePlayers[this.currIdx % (this.alivePlayers.length || 1)] || { name: 'Guerreiro', id: 'p_none' };
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <p style="color:var(--pop-cyan); font-weight:900; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">TEMA: ${this.category}</p>
                <div style="font-size:0.8em; font-weight:800; color:var(--ink-muted); margin-bottom:6px;">Sobreviventes: ${this.alivePlayers.length} na roda</div>
                <p style="font-weight:900; font-size:1.15em; color:var(--pop-yellow); margin-bottom:8px;">VEZ DE: <u>${currP.name}</u></p>
                <div class="slot-letter-box">
                    <span class="slot-letter-number" id="stop-letter-num">${this.letter}</span>
                </div>
                <div id="stop-timer" class="timer-number" style="font-size:2.4em; color:var(--pop-magenta); margin-top:6px;">${this.timeLeft.toFixed(1)}s</div>
                <p style="color:var(--ink-muted); font-size:0.75em; font-weight:800; margin-top:4px;">Tempo atual por turno: ${this.timeLimit.toFixed(1)}s (-0.3s/acerto)</p>
            </div>
            <button class="btn btn-warning" style="max-width:320px; margin-bottom:8px;" onclick="minigames.nextLetter()">🔄 FALEI! NOVA LETRA</button>
            <button class="btn btn-danger btn-sm" style="max-width:320px;" onclick="minigames.triggerStopElimination()">TRAVOU! ELIMINAR 💀</button>
        `;
    }

    tick(delta) {
        if (this.ended || this.isIntermission) return;
        this.timeLeft = Math.max(0, this.timeLeft - delta);
        const timerEl = document.getElementById('stop-timer');
        if (timerEl) {
            timerEl.innerText = `${this.timeLeft.toFixed(1)}s`;
            if (this.timeLeft <= 3.0) {
                timerEl.style.transform = 'scale(1.15)';
                timerEl.style.color = 'var(--pop-magenta)';
            }
        }

        if (this.timeLeft <= 0) {
            this.handleTimeout();
        }
    }

    handleTimeout() {
        window.playKaboom();
        window.vibrar(600);
        window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 600 });
        this.triggerElimination();
    }

    triggerElimination() {
        this.isIntermission = true;
        window.showPlayerSelectorModal({
            icon: '⏰',
            title: 'Quem Travou no Stop?',
            subtitle: 'Esse guerreiro é eliminado. Os sobreviventes seguem com novo tema!',
            players: this.alivePlayers,
            cancelable: false,
            onSelect: (victim) => {
                this.alivePlayers = this.alivePlayers.filter(p => p.id !== victim.id);
                this.eliminated.push(victim);

                if (this.alivePlayers.length > 1) {
                    this.showEliminationIntermission(victim);
                } else {
                    this.finishSurvivorMatch();
                }
            }
        });
    }

    showEliminationIntermission(victim) {
        window.playSound('badum');
        const nextCategory = this.categories[Math.floor(Math.random() * this.categories.length)];
        const nextLetter = this.letters[Math.floor(Math.random() * this.letters.length)];

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <div style="font-size:3em; margin-bottom:6px;">💀</div>
                <h3 style="color:var(--pop-magenta); margin:0 0 6px 0;">${victim.name.toUpperCase()} ELIMINADO!</h3>
                <p style="color:var(--ink-muted); font-size:0.85em; font-weight:800; margin-bottom:12px;">
                    Restam <b>${this.alivePlayers.length} guerreiros</b> na disputa pelo topo!
                </p>
                <div style="background:rgba(0,229,255,0.08); border:1.5px dashed var(--pop-cyan); border-radius:12px; padding:10px;">
                    <span style="font-size:0.75em; color:var(--pop-cyan); font-weight:900;">PRÓXIMO TEMA & LETRA:</span>
                    <div style="font-size:1.15em; font-weight:900; color:#fff; margin-top:2px;">${nextCategory} (Letra: ${nextLetter})</div>
                </div>
            </div>
            <button class="btn btn-primary" style="max-width:320px;" onclick="minigames.continueStopRound('${nextCategory}', '${nextLetter}')">
                CONTINUAR BATALHA ➔
            </button>
        `;
    }

    continueRound(nextCategory, nextLetter) {
        this.category = nextCategory;
        this.letter = nextLetter;
        this.timeLimit = 10.0;
        this.timeLeft = 10.0;
        this.currIdx = 0;
        this.isIntermission = false;
        window.playSound('nav');
        window.hapticTap();
        this.render();
    }

    finishSurvivorMatch() {
        this.ended = true;
        const champion = this.alivePlayers[0] || this.players[0];
        window.playSound('victory');
        window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 120 });

        const mutations = [
            { playerId: champion.id, baseDelta: 25 },
            ...this.eliminated.map(p => ({ playerId: p.id, baseDelta: 0, falhasDelta: 1 }))
        ];

        this.ctx.complete({
            title: `${champion.name} é o Campeão! 👑`,
            titleColor: 'var(--pop-green)',
            detailHTML: `<p style="font-weight:900; font-size:1.2em;">Sobreviveu a todas as eliminações no Stop de Roda!<br><b style="color:var(--pop-green);">+25 Pts para o Campeão!</b></p>`,
            scoreMutations: mutations,
            losers: this.eliminated.map(p => p.id),
            celebrateWithConfetti: true
        });
    }

    handleAction(type, payload) {
        if (this.ended) return;
        if (type === 'NEXT_LETTER') {
            window.hapticTap();
            this.currIdx++;
            // Decay suave de -0.3s por acerto
            this.timeLimit = Math.max(4.0, this.timeLimit - 0.3);
            this.timeLeft = this.timeLimit;
            this.letter = this.letters[Math.floor(Math.random() * this.letters.length)];
            window.playSound('typewriter');
            this.render();
        } else if (type === 'TRIGGER_STOP_ELIM') {
            this.triggerElimination();
        } else if (type === 'CONTINUE_STOP') {
            this.continueRound(payload.cat, payload.letter);
        }
    }
}

// ----------------------------------------------------
// 13. SE VIRA (PAVIO CURTO & TENSÃO CRESCENTE)
// ----------------------------------------------------
class GameSeVira {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.alivePlayers = [...this.players];
        this.eliminated = [];
        this.round = 1;
        this.currIdx = 0;
        this.baseTime = 12.0;
        this.left = 12.0;
        this.categories = [
            "Coisas Amarelas", "Motivos para Terminar um Namoro", "Coisas que se Encontra na Cozinha",
            "Desculpas para Chegar Atrasado", "Coisas que se Faz no Banheiro", "Coisas Verdes",
            "Mentiras Clássicas de Segunda-feira", "Coisas que Dão Medo no Escuro", "Piores Presentes de Amigo Secreto",
            "Comidas Estranhas", "Coisas para Levar numa Ilha Deserta", "Profissões Perigosas",
            "Coisas que Têm Cheiro Forte", "Animais que Voam ou Nadam", "Coisas Proibidas num Avião",
            "Itens de uma Mochila de Viagem"
        ];
        this.category = this.categories[Math.floor(Math.random() * this.categories.length)];
        this.exploded = false;
        this.isIntermission = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Se Vira (Pavio Curto)';
        this.render();
    }

    render() {
        if (this.isIntermission) return;
        const p = this.alivePlayers[this.currIdx % (this.alivePlayers.length || 1)] || { name: 'Guerreiro', id: 'p_none' };
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="position:relative; overflow:hidden; width:100%; max-width:350px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:0.8em; font-weight:900; color:var(--pop-yellow);">RODADA ${this.round}</span>
                    <span style="font-size:0.78em; font-weight:800; color:var(--ink-muted);">Sobreviventes: ${this.alivePlayers.length}</span>
                </div>
                <p style="color:var(--pop-cyan); font-weight:900; font-size:1.1em; margin:2px 0 6px 0;">VEZ DE: <span style="color:var(--pop-yellow);">${p.name}</span></p>
                <div style="position:relative; display:inline-block; margin:6px 0;">
                    <div class="pulsing-bomb" id="sevira-bomb">💣</div>
                    <div class="bomb-spark">✨</div>
                </div>
                <div style="font-size:1.35em; font-weight:900; color:var(--ink-white); margin:4px 0; line-height:1.2;">${this.category}</div>
                <div id="sevira-num" class="timer-number" style="font-size:2.8em; color:var(--pop-magenta);">${this.left.toFixed(1)}s</div>
            </div>
            <button class="btn btn-success" style="max-width:320px; font-size:1.05em; padding:12px;" onclick="minigames.passSevira()">🔥 PASSEI A BOMBA! ➔</button>
        `;
    }

    tick(delta) {
        if (this.exploded || this.isIntermission) return;
        this.left = Math.max(0, this.left - delta);
        const el = document.getElementById('sevira-num');
        if (el) el.innerText = `${this.left.toFixed(1)}s`;

        const bomb = document.getElementById('sevira-bomb');
        if (bomb && this.left < 3.5) {
            bomb.style.filter = 'drop-shadow(0 0 25px #ff2a85)';
        }

        if (this.left <= 0) {
            this.handleExplosion();
        }
    }

    handleExplosion() {
        this.exploded = true;
        this.isIntermission = true;
        window.playKaboom();
        window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#ff2a85' });
        window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 700 });

        window.showPlayerSelectorModal({
            icon: '💥',
            title: 'A Bomba Explodiu!',
            subtitle: 'Quem estava segurando o celular no momento da explosão?',
            players: this.alivePlayers,
            cancelable: false,
            onSelect: (victim) => {
                this.alivePlayers = this.alivePlayers.filter(p => p.id !== victim.id);
                this.eliminated.push(victim);

                if (this.alivePlayers.length > 1) {
                    this.showEliminationIntermission(victim);
                } else {
                    this.finishSurvivorMatch();
                }
            }
        });
    }

    showEliminationIntermission(victim) {
        window.playSound('badum');
        this.round++;
        // Tensão aumenta: o tempo base da próxima rodada fica 25% mais curto!
        this.baseTime = Math.max(5.0, this.baseTime * 0.75);
        const nextCategory = this.categories[Math.floor(Math.random() * this.categories.length)];

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <div style="font-size:3em; margin-bottom:4px;">💥</div>
                <h3 style="color:var(--pop-magenta); margin:0 0 4px 0;">EXPLODIU EM ${victim.name.toUpperCase()}!</h3>
                <p style="color:var(--ink-muted); font-size:0.82em; font-weight:800; margin-bottom:12px;">
                    Eliminado da rodada! Restam <b>${this.alivePlayers.length} sobreviventes</b>.
                </p>
                <div style="background:rgba(255,0,85,0.08); border:1.5px dashed var(--pop-magenta); border-radius:12px; padding:10px; margin-bottom:6px;">
                    <span style="font-size:0.75em; color:var(--pop-magenta); font-weight:900;">TENSÃO MÁXIMA NA RODADA ${this.round}!</span>
                    <div style="font-size:1.1em; font-weight:900; color:#fff; margin-top:2px;">Novo Tema: "${nextCategory}"</div>
                    <div style="font-size:0.8em; font-weight:800; color:var(--pop-yellow); margin-top:2px;">Pavio encurtou para apenas ${this.baseTime.toFixed(1)}s!</div>
                </div>
            </div>
            <button class="btn btn-warning" style="max-width:320px;" onclick="minigames.continueSeviraRound('${nextCategory}')">
                CONTINUAR SE VIRA 💣
            </button>
        `;
    }

    continueRound(nextCategory) {
        this.category = nextCategory;
        this.left = this.baseTime;
        this.currIdx = 0;
        this.exploded = false;
        this.isIntermission = false;
        window.playSound('nav');
        window.hapticTap();
        this.render();
    }

    finishSurvivorMatch() {
        const champion = this.alivePlayers[0] || this.players[0];
        window.playSound('victory');
        window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 120 });

        const mutations = [
            { playerId: champion.id, baseDelta: 25 },
            ...this.eliminated.map(p => ({ playerId: p.id, baseDelta: 0, falhasDelta: 1 }))
        ];

        this.ctx.complete({
            title: `${champion.name} Sobreviveu à Bomba! 👑`,
            titleColor: 'var(--pop-green)',
            detailHTML: `<p style="font-weight:900; font-size:1.15em;">Sobrevivente supremo do Se Vira!<br><b style="color:var(--pop-green);">+25 Pts para o Campeão!</b></p>`,
            scoreMutations: mutations,
            losers: this.eliminated.map(p => p.id),
            celebrateWithConfetti: true
        });
    }

    handleAction(type, payload) {
        if (this.exploded || this.isIntermission) return;
        if (type === 'PASS_SEVIRA') {
            this.currIdx++;
            this.left = Math.max(3.5, this.left * 0.94);
            window.hapticTap();
            window.playSound('typewriter');
            window.playSound('beep');
            this.render();
        } else if (type === 'CONTINUE_SEVIRA') {
            this.continueRound(payload);
        }
    }
}

// ----------------------------------------------------
// 14. 5 SEGUNDOS (DIGA 3 COISAS)
// ----------------------------------------------------
class GameCinco {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.curr = this.players[0] || { id: 'p_none', name: 'Guerreiro' };
        this.left = 5.0;
        this.running = false;
        this.ended = false;
        const challenges = [
            "3 marcas de cerveja",
            "3 filmes de terror",
            "3 capitais do Brasil",
            "3 vilões da Disney",
            "3 desculpas para faltar ao trabalho",
            "3 coisas que você não quer achar na sua sopa",
            "3 coisas que se faz escondido",
            "3 raças de cachorro",
            "3 coisas que levaria pro apocalipse zumbi",
            "3 cantores que você tem vergonha de gostar",
            "3 mentiras que todo mundo conta",
            "3 coisas proibidas na igreja",
            "3 esportes com bola",
            "3 aplicativos que você mais abre",
            "3 remédios famosos para dor de cabeça",
            "3 sabores de pizza",
            "3 coisas que você sempre esquece em casa",
            "3 heróis dos Vingadores ou Liga da Justiça",
            "3 apelidos carinhosos cafonas",
            "3 comidas que não combinam com feijão"
        ];
        this.prompt = challenges[Math.floor(Math.random() * challenges.length)];
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = '5 Segundos';
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display">
                <p style="color:var(--pop-cyan); font-weight:900;">VEZ DE: ${this.curr.name}</p>
                <div style="font-size:2em; font-weight:900; color:var(--pop-yellow); margin:12px 0;">Diga ${this.prompt}!</div>
                <div id="cinco-num" class="timer-number" style="font-size:3.5em;">5.0s</div>
            </div>
            <button class="btn btn-warning" id="btn-start-cinco" style="max-width:320px;" onclick="minigames.startCinco()">⏱️ DISPARAR 5s!</button>
        `;
    }

    tick(delta) {
        if (this.running && !this.ended) {
            this.left = Math.max(0, this.left - delta);
            const el = document.getElementById('cinco-num');
            if (el) el.innerText = `${this.left.toFixed(1)}s`;
            if (this.left <= 0) {
                this.running = false;
                window.playKaboom();
                window.vibrar(400);
                document.getElementById('gb-content').innerHTML += `
                    <div style="display:flex; gap:10px; max-width:320px; width:100%; margin-top:12px;">
                        <button class="btn btn-danger" onclick="minigames.finishCinco(false)">FALHOU ❌</button>
                        <button class="btn btn-success" onclick="minigames.finishCinco(true)">CONSEGUIU! ✅</button>
                    </div>
                `;
            }
        }
    }

    handleAction(type, payload) {
        if (type === 'START_CINCO') {
            this.running = true;
            const btn = document.getElementById('btn-start-cinco');
            if (btn) btn.style.display = 'none';
            window.playBeep(true);
        } else if (type === 'FINISH_CINCO') {
            if (this.ended) return;
            this.ended = true;
            this.ctx.complete({
                title: payload ? 'Mandou Bem!' : 'Travou nos 5s!',
                titleColor: payload ? 'var(--pop-green)' : 'var(--pop-magenta)',
                detailHTML: `<p style="font-weight:900; font-size:1.2em;">${this.curr.name} ${payload ? 'garantiu +10 Pts' : 'levou 1 Falha'}!</p>`,
                scoreMutations: [{ playerId: this.curr.id, baseDelta: payload ? 10 : 0, falhasDelta: payload ? 0 : 1 }],
                losers: payload ? [] : [this.curr.id],
                celebrateWithConfetti: !!payload
            });
        }
    }
}

// ----------------------------------------------------
// 15. BATATA QUENTE (ACELERÔMETRO & SOBREVIVÊNCIA)
// ----------------------------------------------------
class GameBatata {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.alivePlayers = [...this.players];
        this.eliminated = [];
        this.currIdx = 0;
        this.round = 1;
        this.minTime = 10;
        this.maxTime = 20;
        this.explosionTime = this.minTime + Math.random() * (this.maxTime - this.minTime);
        this.elapsed = 0;
        this.exploded = false;
        this.intermission = false;
    }

    async start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Batata Quente';
        this.armSensor();
        this.render();
    }

    async armSensor() {
        if (!this.ctx.sandbox.bindDeviceMotion) return;
        const threshold = Math.max(14, 25 - (this.round * 2)); // Fica mais sensível a cada rodada
        await this.ctx.sandbox.bindDeviceMotion(() => {
            this.explode('Movimento brusco detectado pelo sensor!');
        }, threshold);
    }

    render() {
        if (this.intermission) return;
        const currentHolder = this.alivePlayers[this.currIdx % (this.alivePlayers.length || 1)] || { name: 'Guerreiro', id: 'p_none' };
        
        const aliveBadges = this.alivePlayers.map(p => 
            `<span style="display:inline-block; padding:3px 8px; border-radius:12px; background:rgba(255,255,255,0.08); font-size:0.75em; font-weight:800; border:1px solid rgba(255,255,255,0.15);">${p.name}</span>`
        ).join(' ');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="position:relative; overflow:hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:0.8em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; letter-spacing:1px;">Rodada ${this.round}</span>
                    <span style="font-size:0.8em; font-weight:900; color:var(--pop-magenta);">${this.alivePlayers.length} Vivos</span>
                </div>
                <p style="color:var(--pop-magenta); font-weight:900; font-size:1.2em; margin:6px 0;">BATATA COM: <span style="color:var(--pop-yellow);">${currentHolder.name}</span></p>
                
                <div style="position:relative; display:inline-block; margin:14px 0;">
                    <div class="pulsing-bomb" id="batata-bomb">💣</div>
                    <div class="bomb-spark">🔥</div>
                </div>
                
                <p style="color:var(--ink-muted); font-size:0.85em; font-weight:800;">Passe com muito cuidado! Cuidado com trepidação e o tempo secreto!</p>
                
                <div style="margin-top:10px; display:flex; gap:4px; flex-wrap:wrap; justify-content:center;">
                    ${aliveBadges}
                </div>
            </div>
            <button class="btn btn-warning" style="max-width:320px;" onclick="minigames.passBatata()">PASSEI A BOMBA ➔</button>
        `;

        if (typeof window.gsap !== 'undefined') {
            const pulseSpeed = Math.max(0.18, 0.45 - (this.round * 0.06));
            window.gsap.fromTo('#batata-bomb', 
                { scale: 0.88 }, 
                { scale: 1.18, duration: pulseSpeed, repeat: -1, yoyo: true, ease: 'power1.inOut' }
            );
        }
    }

    tick(delta, elapsed) {
        if (this.exploded || this.intermission) return;
        this.elapsed += delta;
        if (this.elapsed >= this.explosionTime) {
            this.explode('O tempo secreto da bomba esgotou!');
        }
    }

    explode(reason) {
        if (this.exploded) return;
        this.exploded = true;
        this.ctx.sandbox.clearDeviceMotion?.();
        window.playKaboom();
        window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#ff2a85' });
        window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 800 });
        window.vibrar(800);

        const currentHolder = this.alivePlayers[this.currIdx % (this.alivePlayers.length || 1)] || this.alivePlayers[0];

        // Se temos mais de 2 jogadores, permite confirmar/selecionar quem realmente estava com o celular na mão
        if (this.alivePlayers.length > 2) {
            window.showPlayerSelectorModal({
                icon: '💣',
                title: 'A BATATA EXPLODIU!',
                subtitle: `${reason}<br>Quem estava com o celular na mão quando estourou?`,
                players: this.alivePlayers,
                cancelable: false,
                onSelect: (chosen) => {
                    this.handleElimination(chosen, reason);
                }
            });
        } else {
            // Em final mano a mano, explode no atual direto
            this.handleElimination(currentHolder, reason);
        }
    }

    handleElimination(victim, reason) {
        this.eliminated.push(victim);
        this.alivePlayers = this.alivePlayers.filter(p => p.id !== victim.id);

        if (this.alivePlayers.length <= 1) {
            const champion = this.alivePlayers[0] || { name: 'Guerreiro', id: 'p_none' };
            const mutations = [
                { playerId: champion.id, baseDelta: 25 },
                ...this.eliminated.map(p => ({ playerId: p.id, baseDelta: 0, falhasDelta: 1, statPrendDelta: 1 }))
            ];
            this.ctx.complete({
                title: 'FIM DA BATATA QUENTE! 💣',
                titleColor: 'var(--pop-yellow)',
                detailHTML: `
                    <p style="font-weight:900; font-size:1.2em; color:var(--pop-green); margin-bottom:6px;">🏆 Campeão Sobrevivente: <b>${champion.name}</b> (+25 Pts)!</p>
                    <p style="font-size:0.9em; color:var(--ink-muted);">Último eliminado: <b>${victim.name}</b> (${reason})</p>
                `,
                scoreMutations: mutations,
                losers: this.eliminated.map(p => p.id),
                celebrateWithConfetti: true
            });
            return;
        }

        // Intermission: Mostra quem rodou e botão para próxima rodada com pavio mais curto
        this.intermission = true;
        this.renderIntermission(victim, reason);
    }

    renderIntermission(victim, reason) {
        const nextMin = Math.max(5, Math.round(this.minTime * 0.75));
        const nextMax = Math.max(9, Math.round(this.maxTime * 0.75));

        const survivorPills = this.alivePlayers.map(p => 
            `<span style="display:inline-block; padding:4px 10px; border-radius:14px; background:rgba(76,208,138,0.15); border:1px solid #4cd08a; color:#4cd08a; font-weight:800; font-size:0.85em;">🛡️ ${p.name}</span>`
        ).join(' ');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display">
                <p style="font-size:1.6em; margin-bottom:4px;">💥</p>
                <h3 style="color:var(--pop-magenta); font-weight:900; margin:0 0 8px 0;">EXPLODIU EM ${victim.name.toUpperCase()}!</h3>
                <p style="color:var(--ink-muted); font-size:0.9em; font-weight:700;">${reason}</p>
                <p style="color:var(--pop-magenta); font-weight:800; font-size:0.85em; margin-top:4px;">❌ ${victim.name} está eliminado da disputa!</p>
                
                <hr style="border:none; border-top:1px dashed rgba(255,255,255,0.15); margin:12px 0;">
                
                <p style="font-size:0.8em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase;">Sobreviventes na Roda (${this.alivePlayers.length}):</p>
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin-top:6px;">
                    ${survivorPills}
                </div>

                <div style="margin-top:12px; background:rgba(255,42,133,0.1); border:1px solid var(--pop-magenta); border-radius:8px; padding:8px;">
                    <p style="font-size:0.8em; font-weight:800; color:var(--pop-yellow); margin:0;">⚠️ Tensão Aumentada: Pavio ${nextMin}s a ${nextMax}s e sensor mais sensível!</p>
                </div>
            </div>
            <button class="btn btn-primary" style="max-width:320px;" onclick="minigames.continueBatataRound()">PRÓXIMA RODADA 🔥</button>
        `;
    }

    continueNextRound() {
        this.round++;
        this.minTime = Math.max(5, Math.round(this.minTime * 0.75));
        this.maxTime = Math.max(9, Math.round(this.maxTime * 0.75));
        this.explosionTime = this.minTime + Math.random() * (this.maxTime - this.minTime);
        this.elapsed = 0;
        this.exploded = false;
        this.intermission = false;
        this.currIdx = 0;
        this.armSensor();
        this.render();
    }

    handleAction(type) {
        if (type === 'PASS_BATATA') {
            if (this.exploded || this.intermission) return;
            this.currIdx++;
            window.hapticTap();
            window.playSound('typewriter');
            this.render();
            if (typeof window.gsap !== 'undefined') {
                window.gsap.fromTo('#batata-bomb', 
                    { x: -80, opacity: 0, rotation: -20 }, 
                    { x: 0, opacity: 1, rotation: 0, duration: 0.28, ease: 'back.out(2)' }
                );
            }
        } else if (type === 'CONTINUE_BATATA') {
            this.continueNextRound();
        }
    }
}

// ----------------------------------------------------
// 16. ÚLTIMO A FALAR (COM CRONÔMETRO DRAMÁTICO E SOBREVIVÊNCIA)
// ----------------------------------------------------
class GameUltimo {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.alivePlayers = [...this.players];
        this.eliminated = [];
        this.round = 1;
        this.themes = [
            "MARCAS DE CARRO",
            "PAÍSES DO MUNDO",
            "FRUTAS E VEGETAIS",
            "SÉRIES DA NETFLIX OU STREAMING",
            "BANDAS OU CANTORES FAMOSOS",
            "ITENS QUE TEM NO SUPERMERCADO",
            "MARCAS DE ROUPA OU TÊNIS",
            "ANIMAIS COM A LETRA 'C'",
            "PERSONAGENS DE DESENHO OU ANIME",
            "COISAS QUE VOCÊ ENCONTRA NO SHOPPING",
            "SABORES DE PIZZA",
            "FILMES DE SUPER-HERÓI",
            "JOGOS DE VIDEOGAME",
            "TIMES DE FUTEBOL DO MUNDO",
            "COISAS AMARELAS",
            "BEBIDAS NÃO ALCOÓLICAS",
            "MEIOS DE TRANSPORTE"
        ];
        this.theme = this.themes[Math.floor(Math.random() * this.themes.length)];
        this.phase = 'READY'; // READY -> COUNTDOWN -> ACTIVE -> INTERMISSION
        this.countdownValue = 3;
        this.countdownTimer = null;
        this.ended = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Último a Falar';
        this.startCountdown();
    }

    startCountdown() {
        this.phase = 'COUNTDOWN';
        this.countdownValue = 3;
        this.theme = this.themes[Math.floor(Math.random() * this.themes.length)];
        this.renderCountdown();

        clearInterval(this.countdownTimer);
        this.countdownTimer = setInterval(() => {
            this.countdownValue--;
            if (this.countdownValue > 0) {
                window.playSound('beep');
                this.renderCountdown();
            } else {
                clearInterval(this.countdownTimer);
                this.phase = 'ACTIVE';
                window.playKaboom();
                window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#ffea00' });
                window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 400 });
                window.vibrar(400);
                this.renderActive();
            }
        }, 1000);
        window.playSound('beep');
    }

    renderCountdown() {
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="padding:32px 16px; text-align:center;">
                <p style="color:var(--pop-yellow); font-weight:900; letter-spacing:2px; text-transform:uppercase; font-size:0.9em;">ATENÇÃO NA RODA!</p>
                <p style="color:var(--ink-muted); font-size:0.85em; font-weight:800; margin-bottom:18px;">O tema vai explodir na tela em...</p>
                
                <div id="ultimo-countdown-num" style="font-size:5.5em; font-weight:900; color:var(--pop-magenta); line-height:1; font-family:var(--font-display); text-shadow:0 0 20px rgba(255,42,133,0.6);">
                    ${this.countdownValue}
                </div>

                <p style="color:var(--ink-muted); font-size:0.8em; margin-top:20px;">Assim que aparecer, todos devem falar imediatamente uma palavra do tema!</p>
            </div>
        `;
        if (typeof window.gsap !== 'undefined') {
            window.gsap.fromTo('#ultimo-countdown-num', 
                { scale: 1.6, opacity: 0 }, 
                { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' }
            );
        }
    }

    renderActive() {
        const cards = this.alivePlayers.map(p => {
            const cardHTML = window.generateCardHTML(p).replace('width: 104px; height: 148px;', 'width: 78px; height: 110px; font-size:0.7em;');
            return `
                <div onclick="minigames.eliminateUltimo('${p.id}')" style="cursor:pointer; position:relative; transition:transform 0.2s;" class="touch-scale">
                    ${cardHTML}
                    <div style="margin-top:4px; font-size:0.7em; font-weight:900; color:var(--pop-magenta); text-align:center;">Toque se falhou</div>
                </div>
            `;
        }).join('');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="border:2px solid var(--pop-yellow); box-shadow:0 0 25px rgba(255,234,0,0.25);">
                <span style="font-size:0.8em; font-weight:900; color:var(--pop-magenta); text-transform:uppercase; letter-spacing:1px;">TEMA LIBERADO 🔥</span>
                <h1 style="color:var(--pop-yellow); font-size:1.8em; font-weight:900; margin:6px 0; line-height:1.1; text-shadow:0 2px 8px rgba(0,0,0,0.5);">${this.theme}</h1>
                <p style="color:var(--pop-cyan); font-size:0.85em; font-weight:800; margin-top:4px;">Quem foi o ÚLTIMO a falar, gaguejou ou repetiu?</p>
                <div style="font-size:0.8em; font-weight:900; color:var(--ink-muted); margin-top:4px;">Restam ${this.alivePlayers.length} de ${this.players.length} na disputa</div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin:12px 0;">
                ${cards}
            </div>

            <button class="btn btn-dark" style="max-width:320px;" onclick="minigames.finishDirect()">🏁 ENCERRAR DISPUTA</button>
        `;
    }

    eliminatePlayer(id) {
        if (this.ended) return;
        const victim = this.alivePlayers.find(p => p.id === id);
        if (!victim) return;

        this.eliminated.push(victim);
        this.alivePlayers = this.alivePlayers.filter(p => p.id !== id);

        window.playKaboom();
        window.vibrar(400);
        window.GIW.bus.emit('fx:screenshake', { intensity: 'light', durationMs: 250 });

        if (this.alivePlayers.length <= 1) {
            this.finishGame(victim);
        } else {
            this.renderIntermission(victim);
        }
    }

    renderIntermission(victim) {
        this.phase = 'INTERMISSION';
        const survivorsList = this.alivePlayers.map(p => 
            `<span style="display:inline-block; padding:4px 10px; border-radius:14px; background:rgba(76,208,138,0.15); border:1px solid #4cd08a; color:#4cd08a; font-weight:800; font-size:0.85em;">🛡️ ${p.name}</span>`
        ).join(' ');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display">
                <p style="font-size:1.6em; margin-bottom:4px;">🛑</p>
                <h3 style="color:var(--pop-magenta); font-weight:900; margin:0 0 6px 0;">${victim.name.toUpperCase()} FOI O ÚLTIMO!</h3>
                <p style="color:var(--ink-muted); font-size:0.85em; font-weight:800;">Eliminado da rodada no tema <i>"${this.theme}"</i>.</p>
                
                <hr style="border:none; border-top:1px dashed rgba(255,255,255,0.15); margin:12px 0;">
                
                <p style="font-size:0.8em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase;">Guerreiros Ainda Vivos (${this.alivePlayers.length}):</p>
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin-top:6px;">
                    ${survivorsList}
                </div>
            </div>
            <button class="btn btn-primary" style="max-width:320px;" onclick="minigames.startUltimoCountdown()">PRÓXIMO TEMA (3.. 2.. 1..) ➔</button>
        `;
    }

    finishGame(lastVictim) {
        if (this.ended) return;
        this.ended = true;
        clearInterval(this.countdownTimer);

        const champion = this.alivePlayers[0] || { name: 'Guerreiro', id: 'p_none' };
        const losersList = this.eliminated.map(p => p.id);

        const mutations = [
            { playerId: champion.id, baseDelta: 25 },
            ...this.eliminated.map(p => ({ playerId: p.id, baseDelta: 0, falhasDelta: 1 }))
        ];

        this.ctx.complete({
            title: 'FIM DO ÚLTIMO A FALAR!',
            titleColor: 'var(--pop-green)',
            detailHTML: `
                <p style="font-weight:900; font-size:1.2em; color:var(--pop-yellow);">🏆 Campeão com Reflexo de Ouro: <b>${champion.name}</b> (+25 Pts)!</p>
                <p style="font-size:0.85em; color:var(--ink-muted); margin-top:4px;">${this.eliminated.length} jogador(es) foram eliminados por lentidão.</p>
            `,
            scoreMutations: mutations,
            losers: losersList,
            celebrateWithConfetti: true
        });
    }

    handleAction(type, payload) {
        if (this.ended) return;
        if (type === 'ELIMINATE_ULTIMO') {
            this.eliminatePlayer(payload);
        } else if (type === 'START_ULTIMO_CD') {
            this.startCountdown();
        } else if (type === 'FINISH_DIRECT') {
            this.finishGame();
        }
    }
}

// ==========================================
// FAÇADES GLOBAIS DE CONTROLE
// ==========================================
minigames.startGameRouter = function() {
    runner.launch(window.GIW.store.currentGameActive);
};

minigames.showSecret = () => runner.action('SHOW_SECRET');
minigames.hideSecret = () => runner.action('HIDE_SECRET');
minigames.nextTurn = () => runner.action('NEXT_TURN');
minigames.startVoting = () => runner.action('START_VOTING');
minigames.castVote = (id) => runner.action('CAST_VOTE', id);

minigames.movePos = (idx, dir) => runner.action('MOVE_POS', { idx, dir });
minigames.verifyPos = () => runner.action('VERIFY_POS');

minigames.startNotaGuess = () => runner.action('START_NOTA_GUESS');
minigames.guessNota = (n) => runner.action('GUESS_NOTA', n);
minigames.revealNota = (show) => runner.action('REVEAL_NOTA', show);

minigames.submitClue = () => runner.action('SUBMIT_CLUE');
minigames.finishUnica = (win) => runner.action('FINISH_UNICA', win);

minigames.qseHit = (who) => runner.action('QSE_HIT', who);
minigames.qsePass = () => runner.action('QSE_PASS');

minigames.hitWord = (p) => runner.action('WORD_HIT', p);
minigames.skipWord = () => runner.action('WORD_SKIP');
minigames.passTurn = () => runner.action('PASS_TURN');
minigames.pickMimicaCard = (idx) => runner.action('PICK_MIMICA_CARD', idx);

minigames.nextLetter = () => runner.action('NEXT_LETTER');
minigames.triggerStopElimination = () => runner.action('TRIGGER_STOP_ELIM');
minigames.continueStopRound = (cat, letter) => runner.action('CONTINUE_STOP', { cat, letter });
minigames.passSevira = () => runner.action('PASS_SEVIRA');
minigames.continueSeviraRound = (cat) => runner.action('CONTINUE_SEVIRA', cat);
minigames.startCinco = () => runner.action('START_CINCO');
minigames.finishCinco = (win) => runner.action('FINISH_CINCO', win);
minigames.passBatata = () => runner.action('PASS_BATATA');
minigames.continueBatataRound = () => runner.action('CONTINUE_BATATA');
minigames.eliminateUltimo = (id) => runner.action('ELIMINATE_ULTIMO', id);
minigames.startUltimoCountdown = () => runner.action('START_ULTIMO_CD');
minigames.playerFault = (id) => runner.action('FAULT', id);
minigames.surrenderMacabro = () => runner.action('SURRENDER_MACABRO');
minigames.finishDirect = () => runner.action('FINISH_DIRECT');

minigames.buySabotage = function(item, cost) {
    const store = window.GIW.store;
    const runner = window.GIW.runner;
    const activeGame = runner?.activeGame;
    if (!activeGame) return;

    let balance = 0;
    let deductFn = null;

    if (activeGame.teamScores) {
        const tid = activeGame.activeTeam || 0;
        balance = activeGame.teamScores[tid] || 0;
        deductFn = (amount) => { activeGame.teamScores[tid] -= amount; };
    } else if (typeof activeGame.score === 'number') {
        balance = activeGame.score;
        deductFn = (amount) => { activeGame.score -= amount; };
    } else {
        const p = activeGame.players?.[0] || store.players[0];
        balance = p?.score || 0;
        deductFn = (amount) => { if (p) p.score = Math.max(0, p.score - amount); };
    }

    let finalCost = cost;
    if (store.isMarioKart) finalCost = Math.floor(cost / 2);

    if (balance < finalCost) {
        return window.showCustomAlert("Sem Saldo", `Você precisa de ${finalCost} Pts para comprar esta sabotagem!`, "❌");
    }

    if (deductFn) deductFn(finalCost);
    runner.action('SABOTAGE', item);
    window.playSound('glitch');
    appCore.closeModal('store-modal');
    window.showCustomAlert("Sabotagem Ativada!", `Você comprou ${item.toUpperCase()} por ${finalCost} Pts!`, "🛒");
};