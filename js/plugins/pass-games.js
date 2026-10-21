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
 * PassGamePlugin - Nível 3 (Seção 7.1 do plano).
 * Minigames de passar o dispositivo de mão em mão:
 * 'impostor', 'espiao', 'duplas', 'posicao'
 */
export class PassGamePlugin extends MiniGamePlugin {
    roundData = {
        playOrder: [],
        roles: [],
        baseWord: '',
        category: '',
        impostorId: null,
        impostorName: ''
    };
    turnIndex = 0;
    phase = 'REVEAL'; // 'REVEAL' | 'DISCUSSION' | 'ORDERING' | 'VOTING' | 'VERDICT'

    onInit(config, teams, context) {
        super.onInit(config, teams, context);

        const players = teams[0]?.players || [];
        const shuf = shuffle(players);
        this.roundData.playOrder = shuf;
        this.roundData.roles = [];

        const gameId = config.gameId;

        if (gameId === 'impostor' || gameId === 'espiao') {
            const availableThemes = config.themes.length > 0 ? config.themes : Object.keys(config.dictionary);
            const cat = availableThemes[Math.floor(Math.random() * availableThemes.length)] || 'Animais';
            const wordsList = config.dictionary[cat] || ['Leão', 'Tigre', 'Gato'];
            const chosenWord = wordsList[Math.floor(Math.random() * wordsList.length)];

            const impIdx = Math.floor(Math.random() * shuf.length);
            this.roundData.baseWord = chosenWord;
            this.roundData.category = cat;
            this.roundData.impostorId = shuf[impIdx]?.id;
            this.roundData.impostorName = shuf[impIdx]?.name;

            shuf.forEach((p, i) => {
                const isImp = i === impIdx;
                this.roundData.roles.push({
                    id: p.id,
                    title: isImp ? 'Você é o Infiltrado' : 'Sua Palavra',
                    word: isImp ? 'Finja que sabe a palavra!' : chosenWord
                });
            });
        } else if (gameId === 'posicao') {
            const nums = shuffle(Array.from({ length: 10 }, (_, i) => i + 1));
            shuf.forEach((p, i) => {
                const n = nums[i % 10];
                this.roundData.roles.push({
                    id: p.id,
                    title: 'Sua Posição',
                    word: `${n}º Lugar`,
                    num: n
                });
            });
        } else if (gameId === 'duplas') {
            let rolesArr = ['CHAVE SECRETA', 'CHAVE SECRETA', 'CHAVE SECRETA', 'CHAVE SECRETA', 'IMPOSTOR'];
            rolesArr = shuffle(rolesArr);
            const activeSlice = shuf.slice(0, 5);
            activeSlice.forEach((p, i) => {
                const role = rolesArr[i] || 'CHAVE SECRETA';
                const isImp = role === 'IMPOSTOR';
                if (isImp) {
                    this.roundData.impostorId = p.id;
                    this.roundData.impostorName = p.name;
                }
                this.roundData.roles.push({
                    id: p.id,
                    title: isImp ? 'Você é o Infiltrado' : 'Sua Palavra',
                    word: role
                });
            });
            this.roundData.playOrder = activeSlice;
        }

        this.turnIndex = 0;
        this.phase = 'REVEAL';
    }

    onStart() {
        this.ctx.ui.navigate('screen-reveal');
        this.#prepareTurnScreen();
    }

    onAction(type, payload = {}) {
        if (type === 'SECRET_HOLD' || type === 'SHOW_SECRET') {
            this.#showSecret();
        } else if (type === 'SECRET_RELEASE' || type === 'HIDE_SECRET') {
            this.#hideSecret();
        } else if (type === 'NEXT_TURN') {
            this.turnIndex++;
            this.#prepareTurnScreen();
        } else if (type === 'START_VOTING') {
            this.#startVoting();
        } else if (type === 'CAST_VOTE' || type === 'PROCESS_VOTE') {
            this.#processVote(payload.votedPlayerId || payload.vId);
        } else if (type === 'CHECK_POSICOES') {
            this.#checkPosicoes();
        }
    }

    onTick(deltaSec, elapsedSec, remainingSec) {
        if (this.phase === 'DISCUSSION') {
            const timerEl = document.getElementById('disc-timer');
            if (timerEl) {
                const sec = Math.ceil(remainingSec);
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                timerEl.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
            }

            if (remainingSec <= 10 && remainingSec > 0 && Math.floor(remainingSec) !== Math.floor(remainingSec - deltaSec)) {
                this.ctx.bus.emit('audio:play', { sfx: 'beep', highTone: true });
            }

            if (remainingSec <= 0) {
                this.ctx.timer.stop();
                this.#startVoting();
            }
        }
    }

    #showSecret() {
        const cover = document.getElementById('secret-cover');
        if (cover) {
            this.ctx.sandbox.animate(() => {
                if (window.gsap) {
                    window.gsap.to(cover, { y: '100%', duration: 0.2, ease: 'power2.out' });
                } else {
                    cover.style.transform = 'translateY(100%)';
                }
            });
        }
        this.ctx.bus.emit('haptics:trigger', { preset: 'tap' });
        const btnNext = document.getElementById('btn-next-player');
        if (btnNext) btnNext.style.display = 'block';
    }

    #hideSecret() {
        const cover = document.getElementById('secret-cover');
        if (cover) {
            this.ctx.sandbox.animate(() => {
                if (window.gsap) {
                    window.gsap.to(cover, { y: '0%', duration: 0.2, ease: 'power2.out' });
                } else {
                    cover.style.transform = 'translateY(0%)';
                }
            });
        }
    }

    #prepareTurnScreen() {
        const btnNext = document.getElementById('btn-next-player');
        if (btnNext) btnNext.style.display = 'none';
        this.#hideSecret();

        const catEl = document.getElementById('reveal-category-display');
        if (catEl) {
            if (['impostor', 'espiao'].includes(this.config.gameId)) {
                catEl.style.display = 'block';
                catEl.innerText = 'TEMA: ' + this.roundData.category;
            } else {
                catEl.style.display = 'none';
            }
        }

        if (this.turnIndex < this.roundData.playOrder.length) {
            const p = this.roundData.playOrder[this.turnIndex];
            const rd = this.roundData.roles.find(r => r.id === p.id) || { title: '', word: '' };

            const nameEl = document.getElementById('turn-player-name');
            const titleEl = document.getElementById('role-title');
            const textEl = document.getElementById('secret-text');

            if (nameEl) nameEl.innerText = p.name;
            if (titleEl) titleEl.innerText = rd.title;
            if (textEl) textEl.innerText = rd.word;

            if (rd.title === 'Você é o Infiltrado') {
                if (textEl) textEl.style.color = 'var(--duo-red)';
                if (titleEl) titleEl.style.color = 'var(--duo-red)';
            } else {
                if (textEl) textEl.style.color = '#fff';
                if (titleEl) titleEl.style.color = 'var(--text-muted)';
            }
        } else {
            // Fim da revelação
            if (['impostor', 'espiao'].includes(this.config.gameId)) {
                this.phase = 'DISCUSSION';
                this.ctx.ui.navigate('screen-game-board');

                const gbTitle = document.getElementById('gb-title');
                if (gbTitle) gbTitle.innerText = 'Discussão';

                this.ctx.ui.setSoundboardVisible(true);

                const gbContent = document.getElementById('gb-content');
                if (gbContent) {
                    gbContent.innerHTML = `
                        <div style="font-size:1.5em; color:var(--duo-blue); font-weight:900; margin-bottom:20px; text-transform:uppercase;">
                            Tema: ${this.roundData.category}
                        </div>
                        <div style="width:200px; height:200px; border-radius:50%; border:6px solid var(--duo-blue); display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 0 30px rgba(28, 176, 246, 0.4);">
                            <div style="color:var(--duo-blue); font-weight:900;">${this.roundData.playOrder[0]?.name || 'Primeiro'} Começa!</div>
                            <div id="disc-timer" style="font-size:3.5em; font-weight:900;">Tempo</div>
                        </div>
                        <button class="btn btn-danger" style="margin-top:30px;" onclick="window.gameBus.emit('game:action', { type: 'START_VOTING' })">
                            Votar / Acusar
                        </button>
                    `;
                }

                this.ctx.timer.start(this.config.time || 240);
            } else if (this.config.gameId === 'posicao') {
                this.phase = 'ORDERING';
                this.ctx.ui.navigate('screen-game-board');

                const gbTitle = document.getElementById('gb-title');
                if (gbTitle) gbTitle.innerText = 'Sintonia';

                const pHTML = this.roundData.playOrder.map(p => `
                    <div style="cursor:pointer;">
                        ${this.ctx.ui.renderCard(p).replace('width: 95px; height: 135px;', 'width: 75px; height: 105px; font-size:0.75em;')}
                    </div>
                `).join('');

                const gbContent = document.getElementById('gb-content');
                if (gbContent) {
                    gbContent.innerHTML = `
                        <p style="color:var(--text-muted); text-align:center;">Fiquem na ordem crescente correta!</p>
                        <div id="pos-board-list" style="width:100%; display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin:20px 0;">
                            ${pHTML}
                        </div>
                        <button class="btn btn-success" style="padding:20px; font-size:1.2em;" onclick="window.gameBus.emit('game:action', { type: 'CHECK_POSICOES' })">
                            Verificar Gabarito
                        </button>
                    `;
                }
            } else if (this.config.gameId === 'duplas') {
                this.phase = 'DISCUSSION';
                this.ctx.ui.navigate('screen-game-board');
                const gbTitle = document.getElementById('gb-title');
                if (gbTitle) gbTitle.innerText = 'Quem é seu par?';

                const gbContent = document.getElementById('gb-content');
                if (gbContent) {
                    gbContent.innerHTML = `
                        <p style="color:var(--text-muted); text-align:center;">Conversem e achem a sua dupla sem deixar o impostor descobrir!</p>
                        <button class="btn btn-danger" style="margin-top:30px;" onclick="window.gameBus.emit('game:action', { type: 'START_VOTING' })">
                            Votar no Impostor
                        </button>
                    `;
                }
            }
        }
    }

    #startVoting() {
        this.phase = 'VOTING';
        this.ctx.timer.stop();
        this.ctx.ui.setSoundboardVisible(false);
        this.ctx.ui.navigate('screen-vote');

        const c = document.getElementById('vote-list-container');
        if (c) {
            c.innerHTML = '';
            this.roundData.playOrder.forEach(p => {
                c.innerHTML += `
                    <div style="display:inline-block; margin:6px; cursor:pointer;" onclick="window.gameBus.emit('game:action', { type: 'CAST_VOTE', payload: { votedPlayerId: '${p.id}' } })">
                        <div style="transform: scale(0.85); transform-origin: center;">
                            ${this.ctx.ui.renderCard(p)}
                        </div>
                    </div>
                `;
            });
        }
    }

    #processVote(votedId) {
        if (this.phase === 'VERDICT') return;
        this.phase = 'VERDICT';

        const isImpostorCaught = String(votedId) === String(this.roundData.impostorId);
        const pVoted = this.roundData.playOrder.find(x => x.id === votedId);
        if (!pVoted) return;

        this.ctx.ui.navigate('screen-verdict');
        const vScreen = document.getElementById('screen-verdict');
        const vCont = document.getElementById('verdict-container');
        const vName = document.getElementById('verdict-name');

        if (vScreen) {
            vScreen.style.backgroundColor = '#131f24';
            vScreen.classList.remove('shake-camera');
        }
        if (vCont) vCont.innerHTML = '';
        if (vName) vName.innerText = 'Escaneando Mente...';

        this.ctx.bus.emit('audio:play', { sfx: 'scan' });
        this.ctx.bus.emit('haptics:trigger', { preset: 'tap' });

        this.ctx.sandbox.setTimeout(() => {
            if (vName) vName.innerText = isImpostorCaught ? 'AMEAÇA DETECTADA!' : 'CIDADÃO LIMPO.';
            if (isImpostorCaught) {
                if (vScreen) vScreen.style.backgroundColor = 'var(--duo-green)';
                this.ctx.bus.emit('audio:play', { sfx: 'success' });
                this.ctx.bus.emit('fx:juice', { type: 'confetti', color: ['#58cc02', '#ffffff'] });
            } else {
                if (vScreen) {
                    vScreen.style.backgroundColor = 'var(--duo-red)';
                    vScreen.classList.add('shake-camera');
                }
                this.ctx.bus.emit('audio:play', { sfx: 'kaboom' });
                this.ctx.bus.emit('audio:play', { sfx: 'siren' });
                this.ctx.bus.emit('fx:screenshake', { intensity: 'heavy', durationMs: 700 });
                this.ctx.bus.emit('haptics:trigger', { preset: 'explosion' });
            }

            this.ctx.sandbox.setTimeout(() => {
                this.ctx.completeGame({
                    isImpostorCaught,
                    votedPlayerId: votedId
                });
            }, 3000);
        }, 3200);
    }

    #checkPosicoes() {
        const sorted = [...this.roundData.roles].sort((a, b) => a.num - b.num);
        const gbContent = document.getElementById('gb-content');
        if (gbContent) {
            const listHtml = sorted.map(s => {
                const p = this.roundData.playOrder.find(x => x.id === s.id);
                return `<div style="padding:8px 15px; margin:5px; background:var(--bg-off); border-radius:12px; font-weight:800;">${s.word}: ${p?.name}</div>`;
            }).join('');
            gbContent.innerHTML = `
                <h3 style="color:var(--duo-blue); margin-bottom:15px;">Gabarito Oficial:</h3>
                <div style="display:flex; flex-direction:column; gap:5px; margin-bottom:20px;">${listHtml}</div>
                <button class="btn btn-primary" onclick="window.gameBus.emit('game:action', { type: 'FINISH_POSICAO' })">Concluir Partida</button>
            `;
        }
        this.ctx.bus.on('game:action', (ev) => {
            if (ev.type === 'FINISH_POSICAO') {
                this.ctx.completeGame({ isSyncCompleted: true });
            }
        });
    }

    onFinish(rawOutcome = {}) {
        const isCaught = !!rawOutcome.isImpostorCaught;
        const impId = this.roundData.impostorId;
        const mutations = [];
        const losers = [];

        if (this.config.gameId === 'posicao') {
            this.roundData.playOrder.forEach(p => {
                mutations.push({ playerId: p.id, baseDelta: 10 });
            });
            return {
                gameId: this.config.gameId,
                outcome: 'SYNC_COMPLETED',
                title: 'Sintonia Revelada!',
                titleColor: 'var(--duo-green)',
                detailHTML: `<p style="color:var(--text-main); font-weight:800;">Todos que acertaram a ordem somam +10 Pts!</p>`,
                scoreMutations: mutations,
                celebrateWithConfetti: true
            };
        }

        if (isCaught) {
            this.roundData.playOrder.forEach(p => {
                if (p.id !== impId) {
                    mutations.push({ playerId: p.id, baseDelta: 10 });
                }
            });
            losers.push(impId);

            return {
                gameId: this.config.gameId,
                outcome: 'PASS_WIN',
                title: 'Infiltrado Pego!',
                titleColor: 'var(--duo-green)',
                detailHTML: `
                    <div style="font-size:1.2em; color:var(--text-main); margin-bottom:10px;">
                        Palavra: <b style="color:var(--duo-blue);">${this.roundData.baseWord}</b><br>
                        Infiltrado: <b style="color:var(--duo-red);">${this.roundData.impostorName}</b>
                    </div>
                `,
                scoreMutations: mutations,
                losers,
                celebrateWithConfetti: true,
                confettiColors: ['#58cc02', '#ffffff', '#1cb0f6']
            };
        } else {
            mutations.push({
                playerId: impId,
                baseDelta: 15,
                statImpDelta: 1
            });
            this.roundData.playOrder.forEach(p => {
                if (p.id !== impId) losers.push(p.id);
            });

            return {
                gameId: this.config.gameId,
                outcome: 'IMPOSTOR_WIN',
                title: 'Infiltrado Venceu!',
                titleColor: 'var(--duo-red)',
                detailHTML: `
                    <div style="font-size:1.2em; color:var(--text-main); margin-bottom:10px;">
                        Palavra: <b style="color:var(--duo-blue);">${this.roundData.baseWord}</b><br>
                        Infiltrado: <b style="color:var(--duo-red);">${this.roundData.impostorName}</b>
                    </div>
                `,
                scoreMutations: mutations,
                losers,
                celebrateWithConfetti: true,
                confettiColors: ['#ff4b4b', '#ffc800', '#000000']
            };
        }
    }

    onDestroy() {
        const vScreen = document.getElementById('screen-verdict');
        if (vScreen) {
            vScreen.style.backgroundColor = 'var(--bg-main)';
            vScreen.classList.remove('shake-camera');
        }
        const vCont = document.getElementById('verdict-container');
        if (vCont) vCont.innerHTML = '';
        this.phase = 'REVEAL';
    }
}
