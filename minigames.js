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
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.lastTime = performance.now();
        const loop = (now) => {
            if (!this.activeGame) return;
            const delta = Math.min((now - this.lastTime) / 1000, 0.1);
            this.lastTime = now;

            if (!this.isPaused && this.stageDuration > 0) {
                this.stageElapsed += delta;
            }
            const remaining = Math.max(0, this.stageDuration - this.stageElapsed);

            // Adrenalina & Tensão Procedural: Batimentos cardíacos, vibração e brilho crítico nos últimos 10s
            if (!this.isPaused && this.stageDuration > 0 && remaining <= 10 && remaining > 0) {
                window.playTension?.(remaining);
            }
            const boardEl = document.getElementById('screen-game-board');
            if (boardEl) {
                if (!this.isPaused && this.stageDuration > 0 && remaining <= 8 && remaining > 0) {
                    boardEl.classList.add('tension-critical-pulse');
                } else {
                    boardEl.classList.remove('tension-critical-pulse');
                }
            }

            if (this.activeGame && this.activeGame.tick) {
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
            const tourneyOver = window.GIW.store.isTourneyOver();
            if (window.GIW.store.tournamentMode) {
                btnNextTourney.style.display = 'block';
                if (tourneyOver) {
                    btnNextTourney.className = 'btn btn-success';
                    btnNextTourney.innerText = '👑 VER O CAMPEÃO SUPREMO! ➔';
                    btnNextTourney.onclick = () => appCore.encerrarNoite();
                } else {
                    btnNextTourney.className = 'btn btn-warning';
                    btnNextTourney.innerText = `🎰 PRÓXIMO JOGO (${window.GIW.store.tourneyCurrentRound + 1}/${window.GIW.store.tourneyMaxRounds}) ➔`;
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
                // Contagem animada dos pontos (0 -> topPts) com tick procedural
                const counter = { v: 0 };
                window.gsap.to(counter, {
                    v: topPts, duration: 0.7, delay: 0.35, ease: 'power1.out',
                    onUpdate: () => { badgeEl.innerText = `+${Math.round(counter.v)} PONTOS`; },
                    onComplete: () => { badgeEl.innerText = `+${topPts} PONTOS`; window.playSound('coin'); }
                });
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
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        window.stopTension?.();
        const boardEl = document.getElementById('screen-game-board');
        if (boardEl) boardEl.classList.remove('tension-critical-pulse');

        if (this.activeGame && this.activeGame.destroy) {
            try { this.activeGame.destroy(); } catch (_) {}
        }
        if (this.sandbox) {
            this.sandbox.dispose();
            this.sandbox = null;
        }
        this.activeGame = null;
        this.isPaused = true;
        const sb = document.getElementById('soundboard-ui');
        if (sb) sb.style.display = 'none';
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
    const vSpot = document.getElementById('verdict-spotlight');
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
    if (vSpot) {
        vSpot.className = 'verdict-spotlight';
        vSpot.style.opacity = '0';
    }
    if (vBadge) {
        vBadge.style.color = 'var(--pop-cyan)';
        vBadge.style.borderColor = 'var(--ink-black)';
    }
    if (vIcon) vIcon.innerText = '⚖️';
    if (vText) vText.innerText = 'A MESA ESTÁ EM SILÊNCIO...';

    window.playSound('heartbeat');
    window.hapticTap();

    if (typeof window.gsap !== 'undefined') {
        // Suspense: holofote acende devagar e a carta respira junto com o batimento
        if (vSpot) window.gsap.to(vSpot, { opacity: 1, duration: 1.2, ease: 'power2.out' });
        window.gsap.fromTo(vCardWrap, 
            { scale: 0.94, y: 12, opacity: 0.4 }, 
            { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' }
        );
        window.gsap.to(vCardWrap, { scale: 1.04, duration: 0.55, delay: 0.5, repeat: 3, yoyo: true, ease: 'sine.inOut' });
    }

    // Fase 1: tensão sobe aos 1.1s
    setTimeout(() => {
        if (vIcon) vIcon.innerText = '💓';
        if (vText) vText.innerText = 'O VEREDITO VAI SAIR...';
        if (vBadge) vBadge.style.color = 'var(--pop-yellow)';
        window.playSound('heartbeat');
        window.hapticTap();
    }, 1100);

    // Fase 2: carimbada de impacto aos 2.2s
    setTimeout(() => {
        if (vSpot) {
            const spotClass = isBobo ? null : (isGuilty ? 'is-safe' : 'is-hot');
            if (spotClass) vSpot.classList.add(spotClass);
        }

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
            if (vText) vText.innerText = 'ERROU! ERA INOCENTE';
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

            const palette = ['#ff7043', '#9c27b0', '#00b0ff', '#43a047', '#e91e63', '#ffb300', '#00e676', '#7c4dff'];
            const cardBgColor = p.bg && p.bg !== '#ffffff' ? p.bg : palette[this.turn % palette.length];

            const cardBg = document.getElementById('secret-card-bg');
            if (cardBg) cardBg.style.backgroundColor = cardBgColor;

            const pNameEl = document.getElementById('turn-player-name');
            if (pNameEl) pNameEl.innerText = p.name;

            const cardLbl = document.getElementById('reveal-card-player-label');
            if (cardLbl) cardLbl.innerText = p.name;

            const avatarSlot = document.getElementById('reveal-card-avatar-slot');
            if (avatarSlot) {
                const avatarImg = window.getDynamicDuoAvatarUrl ? window.getDynamicDuoAvatarUrl(p) : (p.avatarUrl || '');
                avatarSlot.innerHTML = avatarImg ? `<img src="${avatarImg}" alt="${p.name}" style="width: 78px; height: 78px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.3));">` : `<span style="font-size:3.8rem;">👤</span>`;
            }

            const roleTag = document.getElementById('reveal-card-role-tag');
            const roleTitle = document.getElementById('role-title');
            const sec = document.getElementById('secret-text');

            if (isImp) {
                if (roleTag) roleTag.className = 'studio-card-role-tag is-impostor';
                if (roleTitle) {
                    roleTitle.innerText = 'IMPOSTOR';
                    roleTitle.style.color = '#ff2a85';
                }
                if (sec) {
                    sec.innerHTML = '<span style="font-size:0.85rem; color:#ffffff; font-weight:700;">Descubra a palavra e blefe!</span>';
                }
            } else if (isBobo) {
                if (roleTag) roleTag.className = 'studio-card-role-tag';
                if (roleTitle) {
                    roleTitle.innerText = 'PALAVRA SECRETA';
                    roleTitle.style.color = '#00f0ff';
                }
                if (sec) {
                    sec.innerHTML = `
                        <div style="color:#ffffff; font-size:1.25rem; font-weight:900;">${this.secretWord}</div>
                        <div style="margin-top: 6px;">
                            <button type="button" class="bobo-pill-btn" onclick="minigames.toggleBoboHelp(event)" onpointerdown="event.stopPropagation()">
                                <span>🤡 Bobo da Corte</span>
                                <span id="bobo-help-icon" style="font-size:0.85em;">ℹ️</span>
                            </button>
                            <div id="bobo-help-desc" class="bobo-desc-box" style="display:none;" onpointerdown="event.stopPropagation()">
                                🎯 <b>MISSÃO SECRETA:</b><br>Finja suspeita para a mesa votar em você no tribunal (+25 Pts)!
                            </div>
                        </div>
                    `;
                }
            } else {
                if (roleTag) roleTag.className = 'studio-card-role-tag';
                if (roleTitle) {
                    roleTitle.innerText = 'PALAVRA SECRETA';
                    roleTitle.style.color = '#00f0ff';
                }
                if (sec) {
                    sec.innerHTML = `<span style="color:#ffffff; font-size:1.3rem; font-weight:900;">${this.secretWord}</span>`;
                }
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
            <div class="studio-card-setting" style="margin-bottom:14px; text-align:center; width:100%; max-width:340px;">
                <div style="width:100%;">
                    <div class="studio-card-title" style="color:var(--pop-cyan); letter-spacing:1px;">TEMA DA SALA</div>
                    <div style="font-size:2.2rem; font-weight:900; color:var(--pop-yellow); margin:4px 0;">${this.category}</div>
                    <div class="studio-card-desc">Dica inicial por: <b style="color:#fff;">${starter.name}</b></div>
                </div>
            </div>
            
            <div class="studio-timer-hero">
                <div class="studio-timer-label">TEMPO DE DISCUSSÃO</div>
                <div id="imp-timer" class="studio-timer-digits">--:--</div>
            </div>

            <div style="width:100%; max-width:320px; margin-top:20px;">
                <button class="studio-btn-cta" style="background:var(--pop-magenta); color:#fff; box-shadow: 0 8px 30px rgba(255, 42, 133, 0.4);" onclick="minigames.startVoting()">
                    <span>ABRIR VOTAÇÃO</span>
                    <span style="font-size:1.15em;">🔥</span>
                </button>
            </div>
        `;
        this.ctx.timer.start(this.config.time || 240);
    }

    tick(delta, elapsed, remaining) {
        if (this.phase === 'DISCUSSION') {
            const el = document.getElementById('imp-timer');
            if (el) {
                const s = Math.ceil(remaining);
                const m = Math.floor(s / 60);
                const sec = s % 60;
                el.innerText = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                if (remaining <= 10) {
                    el.style.color = 'var(--pop-magenta)';
                } else if (remaining <= 30) {
                    el.style.color = 'var(--pop-yellow)';
                } else {
                    el.style.color = '#ffffff';
                }
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
        minigames.selectedVotePlayerId = null;

        const btnConfirm = document.getElementById('btn-confirm-vote');
        if (btnConfirm) {
            btnConfirm.style.opacity = '0.4';
            btnConfirm.style.pointerEvents = 'none';
        }

        const c = document.getElementById('vote-list-container');
        c.className = 'studio-vote-grid';
        let html = '';
        this.players.forEach((p, idx) => {
            html += `
                <div class="studio-vote-item" onclick="minigames.selectVoteTarget(this, '${p.id}')">
                    ${window.generateStudioPlayerCard(p, { index: idx })}
                </div>
            `;
        });
        c.innerHTML = html;
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
            roleLabel: 'IMPOSTOR',
            onComplete: () => {
                if (isBoboCaught) {
                    this.ctx.complete({
                        title: 'O Bobo da Corte Venceu! 🤡',
                        titleColor: 'var(--pop-yellow)',
                        detailHTML: `<p style="font-weight:900; font-size:1.15em;"><b style="color:var(--pop-yellow);">${this.bobo.name}</b> foi eliminado de propósito e roubou todos os pontos!<br><span style="font-size:0.9em; color:var(--ink-muted);">Palavra Secreta: <b>${this.secretWord}</b> • Impostor: <b style="color:var(--pop-magenta);">${this.impostor.name}</b></span></p>`,
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
                    title: isCaught ? 'Impostor Desmascarado! 🕵️' : 'O Impostor Venceu! 🎭',
                    titleColor: isCaught ? 'var(--pop-green)' : 'var(--pop-magenta)',
                    detailHTML: `<p style="font-weight:900; font-size:1.2em;">Palavra Secreta: <b style="color:var(--pop-cyan);">${this.secretWord}</b><br>Impostor: <b style="color:var(--pop-magenta);">${this.impostor.name}</b></p>`,
                    scoreMutations: mutations,
                    losers,
                    celebrateWithConfetti: true
                });
            }
        });
    }

    showCover() {
        minigames.animateCardReveal(true);
    }

    hideCover() {
        minigames.animateCardReveal(false);
    }

    nextTurn() {
        window.GIW_boboHelpOpen = false;
        minigames.animateCardPass(() => {
            this.turn++;
            this.renderTurn();
        });
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
            ['Cinema', 'Pipoca'], ['Gato', 'Cachorro'], ['Cerveja', 'Churrasco'],
            ['Arroz', 'Feijão'], ['Queijo', 'Goiabada'], ['Romeu', 'Julieta'],
            ['Vinho', 'Taça'], ['Praia', 'Protetor Solar'], ['Chuva', 'Guarda-Chuva'],
            ['Garfo', 'Faca'], ['Lápis', 'Borracha'], ['Médico', 'Estetoscópio'],
            ['Vampiro', 'Alho'], ['Super-Homem', 'Kryptonita'], ['Mario', 'Luigi'],
            ['Pão de Queijo', 'Café com Leite'], ['Relógio', 'Alarme'], ['Violão', 'Palheta'],
            ['Tênis', 'Meia'], ['Bolo', 'Vela de Aniversário'], ['Avião', 'Pára-quedas'],
            ['Navio', 'Âncora'], ['Policial', 'Ladrão'], ['Mágico', 'Cartola']
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
        this.turn = 0;
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
            document.getElementById('turn-player-name').innerText = p.name;
            const sec = document.getElementById('secret-text');

            if (r.isImp) {
                document.getElementById('role-title').innerText = 'ALERTA!';
                sec.innerText = r.word;
                sec.style.color = 'var(--pop-magenta)';
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
                <button class="btn btn-danger" style="max-width:320px;" onclick="minigames.startVoting()">ABRIR VOTAÇÃO DA MESA ➔</button>
            `;
        }
    }

    handleAction(type, payload) {
        if (type === 'SHOW_SECRET') {
            minigames.animateCardReveal(true);
        } else if (type === 'HIDE_SECRET') {
            minigames.animateCardReveal(false);
        } else if (type === 'NEXT_TURN') {
            window.GIW_boboHelpOpen = false;
            minigames.animateCardPass(() => {
                this.turn++;
                this.renderTurn();
            });
        } else if (type === 'START_VOTING') {
            appCore.nav('screen-vote');
            const c = document.getElementById('vote-list-container');
            c.className = 'studio-vote-grid';
            let html = '';
            this.players.forEach((p, idx) => {
                html += `
                    <div class="studio-vote-item" onclick="minigames.selectVoteTarget(this, '${p.id}')">
                        ${window.generateStudioPlayerCard(p, { index: idx })}
                    </div>
                `;
            });
            c.innerHTML = html;
        } else if (type === 'CAST_VOTE') {
            const impostor = this.players[this.impostorIdx];
            const votedPlayer = this.players.find(p => String(p.id) === String(payload)) || window.GIW.store.players.find(p => String(p.id) === String(payload));
            const isCaught = String(payload) === String(impostor.id);
            runCinematicVerdict({
                votedPlayer,
                isGuilty: isCaught,
                realCulprit: impostor,
                roleLabel: 'INFILTRADO',
                isBobo: false,
                onComplete: () => {
                    const mutations = [];
                    const losers = [];
                    if (isCaught) {
                        this.players.forEach(p => {
                            if (p.id !== impostor.id) mutations.push({ playerId: p.id, baseDelta: 10 });
                        });
                        losers.push(impostor.id);
                        this.ctx.complete({
                            title: 'Infiltrado Desmascarado! 👯',
                            titleColor: 'var(--pop-green)',
                            detailHTML: `<p style="font-weight:900; font-size:1.15em;">Infiltrado: <b style="color:var(--pop-magenta);">${impostor.name}</b><br><span style="font-size:0.9em; color:var(--ink-muted);">As duplas se uniram e eliminaram o infiltrado com sucesso!</span></p>`,
                            scoreMutations: mutations,
                            losers,
                            celebrateWithConfetti: true
                        });
                    } else {
                        mutations.push({ playerId: impostor.id, baseDelta: 15, statImpDelta: 1 });
                        this.players.forEach(p => { if (p.id !== impostor.id) losers.push(p.id); });
                        this.ctx.complete({
                            title: 'O Infiltrado Venceu a Mesa! 🎭',
                            titleColor: 'var(--pop-magenta)',
                            detailHTML: `<p style="font-weight:900; font-size:1.15em;">Infiltrado: <b style="color:var(--pop-magenta);">${impostor.name}</b><br><span style="font-size:0.9em; color:var(--ink-muted);">O infiltrado passou despercebido e faturou a rodada sozinho!</span></p>`,
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
            { q: "Dois homens entram num bar e pedem a mesma bebida com muito gelo. Um bebe tudo de um gole só e sobrevive; o outro bebe devagar e morre.", a: "O veneno estava congelado nos cubos de gelo. Quem bebeu rápido não deu tempo do veneno derreter." },
            { q: "Um homem morre em uma cabine telefônica com os braços abertos e as janelas quebradas.", a: "Ele era pescador e estava gesticulando no telefone sobre o tamanho gigante do peixe que pescou, quebrando os vidros e cortando os pulsos." },
            { q: "Um homem é encontrado morto em um campo vazio com um pacote fechado nas costas.", a: "Seu paraquedas não abriu durante o salto." },
            { q: "Música para, mulher morre. O que aconteceu?", a: "Ela era equilibrista cega de circo. A música indicava o momento exato de dar o salto mortal; a música parou antes da hora e ela caiu no vazio." },
            { q: "Um homem morre afogado no meio de um incêndio florestal no topo de uma colina.", a: "Ele estava mergulhando em um lago quando um avião-tanque dos bombeiros coletou a água do lago e o despejou com a água sobre as chamas." },
            { q: "Um homem entra em um bar e pede um copo d'água. O barman saca uma arma e aponta pra ele. O homem diz 'Obrigado!' e vai embora.", a: "O homem estava com um soluço incontrolável. O susto curou o soluço!" },
            { q: "Um homem mora no 20º andar. Em dias de chuva ele pega o elevador até o 20º. Em dias de sol, vai até o 10º e sobe o resto pelas escadas. Por quê?", a: "Ele é uma pessoa com nanismo e só alcança o botão do 20º andar quando está carregando seu guarda-chuva!" },
            { q: "Um corpo sem vida está no chão rodeado por 53 bicicletas.", a: "Ele foi pego trapaceando no carteado (Bicycle é a marca de baralhos mais famosa, e um baralho tem 52 cartas + 1 extra)." }
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
                title: 'Mistério Não Desvendado! 🕵️',
                titleColor: 'var(--pop-magenta)',
                detailHTML: `<p style="font-weight:900; font-size:1.1em;">A mesa não conseguiu desvendar o enigma a tempo. Nenhum ponto ganho.</p>`,
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

        // Papel Secreto Extra: O Sabotador (desligado por padrão, ativável no Lobby)
        this.isRoles = config?.isRoles ?? window.GIW.store?.isRoles ?? false;
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
            document.getElementById('role-title').innerText = 'SUA NOTA (1 A 10)';
            const sec = document.getElementById('secret-text');

            if (isSabotador) {
                sec.innerHTML = `
                    <span style="color:var(--pop-yellow);">${a.num} / 10</span>
                    <div style="margin-top: 14px; display:flex; flex-direction:column; align-items:center;">
                        <button type="button" class="bobo-pill-btn" onclick="minigames.toggleBoboHelp(event)" onpointerdown="event.stopPropagation()">
                            <span>🧨 Sabotador</span>
                            <span id="bobo-help-icon" style="font-size:0.85em; opacity:0.85;">ℹ️</span>
                        </button>
                        <div id="bobo-help-desc" class="bobo-desc-box" style="display:none;" onpointerdown="event.stopPropagation()">
                            🧨 <b>MISSÃO SECRETA:</b><br>Dê dicas sutis e confusas! Se a mesa errar a ordenação, você fatura +20 Pts sozinho!
                        </div>
                    </div>
                `;
            } else {
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
            minigames.animateCardReveal(true);
        } else if (type === 'HIDE_SECRET') {
            minigames.animateCardReveal(false);
        } else if (type === 'NEXT_TURN') {
            window.GIW_boboHelpOpen = false;
            minigames.animateCardPass(() => {
                this.turn++;
                this.renderTurn();
            });
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
        const allPlayers = window.GIW.store.players || [];
        
        // Garante 2 duplas: Dupla 1 (Avaliador 1 + Adivinhador 1) vs Dupla 2 (Avaliador 2 + Adivinhador 2)
        if (teams.length >= 2 && teams[0]?.players?.length >= 2 && teams[1]?.players?.length >= 2) {
            this.t1 = teams[0].players;
            this.t2 = teams[1].players;
        } else {
            const shuf = shuffle([...allPlayers]);
            this.t1 = [shuf[0] || { id: 'p1', name: 'Jogador 1' }, shuf[1] || { id: 'p2', name: 'Jogador 2' }];
            this.t2 = [shuf[2] || { id: 'p3', name: 'Jogador 3' }, shuf[3] || { id: 'p4', name: 'Jogador 4' }];
        }

        this.t1Eval = this.t1[0];
        this.t1Guess = this.t1[1];
        this.t2Eval = this.t2[0];
        this.t2Guess = this.t2[1];

        this.note1 = Math.floor(Math.random() * 10) + 1;
        this.note2 = Math.floor(Math.random() * 10) + 1;

        this.memoStep = 1; // 1: Avaliador 1 memoriza, 2: Avaliador 2 memoriza, 3: Duelo
        this.activeTeam = 0; // 0 = Dupla 1, 1 = Dupla 2
        this.roundNum = 1;

        this.categories = [
            '🍕 Uma Comida com essa nota',
            '🎬 Um Filme ou Série com essa nota',
            '🎵 Uma Música com essa nota',
            '🦸 Um Superpoder com essa nota',
            '🚗 Um Carro com essa nota',
            '✈️ Um Destino de Férias com essa nota',
            '🎮 Um Jogo de Videogame com essa nota',
            '📱 Um Aplicativo de Celular com essa nota',
            '💘 Uma Cantada no Primeiro Encontro com essa nota',
            '👔 Um Look para ir a um Casamento com essa nota',
            '💀 Uma Mentira Contada para o Chefe com essa nota',
            '🏨 Um Hotel ou Pousada com essa nota',
            '🎁 Um Presente de Aniversário com essa nota',
            '🧟 Uma Estratégia num Apocalipse Zumbi com essa nota',
            '🍔 Um Lanche Podrão de Rua com essa nota',
            '🍻 Uma Marca de Cerveja ou Bebida com essa nota',
            '💔 Um Motivo para Terminar um Namoro com essa nota',
            '🎨 Uma Ideia de Tatuagem com essa nota',
            '🧗 Um Esporte Radical com essa nota',
            '📺 Um Desenho Animado da Infância com essa nota',
            '🛋️ Um Sofá ou Móvel de Casa com essa nota',
            '🐶 Uma Raça de Cachorro com essa nota',
            '🏖️ Uma Praia Brasileira com essa nota',
            '📻 Uma Música para Tocar no seu Velório com essa nota'
        ];
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'A Nota (Duelo de Duplas)';
        this.renderMemorization();
    }

    renderMemorization() {
        const isFirst = this.memoStep === 1;
        const evalPlayer = isFirst ? this.t1Eval : this.t2Eval;
        const guessPlayer = isFirst ? this.t1Guess : this.t2Guess;
        const teamName = isFirst ? 'DUPLA 1' : 'DUPLA 2';
        const teamColor = isFirst ? 'var(--pop-cyan)' : 'var(--pop-yellow)';
        const note = isFirst ? this.note1 : this.note2;
        const nextActionLabel = isFirst 
            ? `JÁ MEMORIZEI ➔ VEZ DA DUPLA 2` 
            : `JÁ MEMORIZEI ➔ INICIAR DUELO ⚔️`;

        const gb = document.getElementById('gb-content');
        gb.innerHTML = `
            <div class="game-box-display">
                <span style="background:${teamColor}; color:#000; font-weight:900; font-size:0.82em; padding:3px 12px; border-radius:12px; display:inline-block; margin-bottom:8px;">
                    MEMORIZAÇÃO: ${teamName} (${evalPlayer.name} & ${guessPlayer.name})
                </span>
                
                <div style="background:rgba(255,230,0,0.06); border:2px dashed var(--pop-yellow); border-radius:14px; padding:16px 12px; margin:10px 0;">
                    <p style="color:var(--pop-yellow); font-size:0.85em; font-weight:900; margin:0 0 8px 0;">
                        APENAS ${evalPlayer.name.toUpperCase()} PODE VER:
                    </p>
                    
                    <div id="nota-secret-display" style="min-height:90px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                        <div id="nota-hidden-placeholder" style="display:flex; flex-direction:column; align-items:center; gap:6px;">
                            <span style="font-size:2.4em;">🔒</span>
                            <span style="font-size:0.8em; font-weight:800; color:var(--ink-muted);">Segure o botão abaixo para revelar a nota secreta</span>
                        </div>
                        <div id="nota-revealed-val" style="display:none; font-size:4em; font-weight:900; color:var(--pop-yellow); line-height:1; text-shadow:0 0 16px rgba(255,230,0,0.6);">
                            ${note} <span style="font-size:0.4em; color:var(--ink-muted);">/ 10</span>
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
            <button class="btn btn-primary" style="max-width:320px; margin-top:8px;" onclick="minigames.startNotaGuess()">${nextActionLabel}</button>
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

    advanceMemo() {
        if (this.memoStep === 1) {
            this.memoStep = 2;
            window.playSound('nav');
            window.hapticTap();
            this.renderMemorization();
        } else {
            this.memoStep = 3;
            window.playSound('victory');
            this.startDuelTurn();
        }
    }

    startDuelTurn() {
        const isTeam1 = this.activeTeam === 0;
        const evalPlayer = isTeam1 ? this.t1Eval : this.t2Eval;
        const guessPlayer = isTeam1 ? this.t1Guess : this.t2Guess;
        const teamName = isTeam1 ? 'DUPLA 1' : 'DUPLA 2';
        const teamColor = isTeam1 ? 'var(--pop-cyan)' : 'var(--pop-yellow)';

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
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="background:${teamColor}; color:#000; font-weight:900; font-size:0.82em; padding:3px 10px; border-radius:12px;">
                        ${teamName} (${evalPlayer.name} & ${guessPlayer.name})
                    </span>
                    <span style="font-size:0.82em; font-weight:900; color:var(--ink-muted);">Rodada ${this.roundNum}</span>
                </div>

                <p style="color:var(--pop-cyan); font-weight:900; font-size:0.95em; margin-bottom:4px;">
                    VEZ DE ${guessPlayer.name.toUpperCase()} FAZER PERGUNTAS:
                </p>
                <p style="font-size:0.8em; color:var(--ink-muted); font-weight:800; margin-bottom:12px;">
                    Faça 1 pergunta para ${evalPlayer.name} calibrar a nota e tente acertar!
                </p>
                
                <div style="margin-bottom:14px;">
                    <button class="btn btn-dark btn-sm" style="font-size:0.78em; padding:6px 12px; border-radius:20px;" onclick="const el = document.getElementById('nota-suggestions-box'); el.style.display = el.style.display === 'none' ? 'flex' : 'none'; window.playSound('pop');">
                        💡 Sugestões de Perguntas (Toque para ver)
                    </button>
                    <div id="nota-suggestions-box" style="display:none; flex-wrap:wrap; gap:6px; justify-content:center; margin-top:8px; background:rgba(0,0,0,0.3); padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
                        ${catButtons}
                    </div>
                </div>

                <div style="border-top:1.5px solid rgba(255,255,255,0.1); padding-top:12px;">
                    <p style="font-size:0.9em; font-weight:900; color:var(--pop-yellow); margin-bottom:8px;">
                        QUAL É O CHUTE DE ${guessPlayer.name.toUpperCase()}?
                    </p>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center;">${buttons}</div>
                </div>
            </div>
        `;
    }

    guess(n) {
        const isTeam1 = this.activeTeam === 0;
        const targetNote = isTeam1 ? this.note1 : this.note2;
        const evalPlayer = isTeam1 ? this.t1Eval : this.t2Eval;
        const guessPlayer = isTeam1 ? this.t1Guess : this.t2Guess;
        const teamName = isTeam1 ? 'Dupla 1' : 'Dupla 2';
        const otherTeamName = isTeam1 ? 'Dupla 2' : 'Dupla 1';
        const isExact = n === targetNote;

        const gb = document.getElementById('gb-content');
        if (gb) {
            gb.innerHTML = `
                <div class="game-box-display">
                    <p style="color:var(--pop-cyan); font-weight:900;">TENTATIVA DA ${teamName.toUpperCase()}</p>
                    <div style="display:flex; justify-content:center; align-items:center; gap:20px; margin:16px 0;">
                        <div style="text-align:center;">
                            <div style="font-size:0.82em; font-weight:900; color:var(--ink-muted);">CHUTE DE ${guessPlayer.name.toUpperCase()}</div>
                            <div style="font-size:3.5em; font-weight:900; color:var(--pop-yellow);">${n}</div>
                        </div>
                    </div>
                    <div id="nota-verdict-tag" style="font-size:1.25em; font-weight:900; color:${isExact ? 'var(--pop-green)' : 'var(--pop-magenta)'};">
                        ${isExact ? '🎯 NA MOSCA! DUPLA ACERTOU EM CHEIO!' : `❌ ERROU! A nota de ${evalPlayer.name} NÃO É ${n}!`}
                    </div>
                    ${!isExact ? `<p style="font-size:0.85em; color:var(--ink-muted); margin-top:8px;">Passando a vez para a <b>${otherTeamName}</b> tentar...</p>` : ''}
                </div>
            `;
            if (isExact) {
                window.playSound('success');
                window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 100 });
            } else {
                window.playSound('badum');
            }
            window.hapticTap();
        }

        setTimeout(() => {
            if (isExact) {
                const winningDuo = isTeam1 ? [this.t1Eval, this.t1Guess] : [this.t2Eval, this.t2Guess];
                const losingDuo = isTeam1 ? [this.t2Eval, this.t2Guess] : [this.t1Eval, this.t1Guess];
                const mutations = winningDuo.map(p => ({ playerId: p.id, baseDelta: 20 }));

                this.ctx.complete({
                    title: `${teamName.toUpperCase()} ACERTOU PRIMEIRO! 🏆`,
                    titleColor: 'var(--pop-green)',
                    detailHTML: `
                        <p style="font-weight:900; font-size:1.15em;">
                            Nota exata: <b>${targetNote}</b> acertada na Rodada ${this.roundNum}!<br>
                            <b style="color:var(--pop-green);">+20 Pts para ${winningDuo.map(p => p.name).join(' e ')}!</b>
                        </p>
                        <p style="font-size:0.8em; color:var(--ink-muted); margin-top:6px;">
                            A nota da ${otherTeamName} era ${isTeam1 ? this.note2 : this.note1}.
                        </p>
                    `,
                    scoreMutations: mutations,
                    losers: losingDuo.map(p => p.id),
                    celebrateWithConfetti: true
                });
            } else {
                // Alterna a dupla
                if (this.activeTeam === 1) {
                    this.roundNum++;
                }
                this.activeTeam = 1 - this.activeTeam;
                this.startDuelTurn();
            }
        }, 1800);
    }

    handleAction(type, payload) {
        if (type === 'START_NOTA_GUESS') this.advanceMemo();
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
        
        // Conecta ao Lobby: Time 0 é o Adivinhador selecionado, Time 1 são os que dão as dicas
        if (teams.length >= 2 && teams[0]?.players?.length && teams[1]?.players?.length) {
            this.guesser = teams[0].players[0];
            this.clueGivers = teams[1].players;
            this.players = [this.guesser, ...this.clueGivers];
        } else {
            this.players = shuffle(teams[0]?.players || window.GIW.store.players || []);
            this.guesser = this.players[0] || { id: 'p_guess', name: 'Adivinhador' };
            this.clueGivers = this.players.slice(1);
        }

        this.clueIdx = 0;
        this.clues = [];

        let words = [];
        if (config?.themes && config.themes.length > 0 && window.categoriasIniciais) {
            config.themes.forEach(cat => {
                if (window.categoriasIniciais[cat]) words.push(...window.categoriasIniciais[cat]);
            });
        }
        if (words.length < 5) {
            words = [
                'Astronauta', 'Guitarra', 'Vampiro', 'Dinossauro', 'Cachoeira', 'Hambúrguer',
                'Tubarão', 'Pirâmide', 'Helicóptero', 'Microscópio', 'Diamante', 'Vulcão',
                'Submarino', 'Tornado', 'Canguru', 'Aranha', 'Espada', 'Castelo',
                'Esqueleto', 'Paraquedas', 'Laboratório', 'Múmia', 'Estátua', 'Lanterna',
                'Bumerangue', 'Carrossel', 'Foguete', 'Cofre', 'Navio', 'Camaleão',
                'Bússola', 'Sereia', 'Telescópio', 'Geleira', 'Arco-Íris', 'Bateria'
            ];
        }
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
            this.t1Guesser = shuf[0] || { id: 'p_g1', name: 'Jogador 1' };
            this.t1Clue = shuf[1] || { id: 'p_c1', name: 'Parceiro 1' };
            this.t2Guesser = shuf[2] || { id: 'p_g2', name: 'Jogador 2' };
            this.t2Clue = shuf[3] || { id: 'p_c2', name: 'Parceiro 2' };
            this.team1List = [this.t1Guesser, this.t1Clue];
            this.team2List = [this.t2Guesser, this.t2Clue];
        }

        let pool = [];
        if (config?.themes && config.themes.length > 0 && window.categoriasIniciais) {
            config.themes.forEach(cat => {
                if (window.categoriasIniciais[cat]) pool.push(...window.categoriasIniciais[cat]);
            });
        }
        if (pool.length < 2) {
            pool = [
                'Neymar', 'Batman', 'Silvio Santos', 'Cachorro', 'Homem-Aranha', 
                'Faustão', 'Bob Esponja', 'Coringa', 'Galinha', 'Shrek', 
                'Albert Einstein', 'Pikachu', 'Monalisa', 'Chaves', 'Voldemort',
                'Mário Bros', 'Barbie', 'Darth Vader', 'Gato', 'Goku',
                'Cristiano Ronaldo', 'Messi', 'Harry Potter', 'Elsa de Frozen', 'Minion',
                'Capitão América', 'Thor', 'Homem de Ferro', 'Wolverine', 'Deadpool',
                'Casimiro', 'Luva de Pedreiro', 'Manoel Gomes', 'Gretchen', 'Nazaré Tedesco',
                'Seu Madruga', 'Kiko', 'Chapolin Colorado', 'Pica-Pau', 'Scooby-Doo',
                'Mickey Mouse', 'Sonic', 'Naruto', 'Luffy', 'Tarzan',
                'Cleópatra', 'Napoleão Bonaparte', 'Sherlock Holmes', 'Drácula', 'Frankenstein',
                'Papai Noel', 'Fada do Dente', 'T-Rex', 'Capivara', 'Urso Panda'
            ];
        }
        pool = shuffle(pool);
        this.w1 = pool[0];
        this.w2 = pool[1];
        this.elapsed = 0;
        this.ended = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Quem Sou Eu (Duelo em Equipes)';
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
        
        this.teamScores = [0, 0];

        let words = [];
        if (config?.themes && config.themes.length > 0 && window.categoriasIniciais) {
            config.themes.forEach(cat => {
                if (window.categoriasIniciais[cat]) words.push(...window.categoriasIniciais[cat]);
            });
        }
        if (words.length < 5) {
            words = [
                'Astronauta', 'Chocolate', 'Vulcão', 'Castelo', 'Hospital', 
                'Bicicleta', 'Submarino', 'Dinossauro', 'Canguru', 'Pirata', 
                'Helicóptero', 'Microfone', 'Pizzaria', 'Fantasmas', 'Diamante',
                'Cemitério', 'Paraquedas', 'Laboratório', 'Telescópio', 'Dentista',
                'Circo', 'Supermercado', 'Prisão', 'Cassino', 'Biblioteca',
                'Vampiro', 'Múmia', 'Tornado', 'Terremoto', 'Cachoeira',
                'Fogueira', 'Espelho', 'Violão', 'Bateria', 'Saxofone',
                'Esqueleto', 'Cofre', 'Navio', 'Farol', 'Tubarão',
                'Espada', 'Coroa', 'Varinha Mágica', 'Carrossel', 'Pinguim',
                'Tartaruga', 'Geleira', 'Planeta', 'Satélite', 'Mágico'
            ];
        }
        this.words = shuffle(words);
        this.wordIdx = 0;
        this.maxWords = 5;
        this.mordaca = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Mega Senha (Duelo)';
        this.renderTurn();
    }

    renderTurn() {
        const w = this.words[this.wordIdx % this.words.length];

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display word-card-flip" style="padding:20px 14px; width:100%; max-width:360px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-weight:900; font-size:0.85em;">
                    <span style="color:var(--pop-cyan); background:rgba(0,229,255,0.12); padding:4px 10px; border-radius:999px; border:1px solid rgba(0,229,255,0.3);">TIME 1: ${this.teamScores[0]}</span>
                    <span style="color:var(--pop-yellow); font-size:0.8em; letter-spacing:1px; text-transform:uppercase;">Senha ${this.wordIdx + 1} de ${this.maxWords}</span>
                    <span style="color:var(--pop-magenta); background:rgba(255,42,133,0.12); padding:4px 10px; border-radius:999px; border:1px solid rgba(255,42,133,0.3);">TIME 2: ${this.teamScores[1]}</span>
                </div>
                
                <div class="word-card-inner" id="ms-card-inner">
                    <div style="font-size:3.2em; font-weight:900; color:#fff; margin:18px 0; text-shadow:0 3px 12px rgba(0,0,0,0.6); line-height:1.15; letter-spacing:-0.02em;">
                        ${w}
                    </div>
                    <div id="ms-stamp" class="word-stamp-badge" style="display:none;"></div>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px; max-width:340px; width:100%; margin-top:14px;">
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary" style="flex:1; font-size:0.95em; padding:14px 8px; font-weight:900;" onclick="minigames.hitWord(0)">
                        TIME 1 ACERTOU! (+10)
                    </button>
                    <button class="btn btn-warning" style="flex:1; font-size:0.95em; padding:14px 8px; font-weight:900; color:#000;" onclick="minigames.hitWord(1)">
                        TIME 2 ACERTOU! (+10)
                    </button>
                </div>
                <button class="btn btn-dark" style="font-size:0.85em; padding:10px;" onclick="minigames.skipWord()">
                    Pular Senha ⏩
                </button>
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
            const teamIdx = payload !== undefined ? Number(payload) : 0;
            if (this.teamScores[teamIdx] !== undefined) {
                this.teamScores[teamIdx] += 10;
            }
            this.wordIdx++;
            window.playSound('success');
            window.hapticTap();
            if (this.wordIdx >= this.maxWords) {
                this.finish();
            } else {
                this.renderTurn();
            }
        } else if (type === 'PASS_TURN') {
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
            'Lugares & Cidades': ['Paris', 'Praia', 'Hospital', 'Navio Pirata', 'Estação Espacial', 'Cinema', 'Escola', 'Cassino'],
            'Petiscos & Boteco': ['Coxinha', 'Pastel', 'Torresmo', 'Bolinho de Bacalhau', 'Batata Frita', 'Mandioca', 'Calabresa', 'Amendoim'],
            'Desenhos & Animações': ['Toy Story', 'Shrek', 'Procurando Nemo', 'Monstros SA', 'Kung Fu Panda', 'Madagascar', 'Os Incríveis', 'Divertida Mente'],
            'Memes Brasileiros': ['Luva de Pedreiro', 'Casimiro', 'Caneta Azul', 'Bora Bill', 'Gretchen', 'Nazaré Confusa', 'Bambam', 'Tiringa'],
            'Jogos de Videogame': ['GTA', 'Minecraft', 'FIFA', 'Super Mario', 'God of War', 'The Last of Us', 'Fortnite', 'Counter Strike'],
            'Coisas que Dão Pavor': ['Fantasma', 'Conta de Luz', 'Palhaço', 'Bebê Chorando no Avião', 'Ex Namorado(a)', 'Cobra', 'Dentista', 'Agulha'],
            'Dia de Praia': ['Cadeira de Sol', 'Guarda-Sol', 'Protetor Solar', 'Cerveja Gelada', 'Biscoito Globo', 'Água de Coco', 'Prancha de Surf', 'Castelo de Areia']
        };
        
        let availableCats = Object.keys(pool);
        if (config?.themes && config.themes.length > 0) {
            const matched = availableCats.filter(c => config.themes.includes(c));
            if (matched.length > 0) availableCats = matched;
        }

        this.category = availableCats[Math.floor(Math.random() * availableCats.length)];
        this.deck = shuffle(pool[this.category] || pool['Filmes Clássicos']).slice(0, 8);
        this.wordIdx = 0;
        this.duration = config?.time || 40;
        this.remaining = this.duration;
        this.ended = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = `Completa (${this.duration}s Speedrun)`;
        this.startTeamRun();
    }

    startTeamRun() {
        this.activeDeck = [...this.deck];
        this.remaining = this.duration;
        this.ctx.timer.start(this.duration);
        this.renderWord();
    }

    renderWord() {
        const team = this.teams[this.teamIdx];
        const teamName = this.teams.length > 1 ? `EQUIPE ${this.teamIdx + 1}` : 'EQUIPE';
        const teamMembers = team?.players?.map(p => p.name).join(', ') || 'Jogadores';
        const currentWord = this.activeDeck[0] || 'Todas Acertadas!';
        const totalWords = this.deck.length;

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display word-card-flip" style="padding:18px 14px; width:100%; max-width:360px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:0.85em; font-weight:900; color:var(--pop-cyan);">${teamName}</span>
                    <span id="completa-timer" class="timer-number" style="font-size:1.8em; color:var(--pop-magenta);">${Math.ceil(this.remaining)}s</span>
                    <span style="font-size:0.85em; font-weight:900; color:var(--pop-yellow);">Acertos: ${this.teamScores[this.teamIdx]}/${totalWords}</span>
                </div>
                
                <div style="font-size:0.75em; color:var(--ink-muted); font-weight:800; margin-bottom:6px;">Membros: ${teamMembers}</div>
                <div style="background:rgba(0,229,255,0.08); border:2px solid var(--pop-cyan); border-radius:14px; padding:12px; margin:8px 0;">
                    <div style="font-size:0.8em; font-weight:900; color:var(--pop-yellow);">FALEM UMA PALAVRA CADA:</div>
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
            const hits = this.teamScores[this.teamIdx - 1] || 0;
            const wordLabel = hits === 1 ? 'palavra' : 'palavras';
            window.showCustomAlert(
                `Fim da Equipe ${this.teamIdx}!`, 
                `A equipe acertou <b>${hits}</b> ${wordLabel}!<br>Agora é a vez da Equipe ${this.teamIdx + 1} (40s)!`, 
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
            this.activeDeck.shift();
            window.playSound('success');
            window.hapticTap();
            if (this.activeDeck.length === 0) {
                this.ctx.timer.stop();
                this.finishTeamRun();
            } else {
                this.renderWord();
            }
        } else if (type === 'WORD_SKIP') {
            if (this.activeDeck.length > 1) {
                const skipped = this.activeDeck.shift();
                this.activeDeck.push(skipped);
            }
            window.playBeep(false);
            this.renderWord();
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
        this.actorQueue = shuffle([...this.players]);
        this.actorIdx = 0;
        this.actor = this.actorQueue[0] || { id: 'p_actor', name: 'Mímico' };

        this.easyPool = [
            { t: "Fácil (+10)", w: "Escovando os Dentes", p: 10 },
            { t: "Fácil (+10)", w: "Tocando Bateria", p: 10 },
            { t: "Fácil (+10)", w: "Comendo Pizza Quente", p: 10 },
            { t: "Fácil (+10)", w: "Tirando Selfie no Espelho", p: 10 },
            { t: "Fácil (+10)", w: "Passeando com Cachorro Bravo", p: 10 },
            { t: "Fácil (+10)", w: "Dormindo e Roncando no Ônibus", p: 10 },
            { t: "Fácil (+10)", w: "Limpando o Chão com Rodo", p: 10 },
            { t: "Fácil (+10)", w: "Andando de Patins ou Skate", p: 10 },
            { t: "Fácil (+10)", w: "Tomando Banho Gelado", p: 10 },
            { t: "Fácil (+10)", w: "Passando Protetor Solar nas Costas", p: 10 },
            { t: "Fácil (+10)", w: "Batendo Pênalti na Copa", p: 10 },
            { t: "Fácil (+10)", w: "Espirrando e Segurando o Espirro", p: 10 },
            { t: "Fácil (+10)", w: "Tentando Matar um Mosquito", p: 10 },
            { t: "Fácil (+10)", w: "Pesando na Balança da Farmácia", p: 10 },
            { t: "Fácil (+10)", w: "Chorando Cortando Cebola", p: 10 }
        ];
        this.medPool = [
            { t: "Médio (+20)", w: "Zumbi Dançando Balé", p: 20 },
            { t: "Médio (+20)", w: "Pescador Pegando Tubarão", p: 20 },
            { t: "Médio (+20)", w: "Astronauta Sem Gravidade", p: 20 },
            { t: "Médio (+20)", w: "Lutador de Sumô com Câimbra", p: 20 },
            { t: "Médio (+20)", w: "Gato se Lambendo e Assustado com Pepino", p: 20 },
            { t: "Médio (+20)", w: "Pintor Renascentista Nervoso", p: 20 },
            { t: "Médio (+20)", w: "Pessoa Pisando em Lego Descalça", p: 20 },
            { t: "Médio (+20)", w: "Padre Exorcista em Pânico", p: 20 },
            { t: "Médio (+20)", w: "Influencer Fazendo Tour pela Casa", p: 20 },
            { t: "Médio (+20)", w: "Robô com Bateria Fraca Desligando", p: 20 },
            { t: "Médio (+20)", w: "Homem das Cavernas Descobrindo o Fogo", p: 20 },
            { t: "Médio (+20)", w: "Maestro Regendo Orquestra Desafinada", p: 20 },
            { t: "Médio (+20)", w: "Passageiro de Montanha-Russa Desesperado", p: 20 },
            { t: "Médio (+20)", w: "Vampiro Tomando Banho de Sol", p: 20 }
        ];
        this.hardPool = [
            { t: "Difícil (+30)", w: "Cirurgião em Montanha-Russa", p: 30 },
            { t: "Difícil (+30)", w: "Super-Herói Lavando Roupa", p: 30 },
            { t: "Difícil (+30)", w: "Ninja Trocando Fralda de Bebê", p: 30 },
            { t: "Difícil (+30)", w: "Piranha no Aquário Pedindo Socorro", p: 30 },
            { t: "Difícil (+30)", w: "Detetive Seguindo a Própria Sombra", p: 30 },
            { t: "Difícil (+30)", w: "Astronauta Pisando num Chiclete na Lua", p: 30 },
            { t: "Difícil (+30)", w: "Galinha Apaixonada por um Ovo de Páscoa", p: 30 },
            { t: "Difícil (+30)", w: "Papai Noel Entalado na Chaminé Apertada", p: 30 },
            { t: "Difícil (+30)", w: "Fantasma com Medo do Próprio Lençol", p: 30 },
            { t: "Difícil (+30)", w: "Múmia se Desmanchando numa Ventania", p: 30 }
        ];

        this.cardOptions = [shuffle(this.easyPool)[0], shuffle(this.medPool)[0], shuffle(this.hardPool)[0]];
        this.chosenCard = null;
        this.duration = config?.time || 60;
        this.remaining = this.duration;
        this.mutations = [];
        this.roundSummaries = [];
        this.ended = false;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = `Mímica (${this.duration}s)`;
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
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="color:var(--pop-cyan); font-weight:900; font-size:0.95em;">ATOR: ${this.actor.name.toUpperCase()}</span>
                    <span style="color:var(--pop-yellow); font-size:0.8em; font-weight:800;">${this.actorIdx + 1}/${this.actorQueue.length}</span>
                </div>
                <p style="font-size:0.8em; color:var(--ink-muted); font-weight:800; margin-bottom:12px;">Escolha 1 das 3 cartas. O risco e os pontos são seus!</p>
                ${optionCards}
            </div>
        `;
    }

    pickCard(idx) {
        this.chosenCard = this.cardOptions[idx] || this.cardOptions[0];
        window.playSound('pop');
        window.hapticTap();
        this.remaining = this.duration;
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
                    Desistir / Passar a Vez ➔
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
            this.ctx.timer.stop();
            window.playKaboom();
            this.advanceTurn(null);
        }
    }

    advanceTurn(guesser) {
        if (guesser && this.chosenCard) {
            const cardPts = this.chosenCard.p;
            this.mutations.push({ playerId: this.actor.id, baseDelta: cardPts });
            this.mutations.push({ playerId: guesser.id, baseDelta: 10 });
            this.roundSummaries.push(`<b>${this.actor.name}</b> (+${cardPts}) atuou e <b>${guesser.name}</b> (+10) adivinhou: <i>${this.chosenCard.w}</i>`);
        } else {
            this.roundSummaries.push(`<b>${this.actor.name}</b> não teve a mímica adivinhada (<i>${this.chosenCard?.w || 'Desconhecida'}</i>).`);
        }

        if (this.actorIdx + 1 < this.actorQueue.length) {
            this.actorIdx++;
            this.actor = this.actorQueue[this.actorIdx];
            this.cardOptions = [shuffle(this.easyPool)[0], shuffle(this.medPool)[0], shuffle(this.hardPool)[0]];
            this.chosenCard = null;
            this.renderIntermission();
        } else {
            this.finishAll();
        }
    }

    renderIntermission() {
        const nextActor = this.actor;
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display">
                <span style="color:var(--pop-green); font-weight:900; font-size:0.9em; text-transform:uppercase;">RODADA CONCLUÍDA!</span>
                <div style="font-size:1.6em; font-weight:900; color:var(--pop-yellow); margin:12px 0;">
                    Próximo Ator da Mesa:<br><b>${nextActor.name.toUpperCase()}</b>
                </div>
                <p style="font-size:0.85em; color:var(--ink-muted); font-weight:800;">
                    Passe o celular para <b>${nextActor.name}</b> escolher a carta e atuar!
                </p>
            </div>
            <button class="btn btn-primary" style="max-width:320px; margin-top:10px;" onclick="minigames.nextMimicaActor()">
                VEZ DE ${nextActor.name.toUpperCase()} ➔
            </button>
        `;
    }

    finishAll() {
        this.ended = true;
        this.ctx.timer.stop();
        window.playSound('victory');
        window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 90 });

        this.ctx.complete({
            title: 'Fim da Mímica da Mesa! 🎭',
            titleColor: 'var(--pop-green)',
            detailHTML: `
                <div style="font-size:0.9em; text-align:left; line-height:1.4; margin:8px 0;">
                    ${this.roundSummaries.map(s => `<p style="margin:4px 0;">• ${s}</p>`).join('')}
                </div>
            `,
            scoreMutations: this.mutations,
            celebrateWithConfetti: this.mutations.length > 0
        });
    }

    handleAction(type, payload) {
        if (this.ended) return;
        if (type === 'PICK_MIMICA_CARD') {
            this.pickCard(Number(payload));
        } else if (type === 'NEXT_MIMICA_ACTOR') {
            this.renderSelection();
        } else if (type === 'WORD_HIT') {
            this.ctx.timer.stop();
            const cardPts = this.chosenCard ? this.chosenCard.p : 10;
            
            // Abre o seletor para marcar quem da mesa acertou
            const guesserCandidates = (window.GIW.store.players || []).filter(p => p.id !== this.actor.id);
            window.showPlayerSelectorModal({
                icon: '🤹',
                title: 'Quem da Mesa Adivinhou?',
                subtitle: `${this.actor.name} ganha +${cardPts} Pts e o adivinhador ganha +10 Pts!`,
                players: guesserCandidates.length > 0 ? guesserCandidates : window.GIW.store.players,
                cancelable: false,
                onSelect: (guesser) => {
                    window.playSound('success');
                    window.hapticTap();
                    this.advanceTurn(guesser);
                }
            });
        } else if (type === 'WORD_SKIP') {
            this.ctx.timer.stop();
            window.playSound('badum');
            this.advanceTurn(null);
        }
    }
}

// ----------------------------------------------------
// 12. STOP DE RODA (DECAY SUAVE & ELIMINAÇÃO CONTÍNUA)
// ----------------------------------------------------
const STOP_CATEGORY_DATA = [
    { cat: 'Comida ou Fruta', letters: ['A', 'B', 'C', 'F', 'G', 'L', 'M', 'P', 'S', 'T', 'U'] },
    { cat: 'Animal Conhecido', letters: ['A', 'C', 'E', 'G', 'J', 'L', 'M', 'O', 'P', 'R', 'S', 'T', 'U', 'Z'] },
    { cat: 'Nome de Cidade ou País', letters: ['A', 'B', 'C', 'E', 'F', 'G', 'I', 'J', 'L', 'M', 'P', 'R', 'S'] },
    { cat: 'Objeto de Casa', letters: ['A', 'B', 'C', 'E', 'F', 'G', 'L', 'M', 'P', 'Q', 'R', 'S', 'T', 'V'] },
    { cat: 'Filme ou Série', letters: ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'J', 'L', 'M', 'O', 'P', 'R', 'S', 'T', 'V'] },
    { cat: 'Profissão / Ocupação', letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'M', 'P', 'S', 'V'] },
    { cat: 'Marca Famosa', letters: ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V'] },
    { cat: 'Bebida Gelada', letters: ['A', 'C', 'G', 'L', 'R', 'S', 'V'] },
    { cat: 'Banda ou Cantor(a)', letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'L', 'M', 'N', 'P', 'R', 'S', 'T'] },
    { cat: 'Parte do Corpo Humano', letters: ['B', 'C', 'D', 'J', 'M', 'N', 'O', 'P', 'Q', 'T'] },
    { cat: 'Sobremesa ou Doce', letters: ['B', 'C', 'D', 'G', 'M', 'P', 'S', 'T'] },
    { cat: 'Meio de Transporte', letters: ['A', 'B', 'C', 'H', 'M', 'N', 'O', 'P', 'T'] },
    { cat: 'Esporte ou Atividade Física', letters: ['B', 'C', 'F', 'G', 'J', 'N', 'P', 'R', 'S', 'T', 'V'] },
    { cat: 'Item de Supermercado', letters: ['A', 'B', 'C', 'D', 'F', 'G', 'L', 'M', 'O', 'P', 'Q', 'R', 'S', 'T'] },
    { cat: 'Coisa que se Vê no Trânsito', letters: ['A', 'B', 'C', 'F', 'M', 'O', 'P', 'S', 'T'] },
    { cat: 'Eletrodoméstico', letters: ['A', 'B', 'C', 'F', 'G', 'L', 'M', 'S', 'T', 'V'] },
    { cat: 'Flor ou Planta', letters: ['B', 'C', 'G', 'J', 'M', 'O', 'P', 'R', 'S', 'V'] },
    { cat: 'Roupa ou Acessório', letters: ['B', 'C', 'G', 'L', 'M', 'O', 'P', 'R', 'S', 'T', 'V'] },
    { cat: 'Personagem de Desenho ou Cinema', letters: ['B', 'C', 'D', 'G', 'H', 'M', 'P', 'S', 'T', 'Z'] },
    { cat: 'Comida de Boteco', letters: ['B', 'C', 'E', 'F', 'M', 'P', 'Q', 'T'] },
    { cat: 'Instrumento Musical', letters: ['B', 'C', 'F', 'G', 'H', 'P', 'S', 'T', 'V'] },
    { cat: 'Aplicativo de Celular', letters: ['F', 'G', 'I', 'N', 'S', 'T', 'U', 'W', 'Y'] }
];

class GameStop {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.alivePlayers = [...this.players];
        this.eliminated = [];

        const initial = this.pickRandomRound();
        this.category = initial.cat;
        this.letter = initial.letter;
        this.ended = false;
        this.isIntermission = false;
    }

    pickRandomRound() {
        const entry = STOP_CATEGORY_DATA[Math.floor(Math.random() * STOP_CATEGORY_DATA.length)];
        const letter = entry.letters[Math.floor(Math.random() * entry.letters.length)];
        return { cat: entry.cat, letter };
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Stop de Roda (Sobrevivência)';
        this.render();
    }

    render() {
        if (this.isIntermission) return;
        const aliveBadges = this.alivePlayers.map(p => 
            `<span style="display:inline-block; padding:4px 10px; border-radius:12px; background:rgba(255,255,255,0.08); font-size:0.8em; font-weight:800; border:1px solid rgba(255,255,255,0.15); color:#fff;">${p.name}</span>`
        ).join(' ');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <p style="color:var(--pop-cyan); font-weight:900; text-transform:uppercase; letter-spacing:1.5px; font-size:0.85em; margin-bottom:6px;">TEMA DA RODADA</p>
                <h2 style="color:var(--pop-yellow); font-size:1.7em; font-weight:900; margin:4px 0 10px 0; line-height:1.15; text-transform:uppercase;">${this.category}</h2>
                
                <div class="slot-letter-box" style="margin:12px auto;">
                    <span class="slot-letter-number" id="stop-letter-num">${this.letter}</span>
                </div>

                <p style="color:var(--ink-muted); font-size:0.85em; font-weight:800; margin:10px 0 4px 0;">
                    Falem em sequência na roda uma palavra com a letra <b>"${this.letter}"</b>!
                </p>
                <div style="font-size:0.75em; color:var(--pop-cyan); font-weight:800; margin-bottom:12px;">
                    Restam ${this.alivePlayers.length} jogadores na roda
                </div>

                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                    ${aliveBadges}
                </div>
            </div>

            <div style="width:100%; max-width:330px; display:flex; flex-direction:column; gap:8px; margin-top:12px;">
                <button class="btn btn-danger" style="padding:15px; font-size:1em; font-weight:900;" onclick="minigames.triggerStopElimination()">
                    💀 ALGUÉM TRAVOU / REPETIU! ELIMINAR
                </button>
                <button class="btn btn-dark" style="padding:10px; font-size:0.8em;" onclick="minigames.sortearOutroTemaStop()">
                    🎲 Trocar Tema ou Letra
                </button>
            </div>
        `;
    }

    tick() {
        // Stop de roda funciona no ritmo humano da mesa sem cronômetro de tela
    }

    triggerElimination() {
        this.isIntermission = true;
        window.showPlayerSelectorModal({
            icon: '💀',
            title: 'Quem Travou no Stop?',
            subtitle: `Quem demorou a falar ou repetiu no tema "${this.category}"?`,
            players: this.alivePlayers,
            cancelable: false,
            onSelect: (victim) => {
                this.alivePlayers = this.alivePlayers.filter(p => p.id !== victim.id);
                this.eliminated.push(victim);
                window.playKaboom();
                window.vibrar(400);

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
        const next = this.pickRandomRound();

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <div style="font-size:3em; margin-bottom:6px;">💀</div>
                <h3 style="color:var(--pop-magenta); margin:0 0 6px 0; font-weight:900;">${victim.name.toUpperCase()} ELIMINADO!</h3>
                <p style="color:var(--ink-muted); font-size:0.85em; font-weight:800; margin-bottom:12px;">
                    Restam <b>${this.alivePlayers.length} jogadores</b> na disputa!
                </p>
                <div style="background:rgba(0,229,255,0.08); border:1.5px dashed var(--pop-cyan); border-radius:12px; padding:12px;">
                    <span style="font-size:0.75em; color:var(--pop-cyan); font-weight:900; text-transform:uppercase;">PRÓXIMO TEMA & LETRA:</span>
                    <div style="font-size:1.25em; font-weight:900; color:#fff; margin-top:4px;">${next.cat} (Letra: ${next.letter})</div>
                </div>
            </div>
            <button class="btn btn-primary" style="max-width:320px; padding:14px; margin-top:10px; font-weight:900;" onclick="minigames.continueStopRound('${next.cat}', '${next.letter}')">
                CONTINUAR COM NOVO TEMA ➔
            </button>
        `;
    }

    continueRound(nextCategory, nextLetter) {
        this.category = nextCategory;
        this.letter = nextLetter;
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
        if (type === 'TRIGGER_STOP_ELIM') {
            this.triggerElimination();
        } else if (type === 'CONTINUE_STOP') {
            this.continueRound(payload.cat, payload.letter);
        } else if (type === 'REROLL_STOP') {
            const next = this.pickRandomRound();
            this.category = next.cat;
            this.letter = next.letter;
            window.playSound('pop');
            window.hapticTap();
            this.render();
        }
    }
}

// ----------------------------------------------------
// 13. SE VIRA (PAVIO CURTO & TENSÃO CRESCENTE)
// ----------------------------------------------------
// 13. SE VIRA (LEILÃO DE DESAFIO - 30 SEGUNDOS)
// ----------------------------------------------------
class GameSeVira {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.alivePlayers = [...this.players];
        this.challenger = this.players[0] || { id: 'p1', name: 'Jogador' };
        this.targetGoal = 10;
        this.itemsSpoken = 0;
        this.timeLeft = 30.0;
        this.phase = 'AUCTION'; // AUCTION -> RUNNING -> RESULT
        this.round = 1;

        this.categories = [
            "Músicas que Todo Mundo Sabe Cantar",
            "Marcas Famosas de Qualquer Coisa",
            "Coisas Amarelas",
            "Comidas que se Come com a Mão",
            "Filmes Clássicos do Cinema",
            "Coisas que se Encontra na Cozinha",
            "Desculpas para Chegar Atrasado",
            "Animais de 4 Patas",
            "Coisas que Tem na Praia",
            "Coisas que Dão Medo no Escuro",
            "Profissões Conhecidas",
            "Cidades ou Países do Mundo",
            "Coisas que Quebram Fácil",
            "Itens de uma Mochila de Viagem",
            "Coisas que Custam Menos de R$ 10",
            "Coisas que Tem em Todo Casamento",
            "Desenhos Animados Famosos",
            "Coisas que Tem em um Hospital",
            "Séries Famosas de Streaming",
            "Sobremesas ou Doces Gostosos"
        ];
        this.category = this.categories[Math.floor(Math.random() * this.categories.length)];
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Se Vira (Leilão 30s)';
        this.renderAuction();
    }

    renderAuction() {
        this.phase = 'AUCTION';
        const playerChips = this.players.map(p => {
            const isSelected = p.id === this.challenger.id;
            return `
                <button type="button" class="chip ${isSelected ? 'active' : ''}" 
                        style="padding:6px 12px; font-weight:800; font-size:0.85em; border-radius:999px;"
                        onclick="minigames.selectSeviraChallenger('${p.id}')">
                    ${p.name}
                </button>
            `;
        }).join('');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <span style="font-size:0.85em; font-weight:900; color:var(--pop-cyan); text-transform:uppercase; letter-spacing:1.5px;">LEILÃO DE CORAGEM (30s)</span>
                <h2 style="font-size:1.7em; font-weight:900; color:var(--pop-yellow); margin:8px 0 6px 0; line-height:1.2; text-transform:uppercase;">${this.category}</h2>
                <p style="color:var(--ink-muted); font-size:0.82em; font-weight:800; margin-bottom:14px;">
                    Façam seus lances na mesa! Quem promete falar mais itens em 30 segundos?
                </p>

                <!-- Quem deu o maior lance -->
                <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:10px; margin-bottom:10px;">
                    <div style="font-size:0.75em; font-weight:900; color:var(--pop-cyan); text-transform:uppercase; margin-bottom:8px;">QUEM VAI CUMPRIR O DESAFIO?</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                        ${playerChips}
                    </div>
                </div>

                <!-- Meta de Itens -->
                <div style="background:rgba(255,214,0,0.07); border:1.5px solid rgba(255,214,0,0.35); border-radius:14px; padding:12px;">
                    <div style="font-size:0.75em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; margin-bottom:4px;">PROMETEU FALAR:</div>
                    <div style="display:flex; align-items:center; justify-content:center; gap:16px;">
                        <button class="btn btn-dark" style="width:44px; height:44px; font-size:1.4em; padding:0; display:flex; align-items:center; justify-content:center;" onclick="minigames.adjustSeviraGoal(-1)">-</button>
                        <span id="sevira-goal-num" style="font-size:2.5em; font-weight:900; color:#fff; min-width:60px;">${this.targetGoal}</span>
                        <button class="btn btn-dark" style="width:44px; height:44px; font-size:1.4em; padding:0; display:flex; align-items:center; justify-content:center;" onclick="minigames.adjustSeviraGoal(1)">+</button>
                    </div>
                    <div style="font-size:0.78em; color:var(--ink-muted); font-weight:800; margin-top:2px;">itens em 30 segundos</div>
                </div>
            </div>

            <button class="btn btn-warning" style="max-width:320px; padding:15px; font-weight:900; font-size:1.05em; margin-top:12px;" onclick="minigames.startSeviraRun()">
                ⏱️ VALENDO! COMEÇAR 30s
            </button>
        `;
    }

    startRun() {
        this.phase = 'RUNNING';
        this.itemsSpoken = 0;
        this.timeLeft = 30.0;
        window.playSound('whistle');
        window.hapticTap();
        this.renderRunning();
    }

    renderRunning() {
        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:0.85em; font-weight:900; color:var(--pop-cyan); text-transform:uppercase;">DESAFIANTE: ${this.challenger.name}</span>
                    <span id="sevira-timer-text" class="timer-number" style="font-size:1.8em; color:var(--pop-magenta);">${Math.ceil(this.timeLeft)}s</span>
                </div>
                
                <h3 style="color:var(--pop-yellow); font-size:1.3em; font-weight:900; margin:4px 0 8px 0; text-transform:uppercase;">${this.category}</h3>

                <div style="background:rgba(0,0,0,0.3); border:2px solid var(--pop-yellow); border-radius:18px; padding:14px; margin:8px 0;">
                    <div style="font-size:0.8em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase;">ITENS FALADOS NA MESA:</div>
                    <div id="sevira-counter" style="font-size:3.5em; font-weight:900; color:#fff; line-height:1; margin:8px 0;">
                        ${this.itemsSpoken} / ${this.targetGoal}
                    </div>
                    <div style="font-size:0.75em; color:var(--ink-muted); font-weight:800;">
                        Toque no botão a cada item válido que ${this.challenger.name} falar!
                    </div>
                </div>
            </div>

            <div style="width:100%; max-width:330px; display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                <button class="btn btn-success" style="padding:16px; font-size:1.15em; font-weight:900;" onclick="minigames.hitSeviraItem()">
                    🎯 +1 ITEM FALADO!
                </button>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-warning" style="flex:1; padding:10px; font-size:0.85em; font-weight:900; color:#000;" onclick="minigames.finishSeviraSuccess()">
                        BATEU A META! ✅
                    </button>
                    <button class="btn btn-danger" style="flex:1; padding:10px; font-size:0.85em; font-weight:900;" onclick="minigames.finishSeviraFail()">
                        FALHOU / DESISTIU 💥
                    </button>
                </div>
            </div>
        `;
    }

    tick(delta) {
        if (this.phase !== 'RUNNING') return;
        this.timeLeft = Math.max(0, this.timeLeft - delta);
        const timerEl = document.getElementById('sevira-timer-text');
        if (timerEl) {
            timerEl.innerText = `${Math.ceil(this.timeLeft)}s`;
            if (this.timeLeft <= 5.0) {
                timerEl.style.color = 'var(--pop-magenta)';
                timerEl.style.transform = 'scale(1.15)';
            }
        }

        if (this.timeLeft <= 0) {
            if (this.itemsSpoken >= this.targetGoal) {
                this.finishSuccess();
            } else {
                this.finishFail();
            }
        }
    }

    hitItem() {
        if (this.phase !== 'RUNNING') return;
        this.itemsSpoken++;
        window.playSound('pop');
        window.hapticTap();
        const counterEl = document.getElementById('sevira-counter');
        if (counterEl) {
            counterEl.innerText = `${this.itemsSpoken} / ${this.targetGoal}`;
            if (typeof window.gsap !== 'undefined') {
                window.gsap.fromTo(counterEl, { scale: 1.2 }, { scale: 1, duration: 0.2 });
            }
        }

        if (this.itemsSpoken >= this.targetGoal) {
            this.finishSuccess();
        }
    }

    finishSuccess() {
        if (this.phase === 'RESULT') return;
        this.phase = 'RESULT';
        window.playSound('victory');
        window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 100 });

        const mutations = [
            { playerId: this.challenger.id, baseDelta: 20 }
        ];

        this.ctx.complete({
            title: `${this.challenger.name} se Virou nos 30! 🎉`,
            titleColor: 'var(--pop-green)',
            detailHTML: `
                <p style="font-weight:900; font-size:1.2em; color:var(--pop-yellow);">
                    Prometeu ${this.targetGoal} itens e entregou ${this.itemsSpoken} no tema "${this.category}"!
                </p>
                <b style="color:var(--pop-green); font-size:1.1em;">+20 Pontos de Coragem!</b>
            `,
            scoreMutations: mutations,
            celebrateWithConfetti: true
        });
    }

    finishFail() {
        if (this.phase === 'RESULT') return;
        this.phase = 'RESULT';
        window.playKaboom();
        window.vibrar(600);
        window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#ff2a85' });

        const mutations = [
            { playerId: this.challenger.id, baseDelta: 0, falhasDelta: 1, statPrendDelta: 1 }
        ];

        this.ctx.complete({
            title: `${this.challenger.name} Não Aguentou a Pressão! 💥`,
            titleColor: 'var(--pop-magenta)',
            detailHTML: `
                <p style="font-weight:900; font-size:1.15em;">
                    Prometeu ${this.targetGoal} itens mas só conseguiu falar ${this.itemsSpoken} no tempo!
                </p>
                <b style="color:var(--pop-magenta);">Castigo da Mesa / Prenda ativada!</b>
            `,
            scoreMutations: mutations,
            losers: [this.challenger.id]
        });
    }

    handleAction(type, payload) {
        if (type === 'SELECT_SEVIRA_CHALLENGER') {
            const p = this.players.find(x => x.id === payload);
            if (p) {
                this.challenger = p;
                window.playSound('pop');
                window.hapticTap();
                this.renderAuction();
            }
        } else if (type === 'ADJUST_SEVIRA_GOAL') {
            this.targetGoal = Math.max(3, Math.min(40, this.targetGoal + payload));
            window.playSound('tick');
            window.hapticTap();
            const numEl = document.getElementById('sevira-goal-num');
            if (numEl) numEl.innerText = this.targetGoal;
        } else if (type === 'START_SEVIRA_RUN') {
            this.startRun();
        } else if (type === 'HIT_SEVIRA_ITEM') {
            this.hitItem();
        } else if (type === 'FINISH_SEVIRA_SUCCESS') {
            this.finishSuccess();
        } else if (type === 'FINISH_SEVIRA_FAIL') {
            this.finishFail();
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
        this.alivePlayers = shuffle([...this.players]);
        this.currentIdx = 0;
        this.eliminated = [];
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
            "3 comidas que não combinam com feijão",
            "3 coisas para fazer num domingo chuvoso",
            "3 séries que você assistiu mais de uma vez",
            "3 coisas que deixam qualquer um irritado no trânsito",
            "3 sobremesas com chocolate",
            "3 nomes de praia que você já foi ou quer ir",
            "3 personagens do Chaves",
            "3 coisas que você compra no boteco",
            "3 lugares péssimos para ser pedido em casamento",
            "3 animais que você teria medo de encontrar na floresta",
            "3 marcas de tênis ou roupa esportiva",
            "3 coisas que todo mundo já pesquisou de madrugada",
            "3 ingredientes para fazer um hambúrguer perfeito",
            "3 profissões que exigem coragem absurda",
            "3 piadas ruins de tio do pavê",
            "3 jogos clássicos de celular",
            "3 coisas que não podem faltar no churrasco",
            "3 canções que todo mundo sabe o refrão",
            "3 motivos para fugir de uma festa chata",
            "3 coisas que você faria se ganhasse na loteria hoje",
            "3 superstições populares brasileiras"
        ];
        this.challenges = shuffle(challenges);
        this.challengeIdx = 0;
    }

    start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = '5 Segundos (Sobrevivência)';
        this.renderTurn();
    }

    renderTurn() {
        if (this.alivePlayers.length <= 1 && this.players.length > 1) {
            this.finishSurvival();
            return;
        }

        const curr = this.alivePlayers[this.currentIdx % this.alivePlayers.length] || { id: 'p_none', name: 'Jogador' };
        this.prompt = this.challenges[this.challengeIdx % this.challenges.length];
        this.state = 'HIDDEN'; // HIDDEN -> PREPARING -> RUNNING -> REVIEW
        this.left = 5.0;
        this.running = false;
        clearInterval(this.prepTimer);

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="color:var(--pop-cyan); font-weight:900; font-size:0.9em; text-transform:uppercase;">VEZ DE: ${curr.name}</span>
                    <span style="color:var(--pop-yellow); font-size:0.8em; font-weight:800;">${this.alivePlayers.length} Sobreviventes</span>
                </div>

                <div style="background:rgba(255,255,255,0.05); border:1.5px dashed rgba(255,255,255,0.2); border-radius:16px; padding:24px 16px; margin:12px 0;">
                    <span style="font-size:2.4em;">🔒</span>
                    <div style="font-size:1.15em; font-weight:900; color:var(--ink-muted); margin-top:8px;">
                        Objetivo Oculto
                    </div>
                    <div style="font-size:0.75em; color:var(--ink-muted); margin-top:4px;">
                        Toque no botão abaixo quando ${curr.name} estiver pronto!
                    </div>
                </div>

                <div id="cinco-num" class="timer-number" style="font-size:2.8em; color:var(--ink-muted); opacity:0.6;">5.0s</div>
            </div>

            <div id="cinco-ctrls" style="width:100%; max-width:330px; margin-top:10px;">
                <button class="btn btn-warning" style="width:100%; font-size:1.1em; padding:16px; font-weight:900;" onclick="minigames.revealCincoObjective()">
                    👁️ REVELAR DESAFIO (3s PENSAR)
                </button>
            </div>
        `;
    }

    revealObjective() {
        if (this.state !== 'HIDDEN') return;
        this.state = 'PREPARING';
        this.prepCount = 3;
        window.playSound('pop');
        window.hapticTap();

        const curr = this.alivePlayers[this.currentIdx % this.alivePlayers.length] || { id: 'p_none', name: 'Jogador' };

        const updatePrepUI = () => {
            document.getElementById('gb-content').innerHTML = `
                <div class="game-box-display" style="width:100%; max-width:350px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="color:var(--pop-cyan); font-weight:900; font-size:0.9em; text-transform:uppercase;">VEZ DE: ${curr.name}</span>
                        <span style="color:var(--pop-yellow); font-size:0.8em; font-weight:800;">${this.alivePlayers.length} Vivos</span>
                    </div>

                    <div style="background:rgba(0,229,255,0.08); border:2px solid var(--pop-cyan); border-radius:16px; padding:16px 12px; margin:10px 0;">
                        <span style="font-size:0.75em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; letter-spacing:1px;">SEU DESAFIO:</span>
                        <div style="font-size:1.9em; font-weight:900; color:#fff; margin:6px 0; line-height:1.15; text-shadow:0 2px 8px rgba(0,0,0,0.6);">
                            Diga ${this.prompt}!
                        </div>
                    </div>

                    <div style="margin:14px 0;">
                        <div style="font-size:0.8em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; letter-spacing:1px;">PENSE RÁPIDO...</div>
                        <div id="cinco-prep-num" style="font-size:4em; font-weight:900; color:var(--pop-yellow); line-height:1; margin-top:4px;">
                            ${this.prepCount}
                        </div>
                    </div>
                </div>

                <div id="cinco-ctrls" style="width:100%; max-width:330px; margin-top:8px;">
                    <button class="btn btn-dark" style="width:100%; font-size:0.85em; padding:12px; opacity:0.7;" disabled>
                        Iniciando 5 segundos automaticamente...
                    </button>
                </div>
            `;
            if (typeof window.gsap !== 'undefined') {
                window.gsap.fromTo('#cinco-prep-num', { scale: 1.4 }, { scale: 1, duration: 0.3 });
            }
        };

        updatePrepUI();
        window.playSound('beep');

        this.prepTimer = setInterval(() => {
            this.prepCount--;
            if (this.prepCount > 0) {
                window.playSound('beep');
                updatePrepUI();
            } else {
                clearInterval(this.prepTimer);
                this.startTimerAuto();
            }
        }, 1000);
    }

    startTimerAuto() {
        this.state = 'RUNNING';
        this.running = true;
        this.left = 5.0;
        window.playSound('whistle');
        window.hapticTap();
        const curr = this.alivePlayers[this.currentIdx % this.alivePlayers.length] || { id: 'p_none', name: 'Jogador' };

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="width:100%; max-width:350px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="color:var(--pop-cyan); font-weight:900; font-size:0.9em; text-transform:uppercase;">VEZ DE: ${curr.name}</span>
                    <span style="color:var(--pop-yellow); font-size:0.8em; font-weight:800;">${this.alivePlayers.length} Vivos</span>
                </div>

                <div style="background:rgba(255,42,133,0.1); border:2px solid var(--pop-magenta); border-radius:16px; padding:14px 10px; margin:8px 0;">
                    <div style="font-size:1.8em; font-weight:900; color:#fff; line-height:1.15;">
                        Diga ${this.prompt}!
                    </div>
                </div>

                <div id="cinco-num" class="timer-number" style="font-size:4em; color:var(--pop-magenta); margin:8px 0;">5.0s</div>
                <div style="font-size:0.75em; color:var(--ink-muted); font-weight:800;">Responda na roda antes do tempo zerar!</div>
            </div>

            <div id="cinco-ctrls" style="width:100%; max-width:330px; display:flex; gap:10px; margin-top:12px;">
                <button class="btn btn-danger" style="flex:1; font-size:0.95em; padding:14px 6px; font-weight:900;" onclick="minigames.finishCinco(false)">
                    💥 FALHOU
                </button>
                <button class="btn btn-success" style="flex:1; font-size:0.95em; padding:14px 6px; font-weight:900;" onclick="minigames.finishCinco(true)">
                    ✅ CONSEGUIU!
                </button>
            </div>
        `;
    }

    tick(delta) {
        if (this.running && !this.ended && this.state === 'RUNNING') {
            this.left = Math.max(0, this.left - delta);
            const el = document.getElementById('cinco-num');
            if (el) el.innerText = `${this.left.toFixed(1)}s`;
            if (this.left <= 0) {
                this.running = false;
                this.state = 'REVIEW';
                window.playKaboom();
                window.vibrar(500);
            }
        }
    }

    finishSurvival() {
        this.ended = true;
        const champion = this.alivePlayers[0] || this.players[0] || { id: 'p_none', name: 'Campeão' };
        window.playSound('victory');
        window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 120 });

        const mutations = [
            { playerId: champion.id, baseDelta: 20 },
            ...this.eliminated.map(p => ({ playerId: p.id, falhasDelta: 1 }))
        ];

        this.ctx.complete({
            title: `${champion.name.toUpperCase()} SOBREVIVEU! 🏆`,
            titleColor: 'var(--pop-green)',
            detailHTML: `
                <p style="font-weight:900; font-size:1.15em;">
                    O único sobrevivente dos 5 Segundos!<br>
                    <b style="color:var(--pop-green);">+20 Pts para ${champion.name}!</b>
                </p>
                <p style="font-size:0.8em; color:var(--ink-muted); margin-top:6px;">
                    Eliminados: ${this.eliminated.map(p => p.name).join(', ') || 'Ninguém'}.
                </p>
            `,
            scoreMutations: mutations,
            losers: this.eliminated.map(p => p.id),
            celebrateWithConfetti: true
        });
    }

    handleAction(type, payload) {
        if (type === 'REVEAL_CINCO') {
            this.revealObjective();
        } else if (type === 'START_CINCO') {
            this.startTimerAuto();
        } else if (type === 'FINISH_CINCO') {
            this.running = false;
            if (payload) {
                // Conseguiu!
                window.playSound('success');
                window.hapticTap();
                this.currentIdx = (this.currentIdx + 1) % this.alivePlayers.length;
                this.challengeIdx++;
                this.renderTurn();
            } else {
                // Falhou: Eliminado!
                const victim = this.alivePlayers[this.currentIdx % this.alivePlayers.length];
                this.eliminated.push(victim);
                this.alivePlayers.splice(this.currentIdx % this.alivePlayers.length, 1);
                window.playKaboom();
                window.GIW.bus.emit('fx:screenshake', { intensity: 'light', durationMs: 250 });

                if (this.alivePlayers.length <= 1 && this.players.length > 1) {
                    this.finishSurvival();
                } else if (this.alivePlayers.length === 0) {
                    this.finishSurvival();
                } else {
                    document.getElementById('gb-content').innerHTML = `
                        <div class="game-box-display">
                            <span style="font-size:2.8em;">💥</span>
                            <div style="font-size:1.4em; font-weight:900; color:var(--pop-magenta); margin:10px 0;">
                                ${victim.name.toUpperCase()} FOI ELIMINADO!
                            </div>
                            <p style="font-size:0.85em; color:var(--ink-muted); font-weight:800;">
                                Restam ${this.alivePlayers.length} jogador(es) na disputa.
                            </p>
                        </div>
                    `;
                    setTimeout(() => {
                        this.challengeIdx++;
                        this.renderTurn();
                    }, 1400);
                }
            }
        }
    }
}

// ----------------------------------------------------
// 15. BATATA QUENTE (TEMA NA RODA & EXPLOSÃO NA MÃO)
// ----------------------------------------------------
class GameBatata {
    constructor(config, teams, ctx) {
        this.ctx = ctx;
        this.players = teams[0]?.players || window.GIW.store.players || [];
        this.alivePlayers = [...this.players];
        this.eliminated = [];
        this.currIdx = 0;
        this.round = 1;
        this.minTime = 12;
        this.maxTime = 24;
        this.explosionTime = this.minTime + Math.random() * (this.maxTime - this.minTime);
        this.elapsed = 0;
        this.exploded = false;
        this.intermission = false;

        this.themes = [
            "Coisas que Tem na Geladeira",
            "Marcas Famosas de Carro",
            "Sobremesas ou Doces",
            "Coisas que se Leva para a Praia",
            "Animais que Voam",
            "Coisas Amarelas",
            "Filmes Clássicos de Terror ou Ação",
            "Coisas que se Encontra no Banheiro",
            "Itens de uma Mochila de Viagem",
            "Comidas de Festa Junina ou Churrasco",
            "Coisas que Quebram Fácil",
            "Profissões Conhecidas",
            "Palavras que Começam com a Letra 'S'",
            "Coisas que Fazem Muito Barulho",
            "Vilões de Filmes ou Desenhos",
            "Lugares Onde Ninguém Quer Ir",
            "Coisas que Custam Menos de R$ 5"
        ];
        this.theme = this.themes[Math.floor(Math.random() * this.themes.length)];
    }

    async start() {
        appCore.nav('screen-game-board');
        document.getElementById('gb-title').innerText = 'Batata Quente';
        this.render();
    }

    render() {
        if (this.intermission) return;
        
        const aliveBadges = this.alivePlayers.map(p => 
            `<span style="display:inline-block; padding:4px 10px; border-radius:12px; background:rgba(255,255,255,0.08); font-size:0.8em; font-weight:800; border:1px solid rgba(255,255,255,0.15); color:#fff;">${p.name}</span>`
        ).join(' ');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="position:relative; overflow:hidden; width:100%; max-width:350px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:0.8em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; letter-spacing:1px;">Rodada ${this.round}</span>
                    <span style="font-size:0.8em; font-weight:900; color:var(--pop-magenta);">${this.alivePlayers.length} Vivos</span>
                </div>

                <div style="background:rgba(255,214,0,0.08); border:2px solid var(--pop-yellow); border-radius:16px; padding:12px; margin:8px 0;">
                    <span style="font-size:0.75em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase; letter-spacing:1px;">TEMA DA RODADA:</span>
                    <div style="font-size:1.55em; font-weight:900; color:#fff; margin-top:4px; line-height:1.2; text-transform:uppercase;">
                        ${this.theme}
                    </div>
                </div>
                
                <div style="position:relative; display:inline-block; margin:10px 0;">
                    <div class="pulsing-bomb" id="batata-bomb" style="font-size:3.8em;">💣</div>
                    <div class="bomb-spark" style="font-size:1.8em;">🔥</div>
                </div>
                
                <p style="color:var(--ink-muted); font-size:0.85em; font-weight:800; margin:4px 0 10px 0; line-height:1.3;">
                    Fale um item do tema e <b>passe o celular imediatamente</b>!<br>Quando a bomba explodir, quem estiver com ele na mão é eliminado!
                </p>
                
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                    ${aliveBadges}
                </div>
            </div>

            <div style="width:100%; max-width:330px; margin-top:12px;">
                <button class="btn btn-danger" style="width:100%; padding:14px; font-weight:900; font-size:0.95em;" onclick="minigames.explodeBatataNow()">
                    💥 EXPLODIR AGORA (MANUAL)
                </button>
            </div>
        `;

        if (typeof window.gsap !== 'undefined') {
            const pulseSpeed = Math.max(0.16, 0.45 - (this.round * 0.05));
            window.gsap.fromTo('#batata-bomb', 
                { scale: 0.9 }, 
                { scale: 1.2, duration: pulseSpeed, repeat: -1, yoyo: true, ease: 'power1.inOut' }
            );
        }
    }

    tick(delta) {
        if (this.exploded || this.intermission) return;
        this.elapsed += delta;
        if (this.elapsed >= this.explosionTime) {
            this.explode('O tempo secreto da bomba esgotou!');
        }
    }

    explode(reason = 'A batata quente explodiu na mão!') {
        if (this.exploded) return;
        this.exploded = true;
        this.ctx.sandbox.clearDeviceMotion?.();
        window.playKaboom();
        window.GIW.bus.emit('fx:juice', { type: 'flash', color: '#ff2a85' });
        window.GIW.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 800 });
        window.vibrar(800);

        window.showPlayerSelectorModal({
            icon: '💣',
            title: 'A BATATA EXPLODIU!',
            subtitle: 'Com quem o celular estava na mão no momento do estrondo?',
            players: this.alivePlayers,
            cancelable: false,
            onSelect: (chosen) => {
                this.handleElimination(chosen, reason);
            }
        });
    }

    handleElimination(victim, reason) {
        this.eliminated.push(victim);
        this.alivePlayers = this.alivePlayers.filter(p => p.id !== victim.id);

        if (this.alivePlayers.length <= 1) {
            const champion = this.alivePlayers[0] || { name: 'Jogador', id: 'p_none' };
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
        this.theme = this.themes[Math.floor(Math.random() * this.themes.length)];
        this.minTime = Math.max(8, Math.round(this.minTime * 0.8));
        this.maxTime = Math.max(14, Math.round(this.maxTime * 0.8));
        this.explosionTime = this.minTime + Math.random() * (this.maxTime - this.minTime);
        this.elapsed = 0;
        this.exploded = false;
        this.intermission = false;
        this.render();
    }

    handleAction(type) {
        if (type === 'EXPLODE_BATATA_NOW') {
            this.explode('Bomba detonada!');
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
            "MEIOS DE TRANSPORTE",
            "COMIDAS TÍPICAS BRASILEIRAS",
            "INSTRUMENTOS MUSICAIS",
            "OBJETOS QUE TEM NA COZINHA",
            "PALAVRAS EM INGLÊS QUE USAMOS NO DIA A DIA",
            "PROFISSÕES COM A LETRA 'P'",
            "COISAS QUE ENCONTRAMOS NA PRAIA",
            "COISAS QUE CABEM NO BOLSO",
            "FILMES QUE GANHARAM O OSCAR",
            "PERSONAGENS DA DISNEY OU PIXAR",
            "MOTIVOS PARA LEVAR UMA MULTA",
            "COISAS QUE DAMOS DE PRESENTE DE NATAL",
            "CIDADES TURÍSTICAS DO BRASIL",
            "COISAS QUE FAZEM MUITO BARULHO",
            "ANIMAIS QUE VIVEM NO MAR",
            "DOCES E SOBREMESAS",
            "COISAS QUE SE FAZ NO DOMINGO À TARDE",
            "MARCAS DE CELULAR E ELETRÔNICOS"
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
            const cardHTML = window.generateCardHTML(p, '', '', null, false).replace('width: 104px; height: 148px;', 'width: 82px; height: 116px; font-size:0.72em;');
            return `
                <div onclick="minigames.eliminateUltimo('${p.id}')" style="cursor:pointer; position:relative; transition:transform 0.15s; padding:4px;" class="touch-scale">
                    <div style="pointer-events:none;">
                        ${cardHTML}
                    </div>
                    <div style="margin-top:6px; font-size:0.75em; font-weight:900; color:var(--pop-magenta); text-align:center; pointer-events:none; text-transform:uppercase;">
                        💀 Falhou
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('gb-content').innerHTML = `
            <div class="game-box-display" style="border:2px solid var(--pop-yellow); box-shadow:0 0 25px rgba(255,234,0,0.25);">
                <span style="font-size:0.8em; font-weight:900; color:var(--pop-magenta); text-transform:uppercase; letter-spacing:1px;">TEMA LIBERADO 🔥</span>
                <h1 style="color:var(--pop-yellow); font-size:1.8em; font-weight:900; margin:6px 0; line-height:1.1; text-shadow:0 2px 8px rgba(0,0,0,0.5);">${this.theme}</h1>
                <p style="color:var(--pop-cyan); font-size:0.85em; font-weight:800; margin-top:4px;">Quem foi o ÚLTIMO a falar, gaguejou ou repetiu?</p>
                <div style="font-size:0.8em; font-weight:900; color:var(--ink-muted); margin-top:4px;">Toque na carta de quem errou para eliminar!</div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin:14px 0;">
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
                
                <p style="font-size:0.8em; font-weight:900; color:var(--pop-yellow); text-transform:uppercase;">Ainda no Jogo (${this.alivePlayers.length}):</p>
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

        const champion = this.alivePlayers[0] || { name: 'Jogador', id: 'p_none' };
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
                <p style="font-size:0.85em; color:var(--ink-muted); margin-top:4px;">${this.eliminated.length === 1 ? '1 jogador foi eliminado' : `${this.eliminated.length} jogadores foram eliminados`} por lentidão.</p>
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
// ANIMAÇÃO 2.5D & FÍSICA DE BARALHO (GAME FEEL)
// ==========================================
minigames._isPassingTurn = false;

minigames.animateCardReveal = function(show) {
    if (minigames._isPassingTurn) return;
    const card = document.getElementById('reveal-vault-card');
    const cover = document.getElementById('secret-cover');
    const btnNext = document.getElementById('btn-next-player');
    if (!card || !cover) return;

    if (show) {
        if (typeof window.gsap !== 'undefined') {
            window.gsap.killTweensOf([card, cover]);
            // Game feel: squash de toque (50ms) seguido de elevação 3D com rotação sutil e brilho
            window.gsap.fromTo(card, 
                { scaleX: 0.98, scaleY: 0.96 }, 
                { 
                    scaleX: 1.04, 
                    scaleY: 1.04, 
                    y: -10, 
                    rotateX: -6, 
                    boxShadow: '0 28px 56px -10px rgba(0,0,0,0.85), 0 0 30px rgba(0, 229, 255, 0.35)',
                    borderColor: 'rgba(0, 229, 255, 0.45)',
                    duration: 0.28, 
                    ease: 'power2.out' 
                }
            );
            window.gsap.to(cover, { yPercent: 100, duration: 0.32, ease: 'power3.out' });
        } else {
            cover.style.transform = 'translateY(100%)';
        }
        if (btnNext) {
            btnNext.style.display = 'block';
            if (typeof window.gsap !== 'undefined') {
                window.gsap.fromTo(btnNext, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' });
            }
        }
        window.playSound('card_lift');
        window.hapticTap();
    } else {
        if (window.GIW_boboHelpOpen) return;
        if (typeof window.gsap !== 'undefined') {
            window.gsap.killTweensOf([card, cover]);
            window.gsap.to(card, {
                scaleX: 1,
                scaleY: 1,
                y: 0,
                rotateX: 0,
                boxShadow: '0 16px 36px -8px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)',
                borderColor: 'rgba(255, 255, 255, 0.14)',
                duration: 0.35,
                ease: 'elastic.out(1, 0.6)'
            });
            window.gsap.to(cover, { yPercent: 0, duration: 0.26, ease: 'power3.inOut' });
        } else {
            cover.style.transform = 'translateY(0%)';
        }
        window.playSound('card_snap');
    }
};

minigames.animateCardPass = function(onTurnSwapped) {
    minigames._isPassingTurn = true;
    window.GIW_boboHelpOpen = false;
    const desc = document.getElementById('bobo-help-desc');
    if (desc) desc.style.display = 'none';

    const card = document.getElementById('reveal-vault-card');
    const cover = document.getElementById('secret-cover');
    const btnNext = document.getElementById('btn-next-player');
    if (btnNext) btnNext.style.display = 'none';

    if (card && typeof window.gsap !== 'undefined') {
        window.playSound('whoosh');
        window.hapticTap();
        // Desliza a carta para fora pela esquerda com inércia angular
        window.gsap.to(card, {
            x: -280,
            rotation: -10,
            opacity: 0,
            duration: 0.22,
            ease: 'power2.in',
            onComplete: () => {
                if (cover) {
                    window.gsap.set(cover, { yPercent: 0 });
                }
                // Troca os dados do jogador e da palavra
                if (typeof onTurnSwapped === 'function') onTurnSwapped();
                // Nova carta entra pela direita com física elástica
                window.gsap.fromTo(card,
                    { x: 280, rotation: 10, opacity: 0, scale: 0.94 },
                    { 
                        x: 0, 
                        rotation: 0, 
                        opacity: 1, 
                        scale: 1, 
                        duration: 0.36, 
                        ease: 'back.out(1.4)',
                        onComplete: () => {
                            minigames._isPassingTurn = false;
                        }
                    }
                );
            }
        });
    } else {
        if (cover) cover.style.transform = 'translateY(0%)';
        if (typeof onTurnSwapped === 'function') onTurnSwapped();
        minigames._isPassingTurn = false;
    }
};

// Segurança global contra cartas travadas no release de toque
if (typeof window !== 'undefined') {
    const handleGlobalRelease = () => {
        const screen = document.getElementById('screen-reveal');
        if (screen && screen.classList.contains('active') && !window.GIW_boboHelpOpen && !minigames._isPassingTurn) {
            minigames.hideSecret();
        }
    };
    window.addEventListener('pointerup', handleGlobalRelease, { passive: true });
    window.addEventListener('pointercancel', handleGlobalRelease, { passive: true });
}

// ==========================================
// FAÇADES GLOBAIS DE CONTROLE
// ==========================================
minigames._isStarting = false;
minigames.startGameRouter = function() {
    if (minigames._isStarting) return;
    minigames._isStarting = true;
    const btn = document.getElementById('btn-start-game-lobby');
    if (btn) btn.style.pointerEvents = 'none';

    try {
        runner.launch(window.GIW.store.currentGameActive);
    } finally {
        setTimeout(() => {
            minigames._isStarting = false;
            if (btn) btn.style.pointerEvents = 'auto';
        }, 500);
    }
};

window.GIW_boboHelpOpen = false;
minigames.toggleBoboHelp = function(e) {
    if (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
    }
    const desc = document.getElementById('bobo-help-desc');
    const icon = document.getElementById('bobo-help-icon');
    if (!desc) return;
    const isHidden = desc.style.display === 'none' || !desc.style.display;
    desc.style.display = isHidden ? 'block' : 'none';
    if (icon) icon.innerText = isHidden ? '✕' : 'ℹ️';

    const cov = document.getElementById('secret-cover');
    if (cov) {
        if (isHidden) {
            if (typeof window.gsap !== 'undefined') {
                window.gsap.to(cov, { yPercent: 100, duration: 0.2 });
            } else {
                cov.style.transform = 'translateY(100%)';
            }
            window.GIW_boboHelpOpen = true;
        } else {
            window.GIW_boboHelpOpen = false;
        }
    }
    if (typeof window.hapticTap === 'function') window.hapticTap();
    if (typeof window.playSound === 'function') window.playSound('pop');
};

minigames.showSecret = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    runner.action('SHOW_SECRET');
};
minigames.hideSecret = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    runner.action('HIDE_SECRET');
};
minigames.nextTurn = () => {
    if (minigames._isPassingTurn) return;
    const btnNext = document.getElementById('btn-next-player');
    if (btnNext) btnNext.style.pointerEvents = 'none';
    runner.action('NEXT_TURN');
    setTimeout(() => {
        if (btnNext) btnNext.style.pointerEvents = 'auto';
    }, 400);
};
minigames.startVoting = () => runner.action('START_VOTING');
minigames.castVote = (id) => runner.action('CAST_VOTE', id);

minigames.selectedVotePlayerId = null;

minigames.selectVoteTarget = function(el, pId) {
    minigames.selectedVotePlayerId = pId;
    const grid = document.getElementById('vote-list-container');
    if (grid) {
        grid.querySelectorAll('.studio-vote-item').forEach(item => item.classList.remove('is-selected'));
    }
    if (el) el.classList.add('is-selected');

    const btn = document.getElementById('btn-confirm-vote');
    if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        if (typeof window.gsap !== 'undefined') {
            window.gsap.fromTo(btn, { scale: 0.94 }, { scale: 1, duration: 0.16, ease: 'back.out(2)' });
        }
    }
    window.playSound('pop');
    window.hapticTap();
};

minigames.confirmVoteSelection = function() {
    if (minigames._accusing || !minigames.selectedVotePlayerId) return;
    const btn = document.getElementById('btn-confirm-vote');
    if (btn) {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
    }
    const pId = minigames.selectedVotePlayerId;
    const grid = document.getElementById('vote-list-container');
    const selectedEl = grid ? grid.querySelector('.studio-vote-item.is-selected') : null;
    minigames.accuse(selectedEl, pId);
};

// Tribunal: carimbo "ACUSADO" tátil antes de abrir o veredito
minigames.accuse = function(cardEl, id) {
    if (minigames._accusing) return;
    minigames._accusing = true;
    const container = document.getElementById('vote-list-container');
    const all = container ? Array.from(container.querySelectorAll('.studio-vote-item, .vote-card-btn')) : [];
    all.forEach(el => { if (el !== cardEl) el.classList.add('vote-dimmed'); });
    if (cardEl) {
        cardEl.classList.add('vote-picked');
        const stamp = document.createElement('div');
        stamp.className = 'vote-stamp';
        stamp.innerText = 'ACUSADO!';
        cardEl.style.position = 'relative';
        cardEl.appendChild(stamp);
        if (typeof window.gsap !== 'undefined') {
            window.gsap.fromTo(stamp, { scale: 3.2, opacity: 0, rotation: -22 }, { scale: 1, opacity: 1, rotation: -10, duration: 0.28, ease: 'back.out(2.2)' });
            window.gsap.fromTo(cardEl, { scale: 0.96 }, { scale: 1.05, duration: 0.2, ease: 'power2.out' });
        }
    }
    window.playSound('card_snap');
    window.playSound('badum');
    window.vibrar(80);
    setTimeout(() => {
        minigames._accusing = false;
        runner.action('CAST_VOTE', id);
    }, 650);
};

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
minigames.nextMimicaActor = () => runner.action('NEXT_MIMICA_ACTOR');

minigames.nextLetter = () => runner.action('NEXT_LETTER');
minigames.triggerStopElimination = () => runner.action('TRIGGER_STOP_ELIM');
minigames.continueStopRound = (cat, letter) => runner.action('CONTINUE_STOP', { cat, letter });
minigames.sortearOutroTemaStop = () => runner.action('REROLL_STOP');
minigames.selectSeviraChallenger = (id) => runner.action('SELECT_SEVIRA_CHALLENGER', id);
minigames.adjustSeviraGoal = (delta) => runner.action('ADJUST_SEVIRA_GOAL', delta);
minigames.startSeviraRun = () => runner.action('START_SEVIRA_RUN');
minigames.hitSeviraItem = () => runner.action('HIT_SEVIRA_ITEM');
minigames.finishSeviraSuccess = () => runner.action('FINISH_SEVIRA_SUCCESS');
minigames.finishSeviraFail = () => runner.action('FINISH_SEVIRA_FAIL');
minigames.passSevira = () => runner.action('PASS_SEVIRA');
minigames.continueSeviraRound = (cat) => runner.action('CONTINUE_SEVIRA', cat);
minigames.revealCincoObjective = () => runner.action('REVEAL_CINCO');
minigames.startCinco = () => runner.action('START_CINCO');
minigames.finishCinco = (win) => runner.action('FINISH_CINCO', win);
minigames.passBatata = () => runner.action('PASS_BATATA');
minigames.explodeBatataNow = () => runner.action('EXPLODE_BATATA_NOW');
minigames.continueBatataRound = () => runner.action('CONTINUE_BATATA');
minigames.eliminateUltimo = (id) => {
    window.playSound('pop');
    window.hapticTap();
    runner.action('ELIMINATE_ULTIMO', id);
};
minigames.startUltimoCountdown = () => runner.action('START_ULTIMO_CD');
minigames.playerFault = (id) => runner.action('FAULT', id);
minigames.surrenderMacabro = () => runner.action('SURRENDER_MACABRO');
minigames.finishDirect = () => runner.action('FINISH_DIRECT');