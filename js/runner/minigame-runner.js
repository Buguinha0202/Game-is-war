import { ResourceSandbox } from '../kernel/resource-sandbox.js';

/**
 * MiniGameRunner - Nível 2 (Seção 6 do plano).
 * Orquestrador central do ciclo de vida, GameLoop rAF e injeção de dependências para minigames.
 */
export class MiniGameRunner {
    #registry = new Map();
    #activePlugin = null;
    #activeSandbox = null;
    #state = 'IDLE';
    #rafId = null;
    #lastFrameTime = 0;
    #stageDuration = 0;
    #stageElapsed = 0;
    #isTimerPaused = true;

    constructor({ eventBus, stateStore, uiBridge }) {
        this.bus = eventBus;
        this.store = stateStore;
        this.ui = uiBridge;

        this.bus.on('game:action', ({ type, payload }) => {
            if (this.#state === 'RUNNING' && this.#activePlugin) {
                this.#activePlugin.onAction(type, payload);
            }
        });
    }

    register(gameIds, PluginClass) {
        const ids = Array.isArray(gameIds) ? gameIds : [gameIds];
        ids.forEach(id => this.#registry.set(id, PluginClass));
    }

    launch(gameId) {
        if (this.#activePlugin) {
            this.abortCurrentGame();
        }

        const PluginClass = this.#registry.get(gameId);
        if (!PluginClass) {
            console.error(`[MiniGameRunner] Nenhum plugin registrado para "${gameId}".`);
            return;
        }

        const config = this.store.buildGameConfig(gameId);
        const teamsSnapshot = structuredClone(this.store.getTeams());

        // Validação de pré-requisitos específicos de times
        if (gameId === 'megasenha' && teamsSnapshot.length !== 2) {
            if (this.ui?.showAlert) {
                this.ui.showAlert('Bloqueio', 'Mega Senha exige exatamente 2 duplas armadas.');
            }
            return;
        }

        const boardRoot = document.getElementById('screen-game-board') || document.body;
        this.#activeSandbox = new ResourceSandbox(this.bus, boardRoot);
        this.#activePlugin = new PluginClass();

        const context = this.#createPluginContext(this.#activeSandbox);

        this.#state = 'INITIALIZED';
        this.#activePlugin.onInit(config, teamsSnapshot, context);

        this.#state = 'RUNNING';
        this.#activeSandbox.requestWakeLock();
        this.#activePlugin.onStart();
        this.#startLoop();
    }

    #createPluginContext(sandbox) {
        return Object.freeze({
            sandbox,
            bus: {
                emit: (event, payload) => this.bus.emit(event, payload),
                on: (event, fn) => this.bus.on(event, fn, sandbox.busScope),
                once: (event, fn) => this.bus.once(event, fn, sandbox.busScope)
            },
            timer: {
                start: (durationSec) => {
                    this.#stageDuration = durationSec;
                    this.#stageElapsed = 0;
                    this.#isTimerPaused = false;
                },
                addSeconds: (deltaSec) => {
                    this.#stageDuration = Math.max(0, this.#stageDuration + deltaSec);
                },
                pause: () => { this.#isTimerPaused = true; },
                resume: () => { this.#isTimerPaused = false; },
                stop: () => {
                    this.#isTimerPaused = true;
                    this.#stageElapsed = 0;
                }
            },
            ui: {
                navigate: (screenId) => {
                    if (this.ui?.navWithoutTeardown) {
                        this.ui.navWithoutTeardown(screenId);
                    } else if (window.appCore?.nav) {
                        window.appCore.nav(screenId);
                    }
                },
                renderCard: (player, extraClass = '') => {
                    return typeof window.generateCardHTML === 'function'
                        ? window.generateCardHTML(player, extraClass)
                        : `<div>${player.name}</div>`;
                },
                setSoundboardVisible: (visible) => {
                    const el = document.getElementById('soundboard-ui');
                    if (el) el.style.display = visible ? 'flex' : 'none';
                },
                setBlackStoreVisible: (visible) => {
                    const el = document.getElementById('btn-in-game-store');
                    if (el) el.style.display = visible ? 'flex' : 'none';
                }
            },
            completeGame: (rawOutcome) => this.#handlePluginFinish(rawOutcome)
        });
    }

    #startLoop() {
        this.#lastFrameTime = performance.now();
        const step = (now) => {
            if (this.#state !== 'RUNNING') return;
            const deltaSec = Math.min((now - this.#lastFrameTime) / 1000, 0.1);
            this.#lastFrameTime = now;

            if (!this.#isTimerPaused && this.#stageDuration > 0) {
                this.#stageElapsed += deltaSec;
            }
            const remainingSec = Math.max(0, this.#stageDuration - this.#stageElapsed);

            if (this.#activePlugin) {
                this.#activePlugin.onTick(deltaSec, this.#stageElapsed, remainingSec);
            }

            if (this.#state === 'RUNNING') {
                this.#rafId = requestAnimationFrame(step);
            }
        };
        this.#rafId = requestAnimationFrame(step);
    }

    #handlePluginFinish(rawOutcome) {
        if (this.#state !== 'RUNNING') return;
        this.#state = 'FINISHING';
        if (this.#rafId) cancelAnimationFrame(this.#rafId);

        const resultPayload = this.#activePlugin.onFinish(rawOutcome);
        this.teardownActivePlugin();

        this.store.applyGameResult(resultPayload);

        if (this.ui?.presentResultScreen) {
            this.ui.presentResultScreen(resultPayload);
        }
    }

    abortCurrentGame() {
        if (!this.#activePlugin) return;
        if (this.#rafId) cancelAnimationFrame(this.#rafId);
        this.teardownActivePlugin();
    }

    teardownActivePlugin() {
        this.#state = 'DESTROYED';
        try {
            this.#activePlugin?.onDestroy();
        } catch (err) {
            console.error('[MiniGameRunner] Erro durante onDestroy:', err);
        } finally {
            this.#activeSandbox?.dispose();
            this.#activePlugin = null;
            this.#activeSandbox = null;
            this.#isTimerPaused = true;

            const sb = document.getElementById('soundboard-ui');
            if (sb) sb.style.display = 'none';

            const storeBtn = document.getElementById('btn-in-game-store');
            if (storeBtn) storeBtn.style.display = 'none';

            this.#state = 'IDLE';
        }
    }
}
