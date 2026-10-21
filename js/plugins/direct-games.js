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
 * DirectGamePlugin - Nível 3 (Seção 7.3 do plano).
 * Minigames de roda de adrenalina, física e sintonia direta:
 * 'macabro', 'unica', 'quemsoueu', 'mimica', 'stop', 'sevira', 'cinco', 'batata', 'ultimo'
 */
export class DirectGamePlugin extends MiniGamePlugin {
    playersList = [];
    currentPlayerIdx = 0;
    explosionTime = 0;
    lastHeartbeat = 0;
    gameCategory = '';
    gameLetter = '';
    activePrompt = '';
    playerFaults = {};

    onInit(config, teams, context) {
        super.onInit(config, teams, context);

        const players = teams[0]?.players || [];
        this.playersList = shuffle(players);
        this.currentPlayerIdx = 0;
        this.playerFaults = {};
        this.playersList.forEach(p => { this.playerFaults[p.id] = 0; });

        const gameId = config.gameId;

        // Categorias e temas
        const availableThemes = config.themes.length > 0 ? config.themes : Object.keys(config.dictionary);
        this.gameCategory = availableThemes[Math.floor(Math.random() * availableThemes.length)] || 'Geral';
        const letters = 'ABCDEFGHIJKLMNOPRSTUV';
        this.gameLetter = letters[Math.floor(Math.random() * letters.length)];

        if (gameId === 'batata') {
            // Tempo secreto entre 14 e 35 segundos
            this.explosionTime = 14 + Math.random() * 21;
            this.lastHeartbeat = 0;
        } else if (gameId === 'macabro') {
            const historias = [
                "Um homem entra num restaurante, pede carne de gaivota, come uma garfada, sai e se mata. O que aconteceu?",
                "Um homem é encontrado morto no deserto com uma palha de fósforo apagada na mão. Por quê?",
                "Um homem empurra o carro até um hotel e grita: 'Estou falido!'. Como assim?"
            ];
            this.activePrompt = historias[Math.floor(Math.random() * historias.length)];
        } else if (gameId === 'cinco') {
            const desafios = ["3 marcas de cerveja", "3 países com a letra A", "3 capitais do Brasil", "3 vilões de filme", "3 sobremesas com chocolate"];
            this.activePrompt = desafios[Math.floor(Math.random() * desafios.length)];
        } else {
            const dict = config.dictionary[this.gameCategory] || ['Pipoca', 'Cinema', 'Ação'];
            this.activePrompt = dict[Math.floor(Math.random() * dict.length)];
        }
    }

    onStart() {
        this.ctx.ui.navigate('screen-game-board');

        const gbTitle = document.getElementById('gb-title');
        if (gbTitle) gbTitle.innerText = this.config.gameId.toUpperCase();

        if (this.config.gameId === 'batata') {
            this.#startBatata();
        } else {
            this.#renderStandardDirect();
        }
    }

    async #startBatata() {
        const gbContent = document.getElementById('gb-content');
        if (gbContent) {
            gbContent.innerHTML = `
                <div style="text-align:center; padding:20px;">
                    <div style="font-size:5em; animation:pulse 1s infinite;">💣</div>
                    <h2 style="color:var(--duo-red); font-size:2.2em; margin:15px 0;">Batata Quente!</h2>
                    <p style="color:var(--text-main); font-weight:800; font-size:1.1em; margin-bottom:25px;">
                        Passe o celular com cuidado! Qualquer movimento brusco explode a bomba.
                    </p>
                    <div style="color:var(--duo-yellow); font-size:0.9em; font-weight:800;">
                        Sensibilidade: ${this.config.sensibilidade || 25}
                    </div>
                </div>
            `;
        }

        this.ctx.timer.start(60);

        // Conecta o sensor de movimento no sandbox protegido
        await this.ctx.sandbox.bindDeviceMotion((shockData) => {
            this.onAction('SENSOR_SHOCK', shockData);
        }, this.config.sensibilidade || 25);
    }

    #renderStandardDirect() {
        const gbContent = document.getElementById('gb-content');
        if (!gbContent) return;

        const p = this.playersList[this.currentPlayerIdx % this.playersList.length];

        let specificHTML = '';
        const gid = this.config.gameId;

        if (gid === 'stop') {
            specificHTML = `
                <div style="margin:20px 0; padding:20px; background:var(--bg-off); border-radius:18px; border:2px solid var(--border-light);">
                    <div style="color:var(--text-muted); font-size:0.9em; font-weight:800;">CATEGORIA</div>
                    <div style="font-size:2em; font-weight:900; color:var(--duo-blue); margin-bottom:10px;">${this.gameCategory}</div>
                    <div style="color:var(--text-muted); font-size:0.9em; font-weight:800;">LETRA</div>
                    <div style="font-size:3em; font-weight:900; color:var(--duo-yellow);">${this.gameLetter}</div>
                </div>
                <p style="color:var(--text-main); font-weight:700;">O primeiro a falar salva-se! Aponte faltas nos outros:</p>
            `;
        } else if (gid === 'macabro') {
            specificHTML = `
                <div style="margin:20px 0; padding:25px; background:var(--bg-off); border-radius:18px; border:2px solid var(--border-light);">
                    <div style="font-size:1.3em; font-weight:900; color:var(--text-main); line-height:1.4;">${this.activePrompt}</div>
                </div>
                <p style="color:var(--text-muted); font-size:0.9em;">Façam perguntas de Sim/Não para desvendar!</p>
            `;
        } else if (gid === 'cinco') {
            specificHTML = `
                <div style="margin:20px 0; padding:20px; background:var(--bg-off); border-radius:18px; border:2px solid var(--duo-red);">
                    <div style="font-size:1.8em; font-weight:900; color:var(--duo-red);">${this.activePrompt}</div>
                </div>
                <div id="cinco-timer-display" style="font-size:3em; font-weight:900; color:var(--duo-yellow); margin-bottom:10px;">5s</div>
                <button class="btn btn-primary" style="margin-bottom:10px;" onclick="window.gameBus.emit('game:action', { type: 'START_CINCO_TIMER' })">⏱️ Valendo 5s!</button>
            `;
        } else {
            specificHTML = `
                <div style="margin:20px 0; padding:20px; background:var(--bg-off); border-radius:18px; border:2px solid var(--border-light);">
                    <div style="color:var(--text-muted); font-size:0.9em; font-weight:800;">TEMA / PALAVRA</div>
                    <div style="font-size:2em; font-weight:900; color:var(--duo-blue);">${this.activePrompt}</div>
                </div>
            `;
        }

        const cardsHTML = this.playersList.map(pl => {
            const faults = this.playerFaults[pl.id] || 0;
            return `
                <div style="position:relative; cursor:pointer;" onclick="window.gameBus.emit('game:action', { type: 'PLAYER_FAULT', payload: { playerId: '${pl.id}' } })">
                    ${this.ctx.ui.renderCard(pl).replace('width: 95px; height: 135px;', 'width: 70px; height: 100px; font-size:0.7em;')}
                    ${faults > 0 ? `<div style="position:absolute; bottom:5px; right:5px; background:var(--duo-red); color:white; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:0.7em; font-weight:900;">${faults}</div>` : ''}
                </div>
            `;
        }).join('');

        gbContent.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; width:100%; text-align:center;">
                <div style="font-weight:900; color:var(--duo-blue); font-size:1.1em;">Vez de: ${p?.name || 'Todos'}</div>
                ${specificHTML}
                <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin:15px 0;">
                    ${cardsHTML}
                </div>
                <button class="btn btn-dark" style="margin-top:15px; max-width:300px;" onclick="window.gameBus.emit('game:action', { type: 'FINISH_DIRECT' })">
                    🏁 Encerrar Rodada
                </button>
            </div>
        `;
    }

    onAction(type, payload = {}) {
        if (type === 'SENSOR_SHOCK') {
            this.#explodeBatata('Movimento brusco detectado!');
        } else if (type === 'PLAYER_FAULT') {
            const pid = payload.playerId;
            this.playerFaults[pid] = (this.playerFaults[pid] || 0) + 1;
            this.ctx.bus.emit('audio:play', { sfx: 'badum' });
            this.ctx.bus.emit('haptics:trigger', { preset: 'tap' });
            this.#renderStandardDirect();
        } else if (type === 'START_CINCO_TIMER') {
            this.ctx.timer.start(5);
        } else if (type === 'FINISH_DIRECT') {
            this.ctx.completeGame({
                playerFaults: this.playerFaults
            });
        }
    }

    onTick(deltaSec, elapsedSec, remainingSec) {
        if (this.config.gameId === 'batata') {
            // Heartbeat progressivo que acelera conforme aproxima da explosão
            const timeLeft = Math.max(0.1, this.explosionTime - elapsedSec);
            const interval = Math.max(0.35, (timeLeft / this.explosionTime) * 1.5);

            if (elapsedSec - this.lastHeartbeat >= interval) {
                this.lastHeartbeat = elapsedSec;
                this.ctx.bus.emit('audio:play', { sfx: 'heartbeat' });
                this.ctx.bus.emit('haptics:trigger', { preset: 'heartbeat' });
            }

            if (elapsedSec >= this.explosionTime) {
                this.#explodeBatata('O tempo acabou!');
            }
        } else if (this.config.gameId === 'cinco') {
            const timerEl = document.getElementById('cinco-timer-display');
            if (timerEl) {
                timerEl.innerText = `${Math.ceil(remainingSec)}s`;
            }
            if (remainingSec <= 0 && remainingSec + deltaSec > 0) {
                this.ctx.timer.stop();
                this.ctx.bus.emit('audio:play', { sfx: 'kaboom' });
                this.ctx.bus.emit('haptics:trigger', { preset: 'explosion' });
                this.ctx.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 500 });
            }
        }
    }

    #explodeBatata(reason) {
        this.ctx.timer.stop();
        this.ctx.bus.emit('audio:play', { sfx: 'kaboom' });
        this.ctx.bus.emit('fx:juice', { type: 'crack' });
        this.ctx.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 900 });
        this.ctx.bus.emit('haptics:trigger', { preset: 'explosion' });

        const explodedPlayer = this.playersList[this.currentPlayerIdx % this.playersList.length];

        this.ctx.sandbox.setTimeout(() => {
            this.ctx.completeGame({
                explodedPlayerId: explodedPlayer?.id,
                reason
            });
        }, 1200);
    }

    onFinish(rawOutcome = {}) {
        const mutations = [];
        const losers = [];

        if (this.config.gameId === 'batata') {
            const loserId = rawOutcome.explodedPlayerId;
            this.playersList.forEach(p => {
                if (p.id === loserId) {
                    mutations.push({ playerId: p.id, baseDelta: 0, statPrendDelta: 1, falhasDelta: 1 });
                    losers.push(p.id);
                } else {
                    mutations.push({ playerId: p.id, baseDelta: 10 });
                }
            });

            const loser = this.playersList.find(p => p.id === loserId);

            return {
                gameId: 'batata',
                outcome: 'SURVIVOR_WIN',
                title: 'A Bomba Explodiu!',
                titleColor: 'var(--duo-red)',
                detailHTML: `
                    <div style="font-size:1.2em; color:var(--text-main); margin-bottom:10px;">
                        ${rawOutcome.reason || 'Explosão!'}<br>
                        Pegou em: <b style="color:var(--duo-red);">${loser?.name || 'Jogador'}</b>
                    </div>
                `,
                scoreMutations: mutations,
                losers,
                celebrateWithConfetti: false
            };
        }

        // Jogos de pontuação / faltas
        const faults = rawOutcome.playerFaults || this.playerFaults;
        this.playersList.forEach(p => {
            const f = faults[p.id] || 0;
            if (f === 0) {
                mutations.push({ playerId: p.id, baseDelta: 10 });
            } else {
                mutations.push({ playerId: p.id, baseDelta: 0, falhasDelta: f, statPrendDelta: f });
                losers.push(p.id);
            }
        });

        return {
            gameId: this.config.gameId,
            outcome: 'SURVIVOR_WIN',
            title: 'Fim da Roda!',
            titleColor: 'var(--duo-green)',
            detailHTML: `<p style="color:var(--text-main); font-weight:800;">Quem não cometeu faltas soma +10 Pts!</p>`,
            scoreMutations: mutations,
            losers,
            celebrateWithConfetti: true
        };
    }

    onDestroy() {
        this.currentPlayerIdx = 0;
    }
}
