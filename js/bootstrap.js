import { EventBus } from './kernel/event-bus.js';
import { StateStore } from './services/state-store.js';
import { AudioEngine } from './services/audio-engine.js';
import { JuiceManager } from './services/juice-manager.js';
import { MiniGameRunner } from './runner/minigame-runner.js';

import { PassGamePlugin } from './plugins/pass-games.js';
import { TeamGamePlugin } from './plugins/team-games.js';
import { DirectGamePlugin } from './plugins/direct-games.js';

// 1. FUNDAÇÃO (Nível 0)
const bus = new EventBus();

// 2. SERVIÇOS CORE (Nível 1)
const stateStore = new StateStore({ eventBus: bus });
const audio = new AudioEngine({ bus, isEnabled: () => window.isSoundOn });
const juice = new JuiceManager({ bus, isVibrationEnabled: () => window.isVibOn });

// Ponte de Interface com o DOM do Jogo
const uiBridge = {
    navWithoutTeardown: (screenId) => {
        const current = document.querySelector('.screen.active');
        const next = document.getElementById(screenId);
        if (current && current.id !== screenId) {
            current.classList.remove('active');
            current.style.display = 'none';
        }
        if (next) {
            next.style.display = 'flex';
            next.classList.add('active');
            if (typeof window.gsap !== 'undefined') {
                window.gsap.fromTo(next, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
            } else {
                next.style.opacity = 1;
                next.style.transform = 'none';
            }
        }
    },
    showAlert: (title, message, icon = '⚠️') => {
        if (typeof window.showCustomAlert === 'function') {
            window.showCustomAlert(title, message, icon);
        } else {
            alert(`${title}: ${message}`);
        }
    },
    presentResultScreen: (resultPayload) => {
        const titleEl = document.getElementById('result-title');
        const detailEl = document.getElementById('result-detail-box');

        if (titleEl) {
            titleEl.innerText = resultPayload.title || 'Fim de Rodada';
            titleEl.style.color = resultPayload.titleColor || 'var(--text-main)';
        }

        if (detailEl) {
            detailEl.innerHTML = resultPayload.detailHTML || '';
        }

        if (resultPayload.celebrateWithConfetti) {
            bus.emit('fx:juice', {
                type: 'confetti',
                color: resultPayload.confettiColors || ['#58cc02', '#ffffff', '#1cb0f6']
            });
        }

        // Navega para a tela de resultado
        uiBridge.navWithoutTeardown('screen-result');

        // Modo Torneio: checa campeão ou adiciona botão de próximo jogo
        if (window.tournamentMode) {
            const players = stateStore.getPlayers();
            const target = Number(window.tourneyTarget) || 100;
            const champion = players.find(p => p.score >= target);

            if (champion) {
                setTimeout(() => {
                    uiBridge.showAlert("Soberano Encontrado!", `🎉 TEMOS UM CAMPEÃO DO TORNEIO! ${champion.name} bateu a meta!`, "🏆");
                    if (window.appCore?.encerrarNoite) window.appCore.encerrarNoite();
                }, 800);
            } else {
                let existingBtn = document.getElementById('btn-tourney-next');
                if (!existingBtn && detailEl) {
                    let btn = document.createElement('button');
                    btn.id = 'btn-tourney-next';
                    btn.className = 'btn btn-warning';
                    btn.innerText = 'Girar Próximo Jogo ➔';
                    btn.style.marginTop = '15px';
                    btn.style.color = 'black';
                    btn.onclick = () => {
                        btn.remove();
                        if (typeof window.playTournamentNext === 'function') {
                            window.playTournamentNext();
                        }
                    };
                    detailEl.appendChild(btn);
                }
            }
        }
    }
};

// 3. RUNNER CENTRAL (Nível 2)
const runner = new MiniGameRunner({
    eventBus: bus,
    stateStore,
    uiBridge
});

// Registro das 3 Famílias de Jogos (Nível 3)
runner.register(['impostor', 'espiao', 'duplas', 'posicao'], PassGamePlugin);
runner.register(['megasenha', 'completa', 'nota'], TeamGamePlugin);
runner.register(['macabro', 'unica', 'quemsoueu', 'mimica', 'stop', 'sevira', 'cinco', 'batata', 'ultimo'], DirectGamePlugin);

// 4. RETROCOMPATIBILIDADE E FAÇADES GLOBAIS
window.gameBus = bus;
window.gameRunner = runner;
window.gameStateStore = stateStore;
window.gameServices = Object.freeze({ audio, juice });

// Áudio e Háptica via EventBus
window.playSound = (sfx) => bus.emit('audio:play', { sfx });
window.playBeep = (isHigh = false) => bus.emit('audio:play', { sfx: 'beep', highTone: !!isHigh });
window.playKaboom = () => bus.emit('audio:play', { sfx: 'kaboom' });
window.playHeartbeat = () => bus.emit('audio:play', { sfx: 'heartbeat' });
window.vibrar = (pattern = 200) => bus.emit('haptics:trigger', { pattern });
window.hapticTap = () => bus.emit('haptics:trigger', { preset: 'tap' });

if (window.appCore) {
    window.appCore.playSound = window.playSound;

    // Encapsula a navegação padrão para abortar jogos ativos com teardown limpo
    const originalNav = window.appCore.nav;
    window.appCore.nav = function(screenId) {
        if (screenId === 'screen-home' || screenId === 'screen-players' || screenId === 'screen-tourney-setup') {
            runner.abortCurrentGame();
        }
        originalNav(screenId);
    };

    window.appCore.stopAudioAndNav = function(screen) {
        runner.abortCurrentGame();
        window.appCore.nav(screen);
        const sb = document.getElementById('soundboard-ui');
        if (sb) sb.style.display = 'none';
    };
}

// Redireciona o roteador legado para o MiniGameRunner
if (window.minigames) {
    window.minigames.startGameRouter = function() {
        const tEl = document.getElementById('config-time');
        if (tEl && window.gameConfigs) window.gameConfigs.time = parseInt(tEl.value);

        const sEl = document.getElementById('config-sens');
        if (sEl && window.gameConfigs) window.gameConfigs.sensibilidade = parseInt(sEl.value);

        const mEl = document.getElementById('config-modes');
        if (mEl && window.gameConfigs) window.gameConfigs.modes = mEl.value;

        const currentGame = window.currentGameActive;
        runner.launch(currentGame);
    };

    // Ações de carta e turno mapeadas para o barramento
    window.minigames.showSecret = () => bus.emit('game:action', { type: 'SECRET_HOLD' });
    window.minigames.hideSecret = () => bus.emit('game:action', { type: 'SECRET_RELEASE' });
    window.minigames.nextTurn = () => bus.emit('game:action', { type: 'NEXT_TURN' });

    window.minigames.buySabotage = function(item, cost) {
        bus.emit('game:action', {
            type: 'SABOTAGE_APPLIED',
            payload: { item, cost }
        });
        if (window.appCore?.closeModal) {
            window.appCore.closeModal('store-modal');
        }
    };
}

console.log('[Game is War] Arquitetura MiniGamePlugin & EventBus inicializada com sucesso.');
