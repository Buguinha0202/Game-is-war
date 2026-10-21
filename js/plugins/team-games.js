import { MiniGamePlugin } from './base-plugin.js';

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * TeamGamePlugin - Nível 3 (Seção 7.2 do plano).
 * Minigames de equipe com turnos e suporte à Loja Negra:
 * 'megasenha', 'completa', 'nota'
 */
export class TeamGamePlugin extends MiniGamePlugin {
    wordsDeck = [];
    currentWordIndex = 0;
    activeTeamIdx = 0;
    teamScores = [0, 0];
    sabotages = { mordaca: false, voz: false };
    completaBoard = [];

    onInit(config, teams, context) {
        super.onInit(config, teams, context);

        const allWords = [];
        const themes = config.themes.length > 0 ? config.themes : Object.keys(config.dictionary);
        themes.forEach(t => {
            const list = config.dictionary[t] || [];
            allWords.push(...list);
        });

        this.wordsDeck = shuffle(allWords.length > 0 ? allWords : ['Sol', 'Lua', 'Carro', 'Casa', 'Bola', 'Mesa']);
        this.currentWordIndex = 0;
        this.activeTeamIdx = 0;
        this.teamScores = teams.map(() => 0);
        this.sabotages = { mordaca: false, voz: false };

        if (config.gameId === 'completa') {
            this.completaBoard = this.wordsDeck.slice(0, 8).map(w => ({ word: w, hit: false }));
        }
    }

    onStart() {
        this.ctx.ui.navigate('screen-game-board');
        this.ctx.ui.setBlackStoreVisible(true);

        const gbTitle = document.getElementById('gb-title');
        if (gbTitle) gbTitle.innerText = this.config.gameId.toUpperCase();

        this.#renderTeamTurn();
    }

    onAction(type, payload = {}) {
        if (type === 'START_TURN') {
            this.ctx.timer.start(this.config.time || 60);
            this.#renderActiveTurn();
        } else if (type === 'WORD_HIT') {
            this.teamScores[this.activeTeamIdx] += 10;
            this.ctx.bus.emit('audio:play', { sfx: 'success' });
            this.ctx.bus.emit('haptics:trigger', { preset: 'tap' });

            if (this.config.gameId === 'completa') {
                const target = this.completaBoard.find(b => b.word === payload.word);
                if (target) target.hit = true;
                if (this.completaBoard.every(b => b.hit)) {
                    this.#advanceTeamOrFinish();
                    return;
                }
            } else {
                this.currentWordIndex++;
            }
            this.#renderActiveTurn();
        } else if (type === 'WORD_SKIP') {
            this.currentWordIndex++;
            this.ctx.bus.emit('audio:play', { sfx: 'beep', highTone: false });
            this.#renderActiveTurn();
        } else if (type === 'SABOTAGE_APPLIED') {
            const item = payload.item;
            if (item === 'tempo') {
                this.ctx.timer.addSeconds(-10);
                this.ctx.bus.emit('fx:screenshake', { intensity: 'medium', durationMs: 400 });
                this.ctx.bus.emit('audio:play', { sfx: 'glitch' });
            } else if (item === 'mordaca') {
                this.sabotages.mordaca = true;
                this.#renderActiveTurn();
            } else if (item === 'voz') {
                this.sabotages.voz = true;
                this.#renderActiveTurn();
            }
        } else if (type === 'NEXT_TEAM') {
            this.#advanceTeamOrFinish();
        }
    }

    onTick(deltaSec, elapsedSec, remainingSec) {
        const timerEl = document.getElementById('team-timer-display');
        if (timerEl) {
            timerEl.innerText = `${Math.ceil(remainingSec)}s`;
        }

        if (remainingSec <= 5 && remainingSec > 0 && Math.floor(remainingSec) !== Math.floor(remainingSec - deltaSec)) {
            this.ctx.bus.emit('audio:play', { sfx: 'beep', highTone: true });
        }

        if (remainingSec <= 0 && remainingSec + deltaSec > 0) {
            this.ctx.timer.stop();
            this.ctx.bus.emit('audio:play', { sfx: 'kaboom' });
            this.ctx.bus.emit('haptics:trigger', { preset: 'explosion' });
            this.#advanceTeamOrFinish();
        }
    }

    #renderTeamTurn() {
        const team = this.teams[this.activeTeamIdx];
        const teamPlayers = team?.players || [];
        const names = teamPlayers.map(p => p.name).join(' & ');

        const gbContent = document.getElementById('gb-content');
        if (!gbContent) return;

        gbContent.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <h2 style="color:var(--duo-blue); font-size:2em; margin-bottom:10px;">Vez da Equipe ${this.activeTeamIdx + 1}</h2>
                <p style="color:var(--text-main); font-weight:800; font-size:1.2em; margin-bottom:25px;">${names}</p>
                <button class="btn btn-primary" onclick="window.gameBus.emit('game:action', { type: 'START_TURN' })">
                    ▶️ Iniciar Rodada (${this.config.time || 60}s)
                </button>
            </div>
        `;
    }

    #renderActiveTurn() {
        const gbContent = document.getElementById('gb-content');
        if (!gbContent) return;

        let centerHTML = '';
        if (this.config.gameId === 'completa') {
            const boardHTML = this.completaBoard.map(b => `
                <button class="btn ${b.hit ? 'btn-success' : 'btn-dark'}" 
                        style="padding:10px; font-size:0.9em; ${b.hit ? 'opacity:0.6; pointer-events:none;' : ''}"
                        onclick="window.gameBus.emit('game:action', { type: 'WORD_HIT', payload: { word: '${b.word}' } })">
                    ${b.word}
                </button>
            `).join('');

            centerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%; max-width:360px; margin:15px 0;">
                    ${boardHTML}
                </div>
            `;
        } else {
            const word = this.wordsDeck[this.currentWordIndex % this.wordsDeck.length] || 'FIM';
            centerHTML = `
                <div style="margin:25px 0; padding:25px 35px; background:var(--bg-off); border:3px solid var(--border-light); border-radius:20px;">
                    <span style="font-size:2.4em; font-weight:900; color:var(--text-main); text-transform:uppercase;">${word}</span>
                </div>
                <div style="display:flex; gap:15px; width:100%; max-width:320px;">
                    <button class="btn btn-danger" onclick="window.gameBus.emit('game:action', { type: 'WORD_SKIP' })">Pular ➔</button>
                    <button class="btn btn-success" onclick="window.gameBus.emit('game:action', { type: 'WORD_HIT' })">Acertou! ✓</button>
                </div>
            `;
        }

        const sabotageBanner = this.sabotages.mordaca
            ? `<div style="background:var(--duo-red); color:white; padding:8px 15px; border-radius:12px; font-weight:900; margin-bottom:10px;">⚠️ MORDAÇA ATIVA: CANTE AS DICAS!</div>`
            : '';

        gbContent.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; width:100%; text-align:center;">
                ${sabotageBanner}
                <div style="display:flex; justify-content:space-between; width:100%; max-width:340px; margin-bottom:10px; font-weight:900;">
                    <span style="color:var(--duo-blue);">Equipe ${this.activeTeamIdx + 1}</span>
                    <span id="team-timer-display" style="color:var(--duo-yellow); font-size:1.4em;">--</span>
                    <span style="color:var(--duo-green);">Pts: ${this.teamScores[this.activeTeamIdx]}</span>
                </div>
                ${centerHTML}
            </div>
        `;
    }

    #advanceTeamOrFinish() {
        this.ctx.timer.stop();
        this.activeTeamIdx++;
        this.sabotages = { mordaca: false, voz: false };

        if (this.activeTeamIdx < this.teams.length) {
            this.#renderTeamTurn();
        } else {
            this.ctx.completeGame({
                teamScores: this.teamScores
            });
        }
    }

    onFinish(rawOutcome = {}) {
        const scores = rawOutcome.teamScores || this.teamScores;
        const maxScore = Math.max(...scores);
        const winningTeamIndices = scores.map((s, idx) => s === maxScore ? idx : -1).filter(idx => idx !== -1);

        const mutations = [];
        const losers = [];

        this.teams.forEach((t, tIdx) => {
            const isWinner = winningTeamIndices.includes(tIdx);
            (t.players || []).forEach(p => {
                if (isWinner) {
                    mutations.push({ playerId: p.id, baseDelta: scores[tIdx] || 15 });
                } else {
                    losers.push(p.id);
                }
            });
        });

        const detailList = this.teams.map((t, idx) => `
            <div style="font-weight:800; margin:5px 0;">
                Equipe ${idx + 1}: <b style="color:var(--duo-blue);">${scores[idx] || 0} Pts</b>
            </div>
        `).join('');

        return {
            gameId: this.config.gameId,
            outcome: 'TEAM_WIN',
            title: winningTeamIndices.length === 1 ? `Equipe ${winningTeamIndices[0] + 1} Venceu!` : 'Empate de Equipes!',
            titleColor: 'var(--duo-green)',
            detailHTML: `<div style="margin-bottom:15px;">${detailList}</div>`,
            scoreMutations: mutations,
            losers,
            celebrateWithConfetti: true,
            confettiColors: ['#1cb0f6', '#58cc02', '#ffffff']
        };
    }

    onDestroy() {
        this.activeTeamIdx = 0;
        this.sabotages = { mordaca: false, voz: false };
    }
}
