/**
 * Game is War 3.0 - Core Engine (Neo-Brutalism Edition)
 * Kernel Reativo, Audio Procedural, GameStore, Avatar Forge e Sistema de Prendas
 */

window.GIW = window.GIW || {};
window.appCore = window.appCore || {};

// ==========================================
// 1. EVENT BUS (NÍVEL 0)
// ==========================================
class EventBus {
    #listeners = new Map();

    on(event, handler, scope = null) {
        if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
        const entry = { fn: handler, scope, once: false };
        this.#listeners.get(event).add(entry);
        return () => this.#listeners.get(event)?.delete(entry);
    }

    once(event, handler, scope = null) {
        if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
        const entry = { fn: handler, scope, once: true };
        this.#listeners.get(event).add(entry);
        return () => this.#listeners.get(event)?.delete(entry);
    }

    emit(event, payload = {}) {
        const set = this.#listeners.get(event);
        if (!set) return;
        for (const entry of [...set]) {
            if (entry.once) set.delete(entry);
            try { entry.fn(payload); } catch (e) { console.error(`[EventBus] Erro em ${event}:`, e); }
        }
    }

    clearScope(scope) {
        if (!scope) return;
        for (const set of this.#listeners.values()) {
            for (const entry of set) {
                if (entry.scope === scope) set.delete(entry);
            }
        }
    }
}

const bus = new EventBus();
window.GIW.bus = bus;

// ==========================================
// 2. RESOURCE SANDBOX (NÍVEL 1)
// ==========================================
class ResourceSandbox {
    #timeouts = new Set();
    #intervals = new Set();
    #abortController = new AbortController();
    #gsapContext = null;
    #wakeLock = null;
    #scope = Symbol('PluginScope');

    constructor(rootEl) {
        if (typeof window.gsap !== 'undefined' && typeof window.gsap.context === 'function' && rootEl) {
            this.#gsapContext = window.gsap.context(() => {}, rootEl);
        }
    }

    get scope() { return this.#scope; }

    setTimeout(fn, delay, ...args) {
        const id = window.setTimeout(() => {
            this.#timeouts.delete(id);
            fn(...args);
        }, delay);
        this.#timeouts.add(id);
        return id;
    }

    clearTimeout(id) {
        window.clearTimeout(id);
        this.#timeouts.delete(id);
    }

    setInterval(fn, interval, ...args) {
        const id = window.setInterval(fn, interval, ...args);
        this.#intervals.add(id);
        return id;
    }

    clearInterval(id) {
        window.clearInterval(id);
        this.#intervals.delete(id);
    }

    addEventListener(target, type, listener, options = {}) {
        const opts = typeof options === 'boolean'
            ? { capture: options, signal: this.#abortController.signal }
            : { ...options, signal: this.#abortController.signal };
        target.addEventListener(type, listener, opts);
    }

    async bindDeviceMotion(onShock, threshold = 25) {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const res = await DeviceMotionEvent.requestPermission();
                if (res !== 'granted') return false;
            } catch { return false; }
        }
        this.addEventListener(window, 'devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity || e.acceleration;
            if (!acc) return;
            const mag = Math.sqrt((acc.x || 0)**2 + (acc.y || 0)**2 + (acc.z || 0)**2);
            if (Math.abs(mag - 9.81) >= threshold) {
                onShock({ magnitude: mag, delta: Math.abs(mag - 9.81) });
            }
        }, { passive: true });
        return true;
    }

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { this.#wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
        }
    }

    dispose() {
        for (const t of this.#timeouts) window.clearTimeout(t);
        this.#timeouts.clear();
        for (const i of this.#intervals) window.clearInterval(i);
        this.#intervals.clear();
        this.#abortController.abort();
        if (this.#gsapContext) {
            this.#gsapContext.revert();
            this.#gsapContext = null;
        }
        if (this.#wakeLock) {
            try { this.#wakeLock.release(); } catch (_) {}
            this.#wakeLock = null;
        }
        bus.clearScope(this.#scope);
        bus.emit('audio:filter', { mode: 'normal' });
    }
}
window.GIW.ResourceSandbox = ResourceSandbox;

// ==========================================
// 3. GAME STORE COM LOCALSTORAGE & MARIO KART
// ==========================================
const STORAGE_KEY = 'GIW_STATE_V3';
let prendaTimerId = null;

class GameStore {
    players = [];
    teams = [];
    bench = [];
    currentGameActive = '';
    currentEvent = null;
    isMarioKart = false;
    isEvents = true;
    isChaos = false;
    isRoles = false;
    isSoundOn = true;
    isVibOn = true;
    tourneyTarget = 100;
    tourneyType = 'rounds';
    tourneyMaxRounds = 5;
    tourneyCurrentRound = 0;
    tourneyCuratedMode = 'balanced';
    tourneyPool = [];
    tourneyAllowedGames = [];
    tournamentMode = false;
    sessionRounds = 0;
    gameConfigs = { time: 60, sensibilidade: 25, modes: 'classico', themes: [] };

    isTourneyOver() {
        if (!this.tournamentMode) return false;
        if (this.tourneyType === 'rounds') {
            return this.tourneyCurrentRound >= this.tourneyMaxRounds;
        }
        return this.players.some(p => (p.score || 0) >= this.tourneyTarget);
    }

    constructor() {
        this.load();
    }

    save() {
        try {
            const data = {
                players: this.players,
                isMarioKart: this.isMarioKart,
                isEvents: this.isEvents,
                isChaos: this.isChaos,
                isRoles: this.isRoles,
                isSoundOn: this.isSoundOn,
                isVibOn: this.isVibOn,
                tourneyTarget: this.tourneyTarget,
                sessionRounds: this.sessionRounds
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (_) {}
    }

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (Array.isArray(d.players)) this.players = d.players;
                if (typeof d.isMarioKart === 'boolean') this.isMarioKart = d.isMarioKart;
                if (typeof d.isEvents === 'boolean') this.isEvents = d.isEvents;
                if (typeof d.isChaos === 'boolean') this.isChaos = d.isChaos;
                if (typeof d.isRoles === 'boolean') this.isRoles = d.isRoles;
                if (typeof d.isSoundOn === 'boolean') this.isSoundOn = d.isSoundOn;
                if (typeof d.isVibOn === 'boolean') this.isVibOn = d.isVibOn;
                if (d.tourneyTarget) this.tourneyTarget = Number(d.tourneyTarget) || 100;
                if (typeof d.sessionRounds === 'number') this.sessionRounds = d.sessionRounds;
            }
        } catch (_) {}
    }

    syncSettingsUI() {
        const setToggle = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('active', !!val);
        };
        setToggle('t-roles', this.isRoles);
        setToggle('t-mario', this.isMarioKart);
        setToggle('t-chaos', this.isChaos);
        setToggle('t-events', this.isEvents);
        setToggle('t-sound', this.isSoundOn);
        this.isVibOn = this.isSoundOn;
        const banner = document.getElementById('banner-caos-active');
        if (banner) banner.style.display = this.isChaos ? 'block' : 'none';
        this.updateStreakBadge();
    }

    updateStreakBadge() {
        const el = document.getElementById('header-streak-fire');
        if (!el) return;
        const maxStreak = Math.max(0, ...this.players.map(p => p.streak || 0));
        el.innerText = `🔥 ${maxStreak}`;
        if (maxStreak >= 2) {
            el.style.background = 'var(--pop-magenta)';
            el.style.color = '#ffffff';
        } else {
            el.style.background = 'var(--pop-orange)';
            el.style.color = 'var(--ink-black)';
        }
    }

    isUnderdog(playerId) {
        if (!this.isMarioKart || this.players.length < 3) return false;
        const sorted = [...this.players].sort((a, b) => b.score - a.score);
        const topScore = sorted[0]?.score || 0;
        if (topScore <= 10) return false;
        const midIdx = Math.floor(sorted.length / 2);
        const bottomIds = sorted.slice(midIdx).map(p => p.id);
        return bottomIds.includes(playerId);
    }

    applyGameResult(resultPayload) {
        let globalMult = (this.currentEvent !== null) ? 2 : 1;
        const mutations = resultPayload.scoreMutations || [];
        let punishedPlayer = null;

        // Identifica vencedores reais desta rodada
        const winners = mutations.filter(m => (m.baseDelta || 0) > 0);
        const winnerIds = new Set(winners.map(w => w.playerId));

        // Sistema Wanted / Bounty: Verifica se havia alguém com Bounty ativo que foi abatido
        const currentWanted = this.players.find(p => p.isWanted);
        if (currentWanted && winners.length > 0 && !winnerIds.has(currentWanted.id)) {
            // Wanted foi abatido!
            const hunter = this.players.find(p => winnerIds.has(p.id));
            if (hunter) {
                const bountyReward = 20;
                hunter.score = (hunter.score || 0) + bountyReward;
                currentWanted.isWanted = false;
                currentWanted.streak = 0;
                window.playSound('wasted');
                window.vibrar(600);
                window.showBountyWastedBanner(hunter, currentWanted, bountyReward);
            }
        }

        // Aplica mutações de pontuação normais
        mutations.forEach(m => {
            const p = this.players.find(x => x.id === m.playerId);
            if (!p) return;
            let delta = (m.baseDelta || 0);
            if (delta > 0) {
                let pMult = globalMult;
                if (this.isUnderdog(p.id)) pMult *= 2; // Bônus Mario Kart 2x
                delta *= pMult;
            }
            p.score = Math.max(0, (p.score || 0) + delta);
            if (m.statImpDelta) p.stats.imp = (p.stats.imp || 0) + m.statImpDelta;
            if (m.statPrendDelta) p.stats.prend = (p.stats.prend || 0) + m.statPrendDelta;
            if (m.falhasDelta) {
                p.falhas = (p.falhas || 0) + m.falhasDelta;
                if (p.falhas >= 3) {
                    bus.emit('fx:juice', { type: 'crack' });
                    punishedPlayer = p;
                }
            }
        });

        // Atualiza streaks e marca novos Wanted (>= 2 vitórias seguidas)
        if (winners.length > 0) {
            this.players.forEach(p => {
                if (winnerIds.has(p.id)) {
                    p.streak = (p.streak || 0) + 1;
                    if (p.streak >= 2) {
                        p.isWanted = true;
                    }
                } else {
                    p.streak = 0;
                    p.isWanted = false;
                }
            });
        }

        this.save();
        if (this.tournamentMode) {
            this.tourneyCurrentRound++;
        }
        this.sessionRounds = (this.sessionRounds || 0) + 1;
        this.updateStreakBadge();
        window.renderPlayers();
        bus.emit('state:updated');

        if (punishedPlayer) {
            if (prendaTimerId) {
                clearTimeout(prendaTimerId);
                prendaTimerId = null;
            }
            prendaTimerId = setTimeout(() => {
                prendaTimerId = null;
                const activeScreen = document.querySelector('.screen.active');
                if (activeScreen && activeScreen.id === 'screen-result') {
                    appCore.dispararPrenda(punishedPlayer);
                }
            }, 1200);
        }
    }
}

const store = new GameStore();
window.GIW.store = store;

// ==========================================
// CENTRALIZAÇÃO DE ESTADO ÚNICO (HUB REATIVO)
// ==========================================
window.GIW.state = {
    get store() { return store; },
    get runner() { return window.GIW.runner; },
    get activeGame() { return window.GIW.runner?.activeGame || null; },
    get duo() {
        return {
            get state() { return typeof duoState !== 'undefined' ? duoState : {}; },
            get currentTab() { return typeof currentDuoTabKey !== 'undefined' ? currentDuoTabKey : 'skintone'; },
            get editingPlayerId() { return typeof editingPlayerId !== 'undefined' ? editingPlayerId : null; }
        };
    },
    get lobby() {
        return {
            get selectedSwap() { return typeof selectedSwap !== 'undefined' ? selectedSwap : null; }
        };
    },
    get currentScreen() {
        return document.querySelector('.screen.active')?.id || 'screen-home';
    },
    getSnapshot() {
        return {
            screen: this.currentScreen,
            store: {
                players: [...store.players],
                teams: store.teams,
                bench: store.bench,
                currentGameActive: store.currentGameActive,
                currentEvent: store.currentEvent,
                isMarioKart: store.isMarioKart,
                isChaos: store.isChaos,
                isRoles: store.isRoles,
                isEvents: store.isEvents,
                isSoundOn: store.isSoundOn,
                isVibOn: store.isVibOn,
                tourneyTarget: store.tourneyTarget,
                tournamentMode: store.tournamentMode,
                wantedPlayer: store.players.find(p => p.isWanted) || null
            },
            activeGame: this.activeGame ? {
                id: store.currentGameActive,
                phase: this.activeGame.phase || 'RUNNING',
                isPaused: window.GIW.runner?.isPaused ?? true,
                duration: window.GIW.runner?.stageDuration || 0,
                elapsed: window.GIW.runner?.stageElapsed || 0,
                remaining: window.GIW.runner ? Math.max(0, window.GIW.runner.stageDuration - window.GIW.runner.stageElapsed) : 0
            } : null
        };
    }
};
window.GIW.getState = () => window.GIW.state.getSnapshot();

// ==========================================
// 4. MOTOR DE ÁUDIO PROCEDURAL
// ==========================================
class AudioEngine {
    #ctx = null;
    #master = null;
    #filter = null;
    #compressor = null;
    #noiseBuffer = null;
    #tensionState = { lastTick: 0 };

    constructor() {
        bus.on('audio:play', p => this.#playSfx(p));
        bus.on('audio:filter', p => this.#setFilter(p));
        bus.on('audio:tension', p => this.#handleTension(p));
        bus.on('audio:tension_stop', () => this.#stopTension());

        const unlock = () => {
            this.#initCtx();
            ['click', 'touchstart', 'pointerdown'].forEach(ev => document.removeEventListener(ev, unlock));
        };
        ['click', 'touchstart', 'pointerdown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, passive: true }));
    }

    #handleTension({ remainingSec }) {
        if (!store.isSoundOn || remainingSec > 10 || remainingSec <= 0) return;
        const now = performance.now();
        const factor = Math.max(0.08, remainingSec / 10);
        const interval = 160 + (factor * 940); // 235ms até 1100ms
        
        if (now - this.#tensionState.lastTick >= interval) {
            this.#tensionState.lastTick = now;
            const pitch = 65 + ((1 - factor) * 45); // 65Hz a 110Hz
            // Lub-dub cardíaco procedural
            this.#tone({ type: 'sine', freq: pitch, fEnd: pitch - 28, dur: 0.11, vol: 0.75 + (1 - factor) * 0.25 });
            setTimeout(() => {
                this.#tone({ type: 'sine', freq: pitch * 0.85, fEnd: (pitch * 0.85) - 22, dur: 0.09, vol: 0.55 + (1 - factor) * 0.25 });
            }, 80);
            
            // Vibração tátil em rampa acelerada
            if (store.isVibOn && typeof navigator !== 'undefined' && navigator.vibrate) {
                const vibDur = Math.round(25 + ((1 - factor) * 45));
                try { navigator.vibrate([vibDur, 35, Math.round(vibDur * 0.6)]); } catch (_) {}
            }
        }
    }

    #stopTension() {
        this.#tensionState.lastTick = 0;
    }

    #initCtx() {
        if (this.#ctx) {
            if (this.#ctx.state === 'suspended') {
                this.#ctx.resume().catch(() => {});
            }
            return this.#ctx;
        }
        if (!store.isSoundOn) return null;

        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;

        this.#ctx = new AC();
        this.#master = this.#ctx.createGain();
        this.#master.gain.value = 0.85;

        this.#filter = this.#ctx.createBiquadFilter();
        this.#filter.type = 'lowpass';
        this.#filter.frequency.value = 22050;

        this.#compressor = this.#ctx.createDynamicsCompressor();
        this.#master.connect(this.#filter);
        this.#filter.connect(this.#compressor);
        this.#compressor.connect(this.#ctx.destination);

        return this.#ctx;
    }

    #setFilter({ mode, frequency, rampSec = 0.2 }) {
        if (!this.#ctx || !this.#filter) return;
        const t = this.#ctx.currentTime;
        const f = this.#filter.frequency;
        if (f.cancelScheduledValues) f.cancelScheduledValues(t);
        if (f.setValueAtTime) f.setValueAtTime(Math.max(20, f.value || 22050), t);

        if (mode === 'muffled') {
            f.exponentialRampToValueAtTime(frequency || 380, t + rampSec);
        } else if (mode === 'tension') {
            f.exponentialRampToValueAtTime(frequency || 1200, t + rampSec);
        } else {
            f.exponentialRampToValueAtTime(22050, t + rampSec);
        }
    }

    #tone({ type = 'sine', freq = 440, fEnd = null, dur = 0.2, vol = 0.8, ramp = 'exp' }) {
        const c = this.#initCtx();
        if (!c || !store.isSoundOn) return;
        const t = c.currentTime;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (fEnd) {
            if (ramp === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(10, fEnd), t + dur);
            else osc.frequency.linearRampToValueAtTime(fEnd, t + dur);
        }
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g);
        g.connect(this.#master);

        // Desconexão explícita para evitar vazamento de memória no grafo Web Audio
        osc.onended = () => {
            try {
                osc.disconnect();
                g.disconnect();
            } catch (_) {}
        };

        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    #noise({ dur = 0.3, vol = 0.5, f0 = 800, f1 = 80 }) {
        const c = this.#initCtx();
        if (!c || !store.isSoundOn) return;
        if (!this.#noiseBuffer) {
            const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            this.#noiseBuffer = buf;
        }
        const src = c.createBufferSource();
        src.buffer = this.#noiseBuffer;
        const flt = c.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(f0, c.currentTime);
        flt.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(vol, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + dur);
        src.connect(flt);
        flt.connect(g);
        g.connect(this.#master);

        // Desconexão explícita para evitar vazamento de nós de ruído
        src.onended = () => {
            try {
                src.disconnect();
                flt.disconnect();
                g.disconnect();
            } catch (_) {}
        };

        src.start(c.currentTime);
        src.stop(c.currentTime + dur);
    }

    #playSfx({ sfx, highTone }) {
        if (!store.isSoundOn) return;
        switch (sfx) {
            case 'click':
                this.#tone({ type: 'sine', freq: 720, fEnd: 280, dur: 0.035, vol: 0.28 });
                break;
            case 'pop':
                this.#tone({ type: 'sine', freq: 320, fEnd: 780, dur: 0.055, vol: 0.35 });
                break;
            case 'nav':
                this.#tone({ type: 'sine', freq: 523.25, dur: 0.06, vol: 0.18 });
                setTimeout(() => this.#tone({ type: 'sine', freq: 659.25, dur: 0.08, vol: 0.2 }), 45);
                break;
            case 'coin':
            case 'points':
                this.#tone({ type: 'sine', freq: 987.77, dur: 0.08, vol: 0.4 });
                setTimeout(() => this.#tone({ type: 'sine', freq: 1318.51, dur: 0.22, vol: 0.45 }), 75);
                break;
            case 'victory':
                [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
                    setTimeout(() => this.#tone({ type: 'triangle', freq: f, dur: 0.12, vol: 0.38 }), idx * 65);
                });
                break;
            case 'error':
            case 'fail':
                this.#tone({ type: 'sawtooth', freq: 240, fEnd: 160, dur: 0.18, vol: 0.35, ramp: 'lin' });
                setTimeout(() => this.#tone({ type: 'sawtooth', freq: 190, fEnd: 120, dur: 0.22, vol: 0.35, ramp: 'lin' }), 100);
                break;
            case 'tick':
                this.#tone({ type: 'square', freq: 1400, dur: 0.015, vol: 0.25 });
                break;
            case 'toggle_on':
                this.#tone({ type: 'sine', freq: 440, fEnd: 880, dur: 0.07, vol: 0.32 });
                break;
            case 'toggle_off':
                this.#tone({ type: 'sine', freq: 660, fEnd: 330, dur: 0.07, vol: 0.28 });
                break;
            case 'whoosh':
                this.#noise({ dur: 0.16, vol: 0.22, f0: 1200, f1: 300 });
                break;
            case 'card_lift':
                this.#tone({ type: 'sine', freq: 360, fEnd: 740, dur: 0.1, vol: 0.28 });
                this.#noise({ dur: 0.08, vol: 0.1, f0: 900, f1: 300 });
                break;
            case 'card_snap':
                this.#tone({ type: 'triangle', freq: 240, fEnd: 80, dur: 0.07, vol: 0.3 });
                this.#noise({ dur: 0.05, vol: 0.12, f0: 600, f1: 120 });
                break;
            case 'beep':
                this.#tone({ type: 'sine', freq: highTone ? 1200 : 800, dur: 0.1, vol: 0.7 });
                break;
            case 'kaboom':
                this.#tone({ type: 'square', freq: 120, fEnd: 20, dur: 0.5, vol: 0.9 });
                this.#noise({ dur: 0.5, vol: 0.7, f0: 1000, f1: 60 });
                break;
            case 'heartbeat':
                this.#tone({ type: 'sine', freq: 65, fEnd: 35, dur: 0.25, vol: 0.9 });
                setTimeout(() => this.#tone({ type: 'sine', freq: 55, fEnd: 30, dur: 0.2, vol: 0.6 }), 160);
                break;
            case 'siren':
                this.#tone({ type: 'triangle', freq: 600, fEnd: 1200, dur: 0.4, vol: 0.8, ramp: 'lin' });
                setTimeout(() => this.#tone({ type: 'triangle', freq: 1200, fEnd: 600, dur: 0.4, vol: 0.8, ramp: 'lin' }), 400);
                break;
            case 'badum':
                this.#tone({ type: 'square', freq: 150, fEnd: 40, dur: 0.2, vol: 0.8 });
                setTimeout(() => this.#tone({ type: 'square', freq: 180, fEnd: 30, dur: 0.3, vol: 0.9 }), 220);
                break;
            case 'cricket':
                this.#tone({ type: 'sawtooth', freq: 3000, dur: 0.08, vol: 0.2, ramp: 'lin' });
                setTimeout(() => this.#tone({ type: 'sawtooth', freq: 3000, dur: 0.08, vol: 0.2, ramp: 'lin' }), 120);
                break;
            case 'applause':
                this.#noise({ dur: 0.8, vol: 0.4, f0: 2000, f1: 500 });
                break;
            case 'typewriter':
                this.#tone({ type: 'square', freq: 1600, dur: 0.04, vol: 0.25 });
                break;
            case 'scan':
                this.#tone({ type: 'sine', freq: 2200, dur: 0.08, vol: 0.15 });
                break;
            case 'glitch':
                this.#tone({ type: 'sawtooth', freq: 120, fEnd: 850, dur: 0.18, vol: 0.6, ramp: 'lin' });
                this.#noise({ dur: 0.15, vol: 0.3, f0: 3000, f1: 800 });
                break;
            case 'success':
                this.#tone({ type: 'sine', freq: 600, dur: 0.1, vol: 0.6 });
                setTimeout(() => this.#tone({ type: 'sine', freq: 850, dur: 0.1, vol: 0.7 }), 90);
                setTimeout(() => this.#tone({ type: 'sine', freq: 1200, dur: 0.3, vol: 0.8 }), 180);
                break;
            case 'wasted':
                this.#tone({ type: 'square', freq: 95, fEnd: 22, dur: 0.85, vol: 0.95 });
                this.#noise({ dur: 0.6, vol: 0.5, f0: 1200, f1: 40 });
                setTimeout(() => this.#tone({ type: 'sawtooth', freq: 45, fEnd: 18, dur: 0.6, vol: 0.8 }), 120);
                break;
            case 'voice':
                const base = Math.max(160, Math.min(850, highTone || 340));
                const sCount = 4 + Math.floor(Math.random() * 3);
                for (let i = 0; i < sCount; i++) {
                    const stepPitch = base * (0.85 + Math.random() * 0.4);
                    setTimeout(() => {
                        this.#tone({ type: 'triangle', freq: stepPitch, dur: 0.055, vol: 0.42 });
                    }, i * 65);
                }
                break;
        }
    }
}
const audioEngine = new AudioEngine();

// ==========================================
// 5. JUICE MANAGER (SHAKE & FLASH)
// ==========================================
class JuiceManager {
    constructor() {
        bus.on('fx:juice', p => this.#handleJuice(p));
        bus.on('fx:screenshake', p => this.#handleShake(p));
        bus.on('haptics:trigger', p => this.#handleHaptics(p));
    }

    #handleJuice({ type, color, particleCount = 150 }) {
        if (type === 'confetti') {
            if (typeof window.confetti === 'function') {
                window.confetti({ particleCount, spread: 80, origin: { y: 0.6 }, colors: color || ['#ffd600', '#00e5ff', '#ff2a85', '#00e676'] });
            }
        } else if (type === 'flash') {
            const el = document.getElementById('flash-overlay');
            if (el) {
                el.style.backgroundColor = color || '#ffffff';
                if (typeof window.gsap !== 'undefined') {
                    window.gsap.fromTo(el, { opacity: 0.85 }, { opacity: 0, duration: 0.4, ease: 'power2.out' });
                }
            }
        } else if (type === 'crack') {
            const el = document.getElementById('glass-crack');
            if (el) {
                el.style.display = 'block';
                el.style.opacity = '1';
                setTimeout(() => {
                    if (typeof window.gsap !== 'undefined') {
                        window.gsap.to(el, { opacity: 0, duration: 0.8, onComplete: () => el.style.display = 'none' });
                    } else {
                        el.style.display = 'none';
                    }
                }, 1800);
            }
        }
    }

    #handleShake({ intensity = 'medium', durationMs = 400 }) {
        const root = document.querySelector('.screen.active') || document.body;
        if (!root) return;
        const amp = intensity === 'heavy' ? 14 : intensity === 'low' ? 4 : 8;
        if (typeof window.gsap !== 'undefined') {
            window.gsap.fromTo(root, 
                { x: -amp, rotation: -0.8 }, 
                { x: amp, rotation: 0.8, duration: 0.05, repeat: Math.floor(durationMs / 50), yoyo: true, ease: 'none', onComplete: () => {
                    window.gsap.set(root, { x: 0, rotation: 0 });
                }}
            );
        } else {
            root.classList.add('shake-camera');
            setTimeout(() => root.classList.remove('shake-camera'), durationMs);
        }
    }

    #handleHaptics({ preset, pattern }) {
        if (!store.isVibOn || !navigator.vibrate) return;
        const ms = pattern || (preset === 'tap' ? 40 : preset === 'explosion' ? 700 : 120);
        try { navigator.vibrate(ms); } catch (_) {}
    }
}
const juiceManager = new JuiceManager();

// ==========================================
// 6. DICIONÁRIOS, REGRAS & GUIAS OFICIAIS
// ==========================================
window.gameCatalog = [
    { id: 'impostor', title: 'O Impostor', icon: '🕵️', catName: 'Estratégia & Blefe', catKey: 'strategy', min: 3, badge: 'Caça & Blefe', hook: 'Descubra quem não sabe a palavra secreta antes que a mesa seja enganada!' },
    { id: 'duplas', title: 'Duplas', icon: '👯', catName: 'Estratégia & Pares', catKey: 'strategy', min: 5, badge: 'Pares Secretos', hook: 'Ache seu par secreto sem entregar a palavra ao Infiltrado Solitário!' },
    { id: 'macabro', title: 'Mistérios', icon: '🔪', catName: 'Estratégia & Enigmas', catKey: 'strategy', min: 2, badge: 'Dark Stories', hook: 'Desvende o mistério bizarro fazendo perguntas de Sim ou Não ao narrador!' },
    
    { id: 'posicao', title: 'Posições', icon: '📈', catName: 'Sintonia Mental', catKey: 'mind', min: 3, badge: 'Escala 1 a 10', hook: 'Ordene as cartas da mesa na escala de 1 a 10 sem falar números!' },
    { id: 'nota', title: 'A Nota', icon: '🎯', catName: 'Sintonia Mental', catKey: 'mind', min: 2, badge: 'Sintonia em Dupla', hook: 'Segure para ver a nota e calibre a sintonia da sua dupla com perguntas temáticas!' },
    { id: 'unica', title: 'Única Palavra', icon: '💡', catName: 'Sintonia Mental', catKey: 'mind', min: 3, badge: 'Anulação de Iguais', hook: 'Dicas repetidas são ANULADAS! Ajude o adivinhador com pistas únicas!' },
    { id: 'quemsoueu', title: 'Quem Sou Eu', icon: '🤔', catName: 'Sintonia Mental', catKey: 'mind', min: 4, badge: 'Celular na Mesa', hook: 'Celular deitado na mesa! Corrida frenética entre duplas respondendo apenas entre si!' },

    { id: 'megasenha', title: 'Mega Senha', icon: '🗣️', catName: 'Competição de Equipes', catKey: 'team', min: 4, badge: '1 Palavra por Dica', hook: 'Duelo de 5 senhas: dê 1 palavra por vez até sua equipe acertar primeiro!' },
    { id: 'completa', title: 'Completa', icon: '🧩', catName: 'Competição de Equipes', catKey: 'team', min: 3, badge: 'Speedrun de 40s', hook: 'Dois jogadores alternam palavras, gritam COMPLETA e o parceiro responde em 40s!' },
    { id: 'mimica', title: 'Mímica', icon: '🤹', catName: 'Competição de Equipes', catKey: 'team', min: 2, badge: 'Ação Sem Sons', hook: 'Escolha a dificuldade da carta (Fácil, Média, Difícil) e atue sem emitir sons!' },

    { id: 'stop', title: 'Stop de Roda', icon: '🛑', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Letra Rápida', hook: 'O tempo diminui a cada palavra falada! Quem travar é eliminado da roda!' },
    { id: 'sevira', title: 'Se Vira', icon: '⏱️', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Pavio Curto', hook: 'A bomba acelera a cada eliminado! Fale um item, passe o celular e sobreviva!' },
    { id: 'cinco', title: '5 Segundos', icon: '✋', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Diga 3 Coisas', hook: 'Parece fácil... até você ter que falar 3 coisas no ritmo dos 5 bipes sonoros!' },
    { id: 'batata', title: 'Batata Quente', icon: '💣', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 3, badge: 'Sensor de Tremor', hook: 'Passe com cuidado extremo: trepidações e tempo secreto detonam a bomba!' },
    { id: 'ultimo', title: 'Último a Falar', icon: '☠️', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Eliminação Súbita', hook: 'Contagem 3, 2, 1... Tema surpresa na tela! Quem falar por último é eliminado!' }
];

appCore.currentHomeFilter = 'all';

appCore.setHomeFilter = function(catKey, btnEl) {
    appCore.currentHomeFilter = catKey;
    window.hapticTap();
    window.playSound('pop');

    const pills = document.querySelectorAll('.home-filter-bar .filter-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    appCore.renderHomeGrid();
};

appCore.renderHomeGrid = function() {
    const grid = document.getElementById('home-games-grid');
    if (!grid) return;

    let list = window.gameCatalog || [];
    if (appCore.currentHomeFilter !== 'all') {
        list = list.filter(g => g.catKey === appCore.currentHomeFilter);
    }

    grid.innerHTML = list.map(g => `
        <div class="game-grid-card cat-${g.catKey}" onclick="appCore.openGameLobby('${g.id}')">
            <div class="game-grid-top">
                <div class="game-grid-icon-box">${g.icon}</div>
                <div class="game-grid-min-badge">Mín ${g.min}</div>
            </div>
            <div>
                <div class="game-grid-title">${g.title}</div>
                <div class="game-grid-tag">${g.badge}</div>
            </div>
        </div>
    `).join('');

    if (typeof window.gsap !== 'undefined') {
        window.gsap.fromTo('.game-grid-card', 
            { opacity: 0, y: 8 }, 
            { opacity: 1, y: 0, duration: 0.22, stagger: 0.02, ease: 'power2.out' }
        );
    }
};

// Aliases para compatibilidade caso chamados em algum fluxo legado
appCore.showcaseIdx = 0;
appCore.renderShowcaseCard = function() { appCore.renderHomeGrid(); };
appCore.showcaseNav = function() {};
appCore.jumpToShowcase = function() {};
appCore.bindShowcaseGestures = function() {};

appCore.abrirCatalogoCompleto = function() {
    window.hapticTap();
    window.playSound('pop');
    appCore.renderCatalogList('all');
    appCore.openModal('catalog-modal');
};

appCore.filtrarCatalogo = function(cat, btnEl) {
    window.hapticTap();
    window.playSound('pop');
    const chips = document.querySelectorAll('.catalog-filter-bar .chip');
    chips.forEach(c => c.classList.remove('on'));
    if (btnEl) btnEl.classList.add('on');
    appCore.renderCatalogList(cat);
};

appCore.renderCatalogList = function(category = 'all') {
    const container = document.getElementById('catalog-list');
    if (!container) return;

    let items = window.gameCatalog || [];
    if (category !== 'all') {
        items = items.filter(g => g.catKey === category);
    }

    container.innerHTML = items.map(g => `
        <div class="catalog-item-row" onclick="appCore.closeModal('catalog-modal'); appCore.openGameLobby('${g.id}');">
            <div class="catalog-row-left">
                <div class="catalog-row-icon cat-${g.catKey}" style="background:var(--bg-surface);">${g.icon}</div>
                <div>
                    <h4 class="catalog-row-title">${g.title}</h4>
                    <span class="catalog-row-meta">Mín ${g.min} Jogadores • ${g.badge}</span>
                </div>
            </div>
            <div class="catalog-row-cta">JOGAR ➔</div>
        </div>
    `).join('');
};

window.gameTitles = {
    impostor: 'O Impostor', duplas: 'Duplas', macabro: 'Mistérios',
    posicao: 'Posições', nota: 'A Nota', unica: 'Única Palavra', quemsoueu: 'Quem Sou Eu',
    megasenha: 'Mega Senha', completa: 'Completa', mimica: 'Mímica', stop: 'Stop de Roda',
    sevira: 'Se Vira', cinco: '5 Segundos', batata: 'Batata Quente', ultimo: 'Último a Falar'
};

window.gameGuides = {
    impostor: {
        icon: '🕵️',
        minPlayers: 'Mín 3',
        tagline: 'Descubra quem não sabe a palavra secreta antes da votação!',
        steps: [
            { title: 'Palavra Secreta', desc: 'Todos veem a palavra secreta na tela, menos o Impostor.' },
            { title: 'Perguntas na Mesa', desc: 'Façam perguntas em roda para testar quem sabe sem entregar a palavra.' },
            { title: 'Votação', desc: 'Votem em quem acham que é o Impostor. Inocentes vencem se acertarem!' }
        ]
    },
    duplas: {
        icon: '👯',
        minPlayers: 'Mín 5',
        tagline: 'Encontre seu par secreto sem entregar sua palavra ao infiltrado!',
        steps: [
            { title: 'Pares Secretos', desc: 'Cada um recebe uma palavra que faz par com a de outro jogador. Um fica avulso!' },
            { title: 'Dicas Indiretas', desc: 'Conversem na mesa para achar seu par sem falar a palavra abertamente.' },
            { title: 'Votação', desc: 'Descubram e eliminem quem ficou sem par antes que ele descubra as duplas.' }
        ]
    },
    macabro: {
        icon: '🔪',
        minPlayers: 'Mín 2',
        tagline: 'Desvende o mistério bizarro fazendo perguntas de Sim ou Não ao narrador!',
        steps: [
            { title: 'O Mistério', desc: 'O narrador lê o caso em voz alta e segura o botão para ver a resposta secreta.' },
            { title: 'Perguntas', desc: 'A mesa faz perguntas livres e o narrador responde apenas Sim, Não ou Irrelevante.' },
            { title: 'Desvendar', desc: 'Reconstruam a história completa juntos para pontuar!' }
        ]
    },
    posicao: {
        icon: '📈',
        minPlayers: 'Mín 3',
        tagline: 'Organize as posições de 1 a 10 apenas com dicas de intensidade!',
        steps: [
            { title: 'Número Secreto', desc: 'Cada um recebe um número de 1 a 10 sobre o tema sorteado.' },
            { title: 'Dicas de Intensidade', desc: 'Deem dicas orais da intensidade do número (sem falar algarismos!).' },
            { title: 'Organizar', desc: 'Coloquem na ordem do menor para o maior e confiram o gabarito.' }
        ]
    },
    nota: {
        icon: '🎯',
        minPlayers: 'Mín 2 (Dupla)',
        tagline: 'Segure para ver a nota secreta e calibre a sintonia da dupla!',
        steps: [
            { title: 'Nota Secreta', desc: 'Um jogador segura a tela para ver a nota de 1 a 10 em segredo.' },
            { title: 'Calibração', desc: 'O parceiro faz perguntas temáticas para calibrar a intensidade.' },
            { title: 'Chute', desc: 'O parceiro chuta o valor no seletor. Se acertar em cheio, ganham ponto!' }
        ]
    },
    unica: {
        icon: '💡',
        minPlayers: 'Mín 3',
        tagline: 'Dicas repetidas são apagadas! Seja criativo para ajudar o adivinhador.',
        steps: [
            { title: 'Olhos Fechados', desc: 'O adivinhador fecha os olhos enquanto o celular passa na roda.' },
            { title: 'Uma Dica Cada', desc: 'Cada um digita 1 palavra de dica. Dicas repetidas são apagadas pelo jogo!' },
            { title: 'Adivinhar', desc: 'O adivinhador tenta acertar a palavra usando apenas as pistas que sobraram.' }
        ]
    },
    quemsoueu: {
        icon: '🤔',
        minPlayers: 'Mín 4 (2 Duplas)',
        tagline: 'Celular deitado na mesa! Perguntem e respondam ao mesmo tempo.',
        steps: [
            { title: 'Celular na Mesa', desc: 'Deitem o celular na mesa entre as duas duplas.' },
            { title: 'Perguntas Simultâneas', desc: 'As duas duplas jogam ao mesmo tempo, fazendo perguntas de Sim ou Não.' },
            { title: 'Bater e Vencer', desc: 'A primeira dupla a adivinhar bate no botão e vence a rodada!' }
        ]
    },
    megasenha: {
        icon: '🗣️',
        minPlayers: 'Mín 4 (2 Duplas)',
        tagline: 'Duelo de senhas: dê 1 palavra de pista por vez até alguém acertar!',
        steps: [
            { title: 'Senha na Tela', desc: 'Os oradores dos dois times leem a mesma senha secreta.' },
            { title: 'Uma Palavra por Vez', desc: 'Os times alternam dando 1 palavra de pista por tentativa.' },
            { title: 'Ponto Rápido', desc: 'Quem acertar primeiro ganha a senha. Disputem a melhor de 5!' }
        ]
    },
    completa: {
        icon: '🧩',
        minPlayers: 'Mín 3',
        tagline: 'Speedrun de 40s! Alternem palavras, gritem COMPLETA e adivinhem!',
        steps: [
            { title: 'Tempo Correndo', desc: 'O cronômetro de 40s começa a correr na tela.' },
            { title: 'Pista em Dupla', desc: 'Dois jogadores alternam palavras e gritam COMPLETA quando estiver pronto.' },
            { title: 'Resposta Imediata', desc: 'O terceiro jogador responde na hora para abrir a próxima carta!' }
        ]
    },
    mimica: {
        icon: '🤹',
        minPlayers: 'Mín 2',
        tagline: 'Escolha o risco da carta e atue sem som; quem acertar ganha bônus!',
        steps: [
            { title: 'Escolha do Risco', desc: 'O ator escolhe uma carta Fácil, Média ou Difícil na tela.' },
            { title: 'Mímica Silenciosa', desc: 'Faça os gestos sem emitir nenhum som enquanto a mesa tenta adivinhar.' },
            { title: 'Pontuação', desc: 'O ator ganha os pontos da carta e quem acertou ganha bônus!' }
        ]
    },
    stop: {
        icon: '🛑',
        minPlayers: 'Mín 2',
        tagline: 'O tempo encurta a cada acerto! Quem travar é eliminado da rodada.',
        steps: [
            { title: 'Letra e Tema', desc: 'Fale rápido uma palavra do tema sorteado com a letra indicada.' },
            { title: 'Trocar Letra', desc: 'Toque no botão para passar a vez e resetar o relógio.' },
            { title: 'Sobrevivência', desc: 'Quem deixar o relógio zerar sai da rodada. Vence o último a sobrar!' }
        ]
    },
    sevira: {
        icon: '⏱️',
        minPlayers: 'Mín 2',
        tagline: 'A bomba está correndo na roda! Fale um item, passe e sobreviva.',
        steps: [
            { title: 'Bomba na Mão', desc: 'Fale um item da categoria sorteada e passe o celular imediatamente.' },
            { title: 'Toque para Passar', desc: 'Toque no botão para passar a bomba para o próximo jogador.' },
            { title: 'Sobreviva', desc: 'Quem estiver com o celular quando a bomba explodir é eliminado!' }
        ]
    },
    cinco: {
        icon: '✋',
        minPlayers: 'Mín 2',
        tagline: 'Fale 3 itens do tema em exatos 5 segundos antes do alarme soar!',
        steps: [
            { title: 'Desafio na Tela', desc: 'Aparece um desafio como: Diga 3 marcas de carro.' },
            { title: 'Cinco Segundos', desc: 'Toque em iniciar e fale os 3 itens antes dos 5 bipes acabarem.' },
            { title: 'Mesa Decide', desc: 'A roda valida se as 3 respostas foram corretas a tempo.' }
        ]
    },
    batata: {
        icon: '💣',
        minPlayers: 'Mín 3',
        tagline: 'Passe suave! Qualquer movimento brusco detona a bomba na hora.',
        steps: [
            { title: 'Movimento Suave', desc: 'Passe o celular com máximo cuidado e calma na roda.' },
            { title: 'Sensor de Tremor', desc: 'Qualquer movimento brusco ou sacudida explode a bomba na hora!' },
            { title: 'Tempo Surpresa', desc: 'O tempo de explosão é secreto. Sobreviva até o fim da rodada!' }
        ]
    },
    ultimo: {
        icon: '☠️',
        minPlayers: 'Mín 2',
        tagline: 'Contagem 3, 2, 1... Tema surpresa na tela! Quem falar por último sai.',
        steps: [
            { title: 'Contagem Surpresa', desc: 'Contagem 3, 2, 1... e o tema surge de repente na tela!' },
            { title: 'Falar Rápido', desc: 'Todos na roda devem falar um item do tema em voz alta o mais rápido possível.' },
            { title: 'Eliminação', desc: 'Quem hesitar, travar ou falar por último é eliminado!' }
        ]
    }
};

window.gameInstructions = {
    impostor: "Inocentes recebem tema e palavra secreta. O Impostor recebe só o tema e NÃO sabe a palavra! Debatam, façam perguntas indiretas e votem no suspeito.",
    duplas: "Jogadores formam pares secretos com a mesma palavra. Há 1 Infiltrado na mesa. Ache sua dupla sem entregar a palavra ao infiltrado!",
    macabro: "O Narrador lê o enigma misterioso. A mesa faz perguntas de 'Sim', 'Não' ou 'Irrelevante' até desvendar a história completa.",
    posicao: "Todos recebem secretamente números de 1 a 10 para uma escala temática. Sem falar números, deem dicas e organizem as cartas na ordem crescente correta!",
    nota: "O jogador vê secretamente uma nota de 1 a 10 e a esconde. Dá uma dica verbal daquela intensidade e o parceiro chuta o número no seletor!",
    unica: "O Adivinhador fecha os olhos. Todos digitam 1 palavra de dica no celular. Dicas repetidas são ANULADAS automaticamente pelo jogo!",
    quemsoueu: "Celular deitado na mesa! As duas duplas jogam ao mesmo tempo, fazendo perguntas de Sim ou Não para acertar a palavra secreta antes dos rivais.",
    megasenha: "Em duplas: um jogador dá dicas de 1 única palavra e o parceiro tenta acertar a senha antes que o relógio zere.",
    completa: "Painel com 8 palavras do tema. A equipe dá dicas e tenta abrir todas as 8 caixas antes do cronômetro zerar.",
    mimica: "Um jogador faz mímica para a equipe adivinhar a ação ou personagem. Sons são terminantemente proibidos!",
    stop: "Sorteia Tema + Letra com timer rápido de 10s. Quem falar uma palavra válida toca no botão para trocar a letra e resetar o tempo!",
    sevira: "A bomba vai estourar! Fale um item da categoria exibida e passe o celular rápido para a próxima pessoa da roda.",
    cinco: "A tela mostra 'Diga 3...'. Ao disparar, você tem exatos 5 Segundos para falar tudo sem gaguejar!",
    batata: "Passe o celular com cuidado! O tempo é surpresa e qualquer movimento brusco faz o sensor de aceleração explodir a bomba!",
    ultimo: "Tema livre na tela com contagem rápida. A mesa vai falando itens em roda. Quem demorar, travar ou repetir é eliminado!"
};

window.categoriasIniciais = {
    'Animais': ['Leão','Tigre','Elefante','Cachorro','Gato','Girafa','Crocodilo','Águia','Pinguim','Urso','Lobo','Tartaruga','Cobra','Sapo','Baleia','Tubarão','Gorila','Capivara','Macaco','Panda','Camelo','Golfinho','Zebra','Hipopótamo','Gavião','Morcego','Chimpanzé','Tamanduá','Arara','Polvo','Lontra','Lhama'],
    'Comida': ['Pizza','Hambúrguer','Sushi','Lasanha','Salada','Sorvete','Churrasco','Bolo','Pastel','Macarronada','Feijoada','Taco','Batata Frita','Chocolate','Coxinha','Pão de Queijo','Açaí','Brigadeiro','Estrogonofe','Moqueca','Tapioca','Pipoca Doce','Churros','Fondue','Esfiha','Empadão'],
    'Famosos': ['Silvio Santos','Anitta','Michael Jackson','Neymar','Rihanna','Will Smith','Beyoncé','Leonardo DiCaprio','Tom Cruise','Faustão','Xuxa','Ivete Sangalo','Keanu Reeves','Cristiano Ronaldo','Messi','Zeca Pagodinho','Casimiro','Ludmilla','Marília Mendonça','Alok','Whindersson Nunes','Bruna Marquezine'],
    'Ciências': ['Tabela Periódica','Átomo','Laboratório','Reação','Microscópio','DNA','Molécula','Ácido','Gravidade','Fóssil','Buraco Negro','Telescópio','Velocidade da Luz','Termodinâmica','Bactéria','Supernova','Clonagem','Eletromagnetismo','Fotossíntese','Fissão Nuclear'],
    'Cinema & TV': ['Pipoca','Oscar','Diretor','Bilheteria','Tela Grande','Vilão','Super-Herói','Dublê','Roteiro','Trilha Sonora','Zumbi','Câmera','Efeitos Especiais','Dublagem','Figurino','Claquete','Cena Pós-Créditos','Trailer','Festival de Cannes','Casting'],
    'Lugares': ['Hospital','Cassino','Submarino','Estação Espacial','Circo','Aeroporto','Navio Pirata','Escola','Restaurante','Prisão','Museu Assombrado','Farol Abandonado','Parque de Diversões','Ilha Deserta','Banco Central','Boate Subterrânea','Hotel Fazenda','Bunker Nuclear'],
    'Profissões Inusitadas': ['Astronauta','Domador de Leão','Detetive Particular','Influencer Falido','Sommelier de Água','Dublê de Ação','Paparazzi','Pipoqueiro de Circo','Arqueólogo','Papai Noel de Shopping','Piloto de Fuga','Crítico Gastronômico','Caçador de Fantasmas','Instrutor de Yoga','Testador de Colchão'],
    'Cultura Pop & Memes': ['Casimiro','Luva de Pedreiro','Gretchen','Nazaré Confusa','Bambam','Manoel Gomes','Caneta Azul','Vira-Lata Caramelo','Tiringa','Choque de Cultura','Galo Cego','Grávida de Taubaté','Bora Bill','Patati Patatá','Inês Brasil'],
    'Perrengues do Cotidiano': ['Bateria em 1%','Chave Trancada pra Dentro','Boleto Vencido','Pneu Furado na Chuva','Água Acabou no Banho','Esquecer o Nome da Pessoa','Comida Queimando','Salto Quebrado','Mensagem pro Grupo Errado','Cartão Recusado','Fila do Banco','Ficar Preso no Elevador']
};

window.caosWords = [
    'Motel', 'Preservativo', 'Ressaca', 'Gemido', 'Traição', 'Calcinha', 'Cabaré', 'Algemas', 'Orgia', 
    'Tatuagem Íntima', 'OnlyFans', 'Cerveja', 'Tinder', 'Nude', 'Ex-Namorado(a)', 'Chifre', 'Banho a Dois', 
    'Selinho Roubado', 'Garganta Seca', 'Striptease', 'Fetiche Estranho', 'Crush Secreto', 'Censurado', 
    'Madrugada Insana', 'Boca Suja', 'Gemidão do Zap', 'Perder a Linha', 'Chupão no Pescoço', 'Noite em Vegas'
];

window.prendasLista = [
    { t: "Falar com Sotaque", d: "Fale com sotaque francês ou caipira até o final da próxima rodada!" },
    { t: "Cantar uma Canção", d: "Cante o refrão de uma música infantil como se fosse um cantor de ópera!" },
    { t: "Foto da Galeria", d: "Mostre a última foto da sua galeria do celular para a mesa!" },
    { t: "Elogio Constrangedor", d: "Faça um elogio poético e super dramático para quem estiver à sua direita!" },
    { t: "Mímica Secreta", d: "Imite uma galinha chocando um ovo por 10 segundos sem rir!" },
    { t: "10 Polichinelos", d: "Levante agora e pague 10 polichinelos gritando 'Eu sou uma lenda!'." },
    { t: "Declaração Dramática", d: "Declare seu amor eterno para o copo ou garrafa mais próxima como se fosse Romeu e Julieta!" },
    { t: "Narrador de Novela", d: "Narre os próximos 2 minutos da partida com a voz e o suspense de uma novela mexicana!" },
    { t: "Telejornal Sensacionalista", d: "Anuncie a pontuação do líder da mesa com a voz estridente de um plantão policial urgente!" },
    { t: "Sem Piscar", d: "Olhe fixamente nos olhos do jogador da sua frente por 20 segundos sem piscar nem rir!" },
    { t: "Robô em Curto", d: "Fale com voz e movimentos de robô engasgado até a sua próxima rodada começar!" },
    { t: "Dancinha de TikTok", d: "Invente e execute uma dancinha ridícula de 10 segundos sem nenhuma música de fundo!" },
    { t: "Garçom da Mesa", d: "Sirva um copo de água ou bebida com elegância máxima para os 2 jogadores com mais pontos!" },
    { t: "Imitação de Celebridade", d: "Imite o Silvio Santos ('Maaah vem pra cá!') ou Faustão ('Ô loco bicho!') durante sua próxima fala!" },
    { t: "Apresentador de TV", d: "Tente vender um guardanapo amassado para a mesa como se fosse um item de luxo indispensável!" },
    { t: "Rima Relâmpago", d: "Crie uma rima improvisada com o nome de pelo menos 3 pessoas da mesa em menos de 20 segundos!" },
    { t: "Língua Presa", d: "Fale com a língua presa entre os dentes pelos próximos 45 segundos!" },
    { t: "Pedir Bênção", d: "Aperte solenemente a mão de todos na mesa dizendo 'Que a sua vitória seja humilde, mestre'!" },
    { t: "Estátua Grega", d: "Faça a pose mais dramática e épica que puder e fique congelado(a) por 25 segundos!" },
    { t: "Câmera Lenta", d: "Todos os seus movimentos e falas no próximo minuto devem ser em câmera ultra lenta!" },
    { t: "Desabafo de Vencedor", d: "Faça um discurso de agradecimento emocionado como se tivesse acabado de ganhar o Oscar!" },
    { t: "Personal Trainer", d: "Grite um bordão motivacional militar no ouvido de quem estiver em último lugar no placar!" },
    { t: "Palmas Solenes", d: "Puxe uma salva de palmas lenta e solene em homenagem ao líder atual da partida!" },
    { t: "Rir de Nada", d: "Dê uma gargalhada maquiavélica de vilão de filme por 10 segundos sem parar!" }
];

window.prendasCaos = [
    { t: "Mande um Áudio", d: "Mande um áudio no grupo da família rindo igual a uma hiena por 5 segundos!" },
    { t: "Verdade ou Mico", d: "Revele qual foi a mensagem mais constrangedora que você mandou essa semana!" },
    { t: "Estátua Humana", d: "Fique na pose mais ridícula possível até a sua vez chegar no próximo jogo!" },
    { t: "História Secreta", d: "Conte o maior mico que você já passou com bebida ou na frente de um crush!" },
    { t: "Mensagem Misteriosa", d: "Mande 'Precisamos conversar urgente...' no WhatsApp de algum amigo aleatório e mostre a tela!" },
    { t: "Foto de Papel de Parede", d: "Tire uma selfie com careta ridícula e coloque como tela de bloqueio do celular por 10 minutos!" },
    { t: "Revelação do Crush", d: "Revele qual celebridade ou figura pública você secretamente pegaria sem pensar duas vezes!" },
    { t: "Áudio Apaixonado", d: "Grave um áudio de 5 segundos cantando o refrão de 'Evidências' no grupo de amigos!" },
    { t: "Storie Enigmático", d: "Poste a foto de um garfo ou copo vazio no Instagram com a legenda 'Finalmente encontrei a paz'!" },
    { t: "Histórico de Busca", d: "Abra o Google no celular e leia em voz alta as últimas 3 coisas pesquisadas no histórico!" },
    { t: "Fetiche Curioso", d: "Revele uma mania ou hábito estranho que você tem quando fica completamente sozinho em casa!" },
    { t: "Dança da Vergonha", d: "Dance um trecho de axé dos anos 90 pulando de um pé só por 15 segundos!" },
    { t: "Gole Duplo de Honra", d: "Beba um gole duplo da sua bebida ou tome uma colher de mostarda/ketchup da cozinha!" },
    { t: "Chamada Relâmpago", d: "Ligue para um contato aleatório escolhido pela mesa, deixe tocar duas vezes e desligue!" },
    { t: "Confissão de Infância", d: "Conte a maior mentira que você sustentou pros seus pais quando era criança!" }
];

// ==========================================
// 7. DUOLINGO AVATAR ENGINE (OFFICIAL ASSETS & RENDERER)
// ==========================================
const DUO_CDN_RENDER = 'https://d3gq3s1iyyx31w.cloudfront.net/static/render/bg';
const DUO_STATIC_BASE = 'https://avatars.duolingo.com/avatar-builder';

const duoColorPalettes = {
    SkinTone: [
        { id: 1, hex: '#fde6d1' }, { id: 2, hex: '#fed5b1' }, { id: 3, hex: '#f4c69e' },
        { id: 4, hex: '#e9b185' }, { id: 5, hex: '#d89a6c' }, { id: 6, hex: '#bb7e55' },
        { id: 7, hex: '#9a6241' }, { id: 8, hex: '#7a4931' }, { id: 9, hex: '#5a3224' },
        { id: 10, hex: '#f6aeab' }, { id: 11, hex: '#e69089' }, { id: 12, hex: '#d1746c' },
        { id: 13, hex: '#b65a53' }, { id: 14, hex: '#96443f' }, { id: 15, hex: '#77322e' },
        { id: 16, hex: '#572421' }, { id: 17, hex: '#ffe680' }, { id: 19, hex: '#c8e6c9' },
        { id: 20, hex: '#b3e5fc' }, { id: 21, hex: '#e1bee7' }, { id: 22, hex: '#ffcdd2' }
    ],
    EyeColor: [
        { id: 1, hex: '#4b4b4b' }, { id: 2, hex: '#875522' }, { id: 3, hex: '#558cd7' },
        { id: 4, hex: '#3ca05f' }, { id: 5, hex: '#b98214' }, { id: 6, hex: '#6e32a0' },
        { id: 7, hex: '#d73c64' }, { id: 8, hex: '#f5870f' }, { id: 9, hex: '#78bee7' },
        { id: 10, hex: '#b4d75f' }
    ],
    MainHairColor: [
        { id: 1, hex: '#373737' }, { id: 2, hex: '#734b2d' }, { id: 3, hex: '#af7346' },
        { id: 4, hex: '#ebbe64' }, { id: 5, hex: '#d2462d' }, { id: 6, hex: '#c8c8c8' },
        { id: 7, hex: '#ffffff' }, { id: 8, hex: '#4682dc' }, { id: 9, hex: '#32b464' },
        { id: 10, hex: '#e64696' }, { id: 11, hex: '#9646d2' }, { id: 12, hex: '#ff8c1e' },
        { id: 14, hex: '#5ad2dc' }, { id: 15, hex: '#d2e65a' }
    ],
    FacialHairColor: [
        { id: 1, hex: '#373737' }, { id: 2, hex: '#734b2d' }, { id: 3, hex: '#af7346' },
        { id: 4, hex: '#ebbe64' }, { id: 5, hex: '#d2462d' }, { id: 6, hex: '#c8c8c8' },
        { id: 7, hex: '#ffffff' }, { id: 8, hex: '#4682dc' }, { id: 9, hex: '#32b464' },
        { id: 10, hex: '#e64696' }
    ],
    GlassesColor: [
        { id: 1, hex: '#232323' }, { id: 2, hex: '#785032' }, { id: 3, hex: '#c8a046' },
        { id: 4, hex: '#d23232' }, { id: 5, hex: '#1cb0f6' }, { id: 6, hex: '#58cc02' },
        { id: 7, hex: '#ff9600' }, { id: 8, hex: '#b446c8' }, { id: 9, hex: '#ff4ba0' },
        { id: 10, hex: '#ffffff' }
    ],
    HeadwearColor: [
        { id: 1, hex: '#282828' }, { id: 2, hex: '#d23232' }, { id: 3, hex: '#1cb0f6' },
        { id: 4, hex: '#58cc02' }, { id: 5, hex: '#ffc800' }, { id: 6, hex: '#ff9600' },
        { id: 7, hex: '#b446c8' }, { id: 8, hex: '#ffffff' }, { id: 9, hex: '#785032' }
    ],
    ClothingColor: [
        { id: 1, hex: '#ff4b4b' }, { id: 2, hex: '#ff9600' }, { id: 3, hex: '#ffc800' },
        { id: 4, hex: '#58cc02' }, { id: 5, hex: '#1cb0f6' }, { id: 6, hex: '#9646dc' },
        { id: 7, hex: '#ff4ba0' }, { id: 8, hex: '#4b4b4b' }, { id: 9, hex: '#969696' },
        { id: 10, hex: '#ffffff' }, { id: 11, hex: '#785032' }, { id: 12, hex: '#28783c' },
        { id: 13, hex: '#143c8c' }, { id: 14, hex: '#501464' }, { id: 15, hex: '#141414' }
    ],
    BackgroundColor: [
        { id: 1, hex: '#ffc300' }, { id: 2, hex: '#ff9600' }, { id: 3, hex: '#ff5a5f' },
        { id: 4, hex: '#ff69b4' }, { id: 5, hex: '#b464f0' }, { id: 6, hex: '#6e82fa' },
        { id: 7, hex: '#1cb0f6' }, { id: 8, hex: '#00cdb4' }, { id: 9, hex: '#58cc02' },
        { id: 10, hex: '#a0d232' }, { id: 11, hex: '#ffdc78' }, { id: 12, hex: '#ffb48c' },
        { id: 13, hex: '#ffa0aa' }, { id: 14, hex: '#dcb4ff' }, { id: 15, hex: '#b4c8ff' },
        { id: 16, hex: '#a0e6ff' }, { id: 17, hex: '#a0f5e1' }, { id: 18, hex: '#b9f096' },
        { id: 19, hex: '#e6f5a0' }, { id: 20, hex: '#3c3c3c' }, { id: 21, hex: '#646464' },
        { id: 22, hex: '#969696' }, { id: 23, hex: '#c8c8c8' }, { id: 24, hex: '#f0f0f0' },
        { id: 25, hex: '#19232d' }
    ]
};

const duoItemOptions = {
    Body: [1, 2, 3, 4, 5, 6],
    Expression: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    MainHair: [58, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 55, 56, 57, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70],
    Wrinkles: [0, 1, 2],
    Piercings: [0, 1, 2, 3, 4, 5, 6],
    NosePiercing: [0, 1, 2, 3],
    FacialHair: [0, 1, 2, 3, 4, 5, 6, 23],
    Glasses: [0, 1, 2, 3, 4, 5, 6],
    Headwear: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
};

const DUO_TABS = [
    { key: 'skintone', label: 'Pele', icon: 'skintone' },
    { key: 'body', label: 'Corpo', icon: 'body' },
    { key: 'face', label: 'Rosto', icon: 'face' },
    { key: 'hair', label: 'Cabelo', icon: 'hair' },
    { key: 'face_details', label: 'Detalhes', icon: 'face_details' },
    { key: 'facial_hair', label: 'Barba', icon: 'facial_hair' },
    { key: 'headwear', label: 'Acessórios', icon: 'headwear' },
    { key: 'tshirt', label: 'Roupa', icon: 'tshirt' },
    { key: 'background', label: 'Fundo', icon: 'background' }
];

let duoState = {
    BackgroundColor: 1,
    Body: 1,
    ClothingColor: 4,
    Expression: 1,
    EyeColor: 1,
    FacialHair: 0,
    FacialHairColor: 1,
    Glasses: 0,
    GlassesColor: 1,
    Headwear: 0,
    HeadwearColor: 1,
    MainHair: 1,
    MainHairColor: 1,
    NosePiercing: 0,
    Piercings: 0,
    SkinTone: 1,
    Wrinkles: 0
};

let currentDuoTabKey = 'skintone';

function buildDuoUrl(state, size = 'xxlarge') {
    const s = state || duoState;
    return `${DUO_CDN_RENDER}/BackgroundColor-${s.BackgroundColor}/Body-${s.Body}/ClothingColor-${s.ClothingColor}/CostumeArtboard-0/Expression-${s.Expression}/EyeColor-${s.EyeColor}/FacialHair-${s.FacialHair}/FacialHairColor-${s.FacialHairColor}/Glasses-${s.Glasses}/GlassesColor-${s.GlassesColor}/HasCostume-0/Headwear-${s.Headwear}/HeadwearColor-${s.HeadwearColor}/MainHair-${s.MainHair}/MainHairColor-${s.MainHairColor}/Nose%20Piercing-${s.NosePiercing}/Piercings-${s.Piercings}/SkinTone-${s.SkinTone}/Wrinkles-${s.Wrinkles}/${size}`;
}

window.getDynamicDuoAvatarUrl = function(p, overrideExpr = null, size = 'xxlarge') {
    if (!p || !p.duoState) return p?.avatarUrl || '';
    const tempState = { ...p.duoState };
    if (overrideExpr) {
        tempState.Expression = overrideExpr;
    } else if ((p.falhas || 0) >= 2) {
        tempState.Expression = 22; // Pânico / suando frio na beira do abismo
    } else if (p.isWanted) {
        tempState.Expression = 18; // Wanted / marrento / óculos escuros se tiver ou expressão feroz
    } else if (p.score > 0 && p.score === Math.max(...store.players.map(x => x.score))) {
        tempState.Expression = 12; // Líder confiante
    }
    return buildDuoUrl(tempState, size);
};

const TAUNT_QUOTES = [
    "Passa a coroa, pato!",
    "Eu juro que não sou o Impostor!",
    "Nem vem de golpe que eu não caio!",
    "Hoje eu saio campeão dessa mesa!",
    "Alguém me tira do banco de reservas!",
    "Quem tem medo de bomba não joga!",
    "Foi sorte da sua equipe, só isso!",
    "Minha pontuação fala por mim!"
];

window.triggerCardTaunt = function(playerId, e) {
    if (document.getElementById('screen-vote')?.classList.contains('active') ||
        document.getElementById('screen-verdict')?.classList.contains('active') ||
        (e && e.target && e.target.closest && e.target.closest('#vote-list-container'))) {
        return;
    }
    if (e && e.stopPropagation) e.stopPropagation();
    const p = store.players.find(x => x.id === playerId);
    if (!p) return;
    
    // Calcula pitch vocal procedual único do guerreiro baseado no body e id
    let hash = 0;
    for (let i = 0; i < p.id.length; i++) hash = (hash << 5) - hash + p.id.charCodeAt(i);
    const pitch = 220 + (Math.abs(hash) % 450) + ((p.duoState?.Body || 1) * 35);
    window.playSound('voice', pitch);
    window.hapticTap();

    const cardEl = document.getElementById(`card-${playerId}`);
    if (cardEl) {
        // Remove balão antigo se houver
        const oldB = cardEl.querySelector('.taunt-speech-bubble');
        if (oldB) oldB.remove();

        const quote = TAUNT_QUOTES[Math.floor(Math.random() * TAUNT_QUOTES.length)];
        const b = document.createElement('div');
        b.className = 'taunt-speech-bubble';
        b.innerText = quote;
        cardEl.appendChild(b);

        if (typeof window.gsap !== 'undefined') {
            window.gsap.fromTo(b, { scale: 0.3, opacity: 0, y: 10 }, { scale: 1, opacity: 1, y: 0, duration: 0.25, ease: 'back.out(2)' });
            window.gsap.fromTo(cardEl, { y: 0 }, { y: -8, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.out' });
        }

        setTimeout(() => {
            if (b.parentNode) {
                if (typeof window.gsap !== 'undefined') {
                    window.gsap.to(b, { scale: 0.6, opacity: 0, duration: 0.2, onComplete: () => b.remove() });
                } else {
                    b.remove();
                }
            }
        }, 2200);
    }
};

appCore.initDuoTabs = function() {
    const container = document.getElementById('duo-tabs-bar');
    if (!container) return;
    container.style.position = 'relative';
    container.innerHTML = `
        <div id="duo-tabs-pill" class="pill" style="height:4px; bottom:2px; display:none;"></div>
        ${DUO_TABS.map(t => {
            const isSel = t.key === currentDuoTabKey;
            const stateStr = isSel ? 'selected' : 'unselected';
            const iconUrl = `${DUO_STATIC_BASE}/avatar_builder_${t.icon}_${stateStr}_dark.svg`;
            return `
                <button class="duo-tab-btn ${isSel ? 'active' : ''}" data-tab="${t.key}" onclick="appCore.switchDuoTab('${t.key}')" title="${t.label}">
                    <img src="${iconUrl}" alt="${t.label}">
                </button>
            `;
        }).join('')}
    `;
    setTimeout(appCore.updateDuoPill, 40);
};

appCore.updateDuoPill = function() {
    const pill = document.getElementById('duo-tabs-pill');
    const activeBtn = document.querySelector('.duo-tab-btn.active');
    if (pill && activeBtn) {
        pill.style.display = 'block';
        pill.style.left = `${activeBtn.offsetLeft}px`;
        pill.style.width = `${activeBtn.offsetWidth}px`;
    }
};

appCore.switchDuoTab = function(tabKey) {
    currentDuoTabKey = tabKey;
    document.querySelectorAll('.duo-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabKey);
    });
    appCore.updateDuoPill();
    appCore.renderDuoTab();
    const activeBtn = document.querySelector(`.duo-tab-btn[data-tab="${tabKey}"]`);
    if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    window.playSound('pop');
    window.hapticTap();
};

function renderSwatchesHTML(title, paletteKey, field) {
    const list = duoColorPalettes[paletteKey] || [];
    const currentVal = duoState[field];
    return `
        <div class="duo-subsection">
            <div class="duo-subsection-title">${title}</div>
            <div class="duo-swatches-grid">
                ${list.map(c => `
                    <div class="duo-swatch ${c.id === currentVal ? 'active' : ''}" 
                         style="background-color: ${c.hex};" 
                         onclick="appCore.setDuoColor('${field}', ${c.id}, this)"
                         title="Cor ${c.id}">
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderCardsHTML(title, optionKey, field) {
    const ids = duoItemOptions[optionKey] || [];
    const currentVal = duoState[field];
    const isHeadZoom = (field === 'Expression' || field === 'Wrinkles' || field === 'Piercings' || field === 'NosePiercing' || field === 'Glasses');
    const isUpperZoom = (field === 'MainHair' || field === 'Headwear' || field === 'FacialHair');
    const zoomClass = isHeadZoom ? 'zoom-face' : (isUpperZoom ? 'zoom-upper' : '');

    return `
        <div class="duo-subsection">
            <div class="duo-subsection-title">${title}</div>
            <div class="duo-cards-grid">
                ${ids.map(id => {
                    const isSel = id === currentVal;
                    const isNone = (id === 0 && field !== 'MainHair') || (id === 58 && field === 'MainHair');
                    if (isNone) {
                        return `
                            <div class="duo-item-card ${isSel ? 'active' : ''}" onclick="appCore.setDuoItem('${field}', ${id}, this)" title="Nenhum">
                                <div class="duo-item-none">🚫<span>Nenhum</span></div>
                            </div>
                        `;
                    }
                    // Clone user's current avatar with this specific option applied
                    const tempState = { ...duoState, [field]: id };
                    // If previewing hairstyles, remove hat so hair isn't hidden under a beanie/helmet
                    if (field === 'MainHair') tempState.Headwear = 0;
                    const thumbUrl = buildDuoUrl(tempState, 'xlarge');
                    return `
                        <div class="duo-item-card ${zoomClass} ${isSel ? 'active' : ''}" onclick="appCore.setDuoItem('${field}', ${id}, this)" title="Opção ${id}">
                            <img loading="lazy" src="${thumbUrl}" alt="Opção ${id}">
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

appCore.renderDuoTab = function() {
    const container = document.getElementById('duo-subsections-container');
    if (!container) return;
    let html = '';
    switch (currentDuoTabKey) {
        case 'skintone':
            html += renderSwatchesHTML('Tom de Pele', 'SkinTone', 'SkinTone');
            break;
        case 'body':
            html += renderCardsHTML('Formato do Corpo', 'Body', 'Body');
            break;
        case 'face':
            html += renderSwatchesHTML('Cor dos Olhos', 'EyeColor', 'EyeColor');
            html += renderCardsHTML('Expressão do Rosto', 'Expression', 'Expression');
            break;
        case 'hair':
            html += renderSwatchesHTML('Cor do Cabelo', 'MainHairColor', 'MainHairColor');
            html += renderCardsHTML('Penteado', 'MainHair', 'MainHair');
            break;
        case 'face_details':
            html += renderSwatchesHTML('Cor dos Óculos', 'GlassesColor', 'GlassesColor');
            html += renderCardsHTML('Óculos', 'Glasses', 'Glasses');
            html += renderCardsHTML('Detalhes do Rosto (Marcas & Rugas)', 'Wrinkles', 'Wrinkles');
            html += renderCardsHTML('Brincos (Piercings na Orelha)', 'Piercings', 'Piercings');
            html += renderCardsHTML('Piercing no Nariz', 'NosePiercing', 'NosePiercing');
            break;
        case 'facial_hair':
            html += renderSwatchesHTML('Cor da Barba', 'FacialHairColor', 'FacialHairColor');
            html += renderCardsHTML('Estilo de Barba', 'FacialHair', 'FacialHair');
            break;
        case 'headwear':
            html += renderSwatchesHTML('Cor do Chapéu / Boné', 'HeadwearColor', 'HeadwearColor');
            html += renderCardsHTML('Chapéus & Bonés', 'Headwear', 'Headwear');
            break;
        case 'tshirt':
            html += renderSwatchesHTML('Cor da Roupa', 'ClothingColor', 'ClothingColor');
            break;
        case 'background':
            html += renderSwatchesHTML('Cor do Fundo', 'BackgroundColor', 'BackgroundColor');
            break;
    }
    container.innerHTML = html;
};

appCore.setDuoColor = function(field, id, el) {
    duoState[field] = id;
    window.hapticTap();
    appCore.updateDuoPreview();
    
    if (el) {
        const parent = el.closest('.duo-swatches-grid');
        if (parent) {
            parent.querySelectorAll('.duo-swatch').forEach(s => s.classList.remove('active'));
            el.classList.add('active');
        }
    }
    
    // Re-render tab thumbnails if the current tab's items depend on that color
    if (field === 'MainHairColor' || field === 'GlassesColor' || field === 'HeadwearColor' || field === 'FacialHairColor' || field === 'EyeColor') {
        appCore.renderDuoTab();
    }
};

appCore.setDuoItem = function(field, id, el) {
    // Only set this single property - NEVER alter other parts of the body or accessories
    duoState[field] = id;

    window.hapticTap();
    appCore.updateDuoPreview();
    
    // In multi-section tabs (like face_details which has Glasses + Wrinkles + Piercings + NosePiercing),
    // changing an accessory immediately updates the other sections' thumbnails while preserving scroll
    if (currentDuoTabKey === 'face_details') {
        const container = document.getElementById('duo-subsections-container');
        const scrollPos = container ? container.scrollTop : 0;
        appCore.renderDuoTab();
        if (container) container.scrollTop = scrollPos;
    } else if (el) {
        const parent = el.closest('.duo-cards-grid');
        if (parent) {
            parent.querySelectorAll('.duo-item-card').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
        }
    }
};

let duoRenderSeq = 0;

appCore.updateDuoPreview = function() {
    const mySeq = ++duoRenderSeq;
    const img = document.getElementById('duo-main-img');
    const frame = document.getElementById('duo-stage-frame');
    const loader = document.getElementById('duo-stage-loader');
    
    const bgObj = duoColorPalettes.BackgroundColor.find(c => c.id === duoState.BackgroundColor);
    const bgHex = bgObj ? bgObj.hex : '#ffc300';
    if (frame) frame.style.backgroundColor = bgHex;

    const fullUrl = buildDuoUrl(duoState, 'xxlarge');
    if (img) {
        if (loader) loader.style.display = 'flex';
        
        const preload = new Image();
        preload.onload = function() {
            if (mySeq !== duoRenderSeq) return; // Drop stale responses
            img.src = fullUrl;
            img.style.opacity = '1';
            if (loader) loader.style.display = 'none';
        };
        preload.onerror = function() {
            if (mySeq !== duoRenderSeq) return;
            img.src = fullUrl;
            img.style.opacity = '1';
            if (loader) loader.style.display = 'none';
        };
        preload.src = fullUrl;
    }
};

appCore.randomizeDuoAvatar = function() {
    const pickRand = arr => arr[Math.floor(Math.random() * arr.length)];
    duoState = {
        BackgroundColor: pickRand(duoColorPalettes.BackgroundColor).id,
        Body: pickRand(duoItemOptions.Body),
        ClothingColor: pickRand(duoColorPalettes.ClothingColor).id,
        Expression: pickRand(duoItemOptions.Expression),
        EyeColor: pickRand(duoColorPalettes.EyeColor).id,
        FacialHair: Math.random() > 0.6 ? pickRand(duoItemOptions.FacialHair) : 0,
        FacialHairColor: pickRand(duoColorPalettes.FacialHairColor).id,
        Glasses: Math.random() > 0.6 ? pickRand(duoItemOptions.Glasses) : 0,
        GlassesColor: pickRand(duoColorPalettes.GlassesColor).id,
        Headwear: Math.random() > 0.7 ? pickRand(duoItemOptions.Headwear) : 0,
        HeadwearColor: pickRand(duoColorPalettes.HeadwearColor).id,
        MainHair: pickRand(duoItemOptions.MainHair),
        MainHairColor: pickRand(duoColorPalettes.MainHairColor).id,
        NosePiercing: Math.random() > 0.8 ? pickRand(duoItemOptions.NosePiercing) : 0,
        Piercings: Math.random() > 0.8 ? pickRand(duoItemOptions.Piercings) : 0,
        SkinTone: pickRand(duoColorPalettes.SkinTone).id,
        Wrinkles: Math.random() > 0.85 ? pickRand(duoItemOptions.Wrinkles) : 0
    };
    window.hapticTap();
    appCore.updateDuoPreview();
    appCore.renderDuoTab();
};

let editingPlayerId = null;

appCore.editarPlayer = function(id) {
    const p = store.players.find(x => x.id === id);
    if (!p) return;
    appCore.abrirCriador(p);
};

appCore.abrirCriador = function(existingPlayer = null) {
    editingPlayerId = existingPlayer ? existingPlayer.id : null;
    const nameInput = document.getElementById('duo-name-input');
    if (nameInput) nameInput.value = existingPlayer ? existingPlayer.name : '';
    
    if (existingPlayer && existingPlayer.duoState) {
        duoState = { ...existingPlayer.duoState };
    } else {
        // Fresh clean warrior for new creations
        duoState = {
            BackgroundColor: 1, Body: 1, ClothingColor: 4, Expression: 1, EyeColor: 1,
            FacialHair: 0, FacialHairColor: 1, Glasses: 0, GlassesColor: 1, Headwear: 0,
            HeadwearColor: 1, MainHair: 1, MainHairColor: 1, NosePiercing: 0, Piercings: 0,
            SkinTone: 1, Wrinkles: 0
        };
    }
    
    currentDuoTabKey = 'skintone';
    appCore.initDuoTabs();
    appCore.renderDuoTab();
    appCore.updateDuoPreview();
    appCore.nav('screen-avatar-builder');
};

appCore.salvarAvatar = function() {
    const nameInput = document.getElementById('duo-name-input');
    const n = (nameInput ? nameInput.value : '').toUpperCase().trim();
    if (!n) return window.showCustomAlert("Atenção", "Digite um nome ou apelido para o jogador!", "✏️");
    if (!editingPlayerId && store.players.length >= 20) return window.showCustomAlert("Mesa Cheia", "Limite máximo de 20 jogadores atingido.", "👥");

    const bgObj = duoColorPalettes.BackgroundColor.find(c => c.id === duoState.BackgroundColor);
    const bgHex = bgObj ? bgObj.hex : '#ffc300';
    const avatarUrl = buildDuoUrl(duoState, 'xxlarge');

    if (editingPlayerId) {
        const p = store.players.find(x => x.id === editingPlayerId);
        if (p) {
            p.name = n;
            p.avatarUrl = avatarUrl;
            p.bg = bgHex;
            p.duoState = { ...duoState };
        }
        editingPlayerId = null;
    } else {
        const newPlayer = {
            id: 'p_' + Math.random().toString(36).substr(2, 9),
            name: n,
            score: 0,
            falhas: 0,
            avatarUrl: avatarUrl,
            bg: bgHex,
            duoState: { ...duoState },
            stats: { imp: 0, prend: 0 }
        };
        store.players.push(newPlayer);
    }
    store.save();
    window.renderPlayers();
    appCore.nav('screen-players');
    bus.emit('fx:juice', { type: 'confetti', color: [bgHex, '#58cc02', '#ffffff'] });
};

// ==========================================
// 8. NAVEGAÇÃO, MODAIS E JOGADORES
// ==========================================
appCore.nav = function(screenId) {
    if (prendaTimerId && screenId !== 'screen-result') {
        clearTimeout(prendaTimerId);
        prendaTimerId = null;
    }
    const nonGameScreens = ['screen-home', 'screen-players', 'screen-tourney-setup', 'screen-lobby', 'screen-podio'];
    if (nonGameScreens.includes(screenId)) {
        if (window.GIW?.runner) window.GIW.runner.abortCurrentGame();
        window.stopTension?.();
    }

    if (typeof window.gsap !== 'undefined') {
        window.gsap.killTweensOf('.screen');
    }

    document.querySelectorAll('.screen').forEach(s => {
        if (s.id === screenId) {
            s.style.display = 'flex';
            s.classList.add('active');
        } else {
            s.style.display = 'none';
            s.classList.remove('active');
        }
    });

    const next = document.getElementById(screenId);
    if (next && typeof window.gsap !== 'undefined') {
        window.gsap.killTweensOf(next);
        window.gsap.fromTo(next, { opacity: 0, y: 14, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: 'power2.out' });
    }

    document.querySelectorAll('#nav-player-count').forEach(e => e.innerText = store.players.length);
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    if (screenId === 'screen-home') document.getElementById('nav-btn-home')?.classList.add('active');
    else if (screenId === 'screen-players') document.getElementById('nav-btn-players')?.classList.add('active');
    else if (screenId === 'screen-tourney-setup') document.getElementById('nav-btn-tourney')?.classList.add('active');
    bus.emit('state:updated');
};

// Pausa limpa ao minimizar aba ou trocar de aplicativo no celular
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            window.stopTension?.();
            if (window.GIW?.runner?.activeGame) {
                window.GIW.runner.isPaused = true;
            }
        } else {
            if (window.GIW?.runner?.activeGame) {
                window.GIW.runner.isPaused = false;
                window.GIW.runner.lastTime = performance.now();
            }
        }
    }, { passive: true });
}

appCore.stopAudioAndNav = function(screenId) {
    if (window.GIW?.runner) window.GIW.runner.abortCurrentGame();
    appCore.nav(screenId);
};

appCore.openModal = function(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.style.display = 'flex';
    if (typeof window.gsap !== 'undefined') {
        window.gsap.fromTo(m.querySelector('.modal-content'), { scale: 0.88, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(1.5)' });
    }
};

appCore.closeModal = function(id) {
    const m = document.getElementById(id);
    if (!m) return;
    const content = m.querySelector('.modal-content');
    if (content && typeof window.gsap !== 'undefined') {
        window.gsap.to(content, {
            scale: 0.88,
            opacity: 0,
            duration: 0.16,
            ease: 'power2.in',
            onComplete: () => {
                m.style.display = 'none';
                window.gsap.set(content, { scale: 1, opacity: 1 });
            }
        });
    } else {
        m.style.display = 'none';
    }
};

window.showCustomAlert = function(title, message, icon = '⚠️') {
    const titleEl = document.getElementById('ca-title');
    const textEl = document.getElementById('ca-text');
    const iconEl = document.getElementById('ca-icon');
    if (titleEl) titleEl.innerText = title;
    if (textEl) {
        textEl.innerHTML = String(message).replace(/\n/g, '<br>');
    }
    if (iconEl) iconEl.innerText = icon;
    appCore.openModal('custom-alert-modal');
    window.vibrar(120);
    window.playBeep(true);
};

window.showPlayerSelectorModal = function({ icon = '🎯', title = 'Quem Adivinhou?', subtitle = 'Toque no jogador correspondente:', players = [], onSelect, cancelable = false }) {
    const modal = document.getElementById('player-select-modal');
    if (!modal) return;
    document.getElementById('psm-icon').innerText = icon;
    document.getElementById('psm-title').innerText = title;
    document.getElementById('psm-subtitle').innerText = subtitle;
    const cancelBtn = document.getElementById('psm-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = cancelable ? 'block' : 'none';

    const grid = document.getElementById('psm-cards-grid');
    grid.innerHTML = '';
    const targetPlayers = players.length > 0 ? players : (window.GIW.store.players || []);

    targetPlayers.forEach(p => {
        const cardWrapper = document.createElement('div');
        cardWrapper.style.cursor = 'pointer';
        cardWrapper.style.transform = 'scale(0.85)';
        cardWrapper.style.transformOrigin = 'center';
        cardWrapper.innerHTML = window.generateCardHTML(p, '', '', null, false);
        cardWrapper.onclick = () => {
            window.hapticTap();
            window.playSound('pop');
            appCore.closeModal('player-select-modal');
            if (onSelect) onSelect(p);
        };
        grid.appendChild(cardWrapper);
    });

    appCore.openModal('player-select-modal');
};

window.generateCardHTML = function(p, extraClass = '', attr = '', overrideExpr = null, enableTaunt = true) {
    const isLeader = p.score > 0 && p.score === Math.max(...store.players.map(x => x.score));
    const deadClass = p.falhas >= 3 ? 'card-cracked' : (p.falhas === 2 ? 'card-panicking' : '');
    const isUnder = store.isUnderdog(p.id);
    const isWanted = !!p.isWanted;
    const dynamicImg = window.getDynamicDuoAvatarUrl ? window.getDynamicDuoAvatarUrl(p, overrideExpr) : (p.avatarUrl || '');
    const tauntAttr = enableTaunt ? `onclick="window.triggerCardTaunt('${p.id}', event)"` : '';

    return `
        <div class="player-card ${extraClass} ${deadClass} ${isWanted ? 'card-wanted' : ''}" style="background-color: ${p.bg || '#ffffff'};" id="card-${p.id}" ${attr}>
            ${isLeader ? '<div class="crown-badge">👑</div>' : ''}
            ${isWanted ? '<div class="wanted-badge" title="PROCURADO! Derrote para roubar +20 Pts!">WANTED</div>' : ''}
            ${isUnder ? '<div class="mario-kart-badge" title="Bônus Mario Kart 2x!">🍄</div>' : ''}
            <div class="card-score">${p.score || 0}</div>
            <div class="avatar-composite" ${tauntAttr}><img src="${dynamicImg}" alt="${p.name}"></div>
            <div class="card-name">${p.name}</div>
        </div>
    `;
};

window.generateStudioPlayerCard = function(p, opts = {}) {
    const palette = ['#ff7043', '#9c27b0', '#00b0ff', '#43a047', '#e91e63', '#ffb300', '#00e676', '#7c4dff'];
    const pIdx = typeof opts.index === 'number' ? opts.index : (store?.players?.findIndex(x => String(x.id) === String(p.id)) || 0);
    const bgColor = p.bg && p.bg !== '#ffffff' ? p.bg : palette[Math.abs(pIdx) % palette.length];
    const avatarImg = window.getDynamicDuoAvatarUrl ? window.getDynamicDuoAvatarUrl(p, opts.overrideExpr) : (p.avatarUrl || '');

    let roleHtml = '';
    if (opts.roleText) {
        const isImp = opts.isImpostor;
        roleHtml = `
            <div class="studio-card-role-tag ${isImp ? 'is-impostor' : ''}">
                <div class="studio-role-label" style="color: ${isImp ? '#ff2a85' : '#00f0ff'};">${opts.roleText}</div>
                ${opts.roleSub ? `<div style="font-size:0.75rem; color:rgba(255,255,255,0.7); font-weight:700;">${opts.roleSub}</div>` : ''}
            </div>
        `;
    }

    return `
        <div class="studio-player-card ${opts.extraClass || ''}" style="background-color: ${bgColor}; width: ${opts.width || '100%'}; min-height: ${opts.height || '130px'}; cursor: pointer;" ${opts.attr || ''}>
            <div class="studio-card-header-name">${p.name}</div>
            <div class="studio-card-avatar-body">
                ${avatarImg ? `<img src="${avatarImg}" alt="${p.name}" style="width: 58px; height: 58px; object-fit: contain; pointer-events: none;">` : `<span style="font-size:2.8rem; pointer-events:none;">👤</span>`}
            </div>
            ${roleHtml}
        </div>
    `;
};

window.renderPlayers = function() {
    const c = document.getElementById('players-card-grid');
    if (!c) return;
    let totalScore = 0;

    if (store.players.length === 0) {
        c.innerHTML = '<p style="color:var(--ink-muted); font-weight:800; text-align:center; width:100%; margin-top:20px;">Nenhum jogador adicionado ainda.</p>';
    } else {
        let html = '';
        store.players.forEach(p => {
            totalScore += p.score;
            html += `
                <div style="position:relative;">
                    ${window.generateCardHTML(p, '', `onclick="appCore.editarPlayer('${p.id}')"`)}
                    <button class="nav-icon-btn" style="position:absolute; top:-6px; right:-6px; background:var(--pop-magenta); color:white; width:26px; height:26px; font-size:0.8em; padding:0; z-index:20;" onclick="appCore.removePlayer('${p.id}')">✕</button>
                </div>
            `;
        });
        c.innerHTML = html;
    }

    const navBadge = document.getElementById('nav-player-count');
    if (navBadge) navBadge.innerText = store.players.length;

    const presenceEl = document.getElementById('home-presence-stack');
    if (presenceEl) {
        if (store.players.length === 0) {
            presenceEl.innerHTML = '';
        } else {
            const topScore = Math.max(...store.players.map(x => x.score));
            presenceEl.innerHTML = store.players.slice(0, 4).map((p, idx) => {
                const dynamicImg = window.getDynamicDuoAvatarUrl ? window.getDynamicDuoAvatarUrl(p) : (p.avatarUrl || '');
                const isLeader = p.score > 0 && p.score === topScore;
                return `
                    <span class="presence-avatar ${isLeader ? 'live' : ''}" style="background-color:${p.bg || '#ffffff'}; z-index:${10 - idx};" title="${p.name} (${p.score} pts)">
                        <img src="${dynamicImg}" alt="${p.name}">
                    </span>
                `;
            }).join('');
        }
    }

    const btnEnc = document.getElementById('btn-encerrar-noite');
    if (btnEnc) btnEnc.style.display = store.players.length >= 2 ? 'flex' : 'none';

    const bannerCaos = document.getElementById('banner-caos-active');
    if (bannerCaos) bannerCaos.style.display = store.isChaos ? 'block' : 'none';

    window.updateGameAvailability();
};

appCore.removePlayer = function(id) {
    store.players = store.players.filter(x => x.id !== id);
    store.save();
    window.renderPlayers();
};

window.showCustomConfirm = function({ title, text, icon = '⚠️', confirmLabel = 'CONFIRMAR', confirmColor = 'danger', onConfirm }) {
    window.hapticTap();
    window.playSound('pop');
    
    const iconEl = document.getElementById('conf-icon');
    const titleEl = document.getElementById('conf-title');
    const textEl = document.getElementById('conf-text');
    const btnEl = document.getElementById('conf-btn-confirm');
    
    if (iconEl) iconEl.innerText = icon;
    if (titleEl) titleEl.innerText = title;
    if (textEl) textEl.innerHTML = text;
    if (btnEl) {
        btnEl.innerText = confirmLabel;
        btnEl.className = `btn btn-${confirmColor}`;
        btnEl.onclick = () => {
            appCore.closeModal('confirm-modal');
            if (onConfirm) onConfirm();
        };
    }
    appCore.openModal('confirm-modal');
};

appCore.zerarTodosJogadores = function() {
    window.showCustomConfirm({
        title: "Apagar Todos os Jogadores?",
        text: "Deseja realmente apagar todos os jogadores da mesa?<br>Essa ação não poderá ser desfeita!",
        icon: "🗑️",
        confirmLabel: "SIM, APAGAR TUDO",
        confirmColor: "danger",
        onConfirm: () => {
            store.players = [];
            store.save();
            window.renderPlayers();
            window.playSound('kaboom');
            window.hapticTap();
        }
    });
};

appCore.gerarTurmaMagica = function() {
    const names = ["Max", "Zoe", "Leo", "Nina", "Rex"];
    const pickRand = arr => arr[Math.floor(Math.random() * arr.length)];
    for (let i = 0; i < 5; i++) {
        const randState = {
            BackgroundColor: pickRand(duoColorPalettes.BackgroundColor).id,
            Body: pickRand(duoItemOptions.Body),
            ClothingColor: pickRand(duoColorPalettes.ClothingColor).id,
            Expression: pickRand(duoItemOptions.Expression),
            EyeColor: pickRand(duoColorPalettes.EyeColor).id,
            FacialHair: Math.random() > 0.6 ? pickRand(duoItemOptions.FacialHair) : 0,
            FacialHairColor: pickRand(duoColorPalettes.FacialHairColor).id,
            Glasses: Math.random() > 0.6 ? pickRand(duoItemOptions.Glasses) : 0,
            GlassesColor: pickRand(duoColorPalettes.GlassesColor).id,
            Headwear: Math.random() > 0.7 ? pickRand(duoItemOptions.Headwear) : 0,
            HeadwearColor: pickRand(duoColorPalettes.HeadwearColor).id,
            MainHair: pickRand(duoItemOptions.MainHair),
            MainHairColor: pickRand(duoColorPalettes.MainHairColor).id,
            NosePiercing: Math.random() > 0.8 ? pickRand(duoItemOptions.NosePiercing) : 0,
            Piercings: Math.random() > 0.8 ? pickRand(duoItemOptions.Piercings) : 0,
            SkinTone: pickRand(duoColorPalettes.SkinTone).id,
            Wrinkles: Math.random() > 0.85 ? pickRand(duoItemOptions.Wrinkles) : 0
        };
        const bgObj = duoColorPalettes.BackgroundColor.find(c => c.id === randState.BackgroundColor);
        const bgHex = bgObj ? bgObj.hex : '#ffc300';
        const avatarUrl = buildDuoUrl(randState, 'xxlarge');

        store.players.push({
            id: 'p_' + Math.random().toString(36).substr(2, 9),
            name: names[i] || `P${i+1}`,
            score: 0,
            falhas: 0,
            avatarUrl: avatarUrl,
            bg: bgHex,
            duoState: randState,
            stats: { imp: 0, prend: 0 }
        });
    }
    store.save();
    window.renderPlayers();
    window.showCustomAlert("Mágica Concluída", "5 novos jogadores foram adicionados à mesa!", "🪄");
};

window.updateGameAvailability = function() {
    const pCount = store.players.length;
    document.querySelectorAll('.game-card[data-min]').forEach(card => {
        const min = parseInt(card.getAttribute('data-min'), 10) || 0;
        if (pCount < min) card.classList.add('disabled');
        else card.classList.remove('disabled');
    });
};

// ==========================================
// 9. LOBBY, MODIFICADORES & LOJA NEGRA
// ==========================================
appCore.sortearMinigame = function() {
    window.hapticTap();
    window.playSound('pop');

    const list = window.gameCatalog || [];
    if (!list.length) return;

    const numPlayers = store.players.length;
    let pool = list;
    if (numPlayers >= 2) {
        const eligible = list.filter(g => g.min <= numPlayers);
        if (eligible.length > 0) pool = eligible;
    }

    const cards = document.querySelectorAll('.game-grid-card');
    let ticks = 0;
    const maxTicks = 12;
    const tickInterval = setInterval(() => {
        if (cards.length > 0) {
            cards.forEach(c => c.style.borderColor = 'rgba(255,255,255,0.08)');
            const randomCard = cards[Math.floor(Math.random() * cards.length)];
            randomCard.style.borderColor = '#818cf8';
        }
        window.playSound('pop');
        window.hapticTap();
        ticks++;

        if (ticks >= maxTicks) {
            clearInterval(tickInterval);
            if (cards.length > 0) {
                cards.forEach(c => c.style.borderColor = 'rgba(255,255,255,0.08)');
            }
            const chosen = pool[Math.floor(Math.random() * pool.length)];

            window.playSound('victory');
            if (window.GIW && window.GIW.bus) {
                window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 75 });
            }

            window.showCustomAlert(
                '🎰 Minigame Sorteado',
                `O jogo sorteado para esta rodada foi:<br><b style="font-size:1.35em; color:var(--pop-yellow); display:inline-block; margin:6px 0;">${chosen.title.toUpperCase()}</b><br>Entrando na sala da rodada...`,
                '🎲'
            );
            setTimeout(() => {
                appCore.closeModal('custom-alert-modal');
                appCore.openGameLobby(chosen.id);
            }, 1300);
        }
    }, 70);
};

appCore.openGameLobby = function(gameId) {
    const gameMeta = (window.gameCatalog || []).find(g => g.id === gameId);
    const min = gameMeta ? gameMeta.min : 2;
    if (store.players.length < min) {
        if (store.players.length === 0) {
            appCore.abrirCriador();
            return window.showCustomAlert('Falta Gente!', `Esse minigame precisa de pelo menos ${min} jogadores na mesa. Adicione alguém para começar!`, '👥');
        } else {
            appCore.nav('screen-players');
            return window.showCustomAlert('Falta Gente!', `Esse minigame precisa de ${min} jogadores (a mesa tem ${store.players.length}). Adicione mais ${min - store.players.length} ou use a Mágica 🪄!`, '👥');
        }
    }

    store.currentGameActive = gameId;
    const lobbyTitle = document.getElementById('lobby-title');
    if (lobbyTitle) {
        if (store.tournamentMode) {
            lobbyTitle.innerHTML = `<span style="font-size:0.65em; color:var(--pop-yellow); display:block; letter-spacing:1px; margin-bottom:2px;">🏆 TORNEIO • RODADA ${store.tourneyCurrentRound + 1}/${store.tourneyMaxRounds}</span>${(window.gameTitles[gameId] || gameId).toUpperCase()}`;
        } else {
            lobbyTitle.innerText = (window.gameTitles[gameId] || gameId).toUpperCase();
        }
    }
    store.gameConfigs.themes = [];
    appCore.renderLobbySettings(gameId);

    const guide = window.gameGuides[gameId];
    const bannerTagline = document.getElementById('lobby-rules-tagline');
    const bannerIcon = document.getElementById('lobby-rules-icon');
    if (bannerTagline && guide) bannerTagline.innerText = guide.tagline;
    if (bannerIcon && guide) bannerIcon.innerText = guide.icon;

    if (store.isEvents && Math.random() < 0.25) {
        store.currentEvent = { t: "👑 RODADA DE OURO!", m: 2 };
        window.showCustomAlert("Evento Dinâmico", "👑 RODADA DE OURO! Todos os pontos desta rodada valerão o DOBRO!", "🎰");
    } else {
        store.currentEvent = null;
    }

    appCore.setupLobbyTeams(gameId);
    appCore.nav('screen-lobby');
};

appCore.showGameRules = function(gameId) {
    const gid = gameId || store.currentGameActive || 'impostor';
    const guide = window.gameGuides[gid];
    if (!guide) {
        window.showCustomAlert("Como Jogar", window.gameInstructions[gid] || "Siga as regras e vença a rodada!", "📖");
        return;
    }

    const titleEl = document.getElementById('rm-title');
    const iconEl = document.getElementById('rm-icon');
    const badgeEl = document.getElementById('rm-badge');
    const taglineEl = document.getElementById('rm-tagline');
    const stepsCont = document.getElementById('rm-steps-container');

    if (titleEl) titleEl.innerText = window.gameTitles[gid] || gid;
    if (iconEl) iconEl.innerText = guide.icon || '🎮';
    if (badgeEl) badgeEl.innerText = guide.minPlayers || 'Todos';
    if (taglineEl) taglineEl.innerText = guide.tagline || '';

    if (stepsCont) {
        stepsCont.innerHTML = guide.steps.map((st, i) => `
            <div class="rule-step-card" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px;">
                <div class="rule-step-num" style="width: 26px; height: 26px; border-radius: 50%; background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.4); color: #818cf8; font-size: 0.8rem; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">${i + 1}</div>
                <div class="rule-step-body" style="flex: 1;">
                    <div class="rule-step-title" style="font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 2px;">${st.title}</div>
                    <div class="rule-step-desc" style="font-size: 0.8rem; color: rgba(255,255,255,0.65); line-height: 1.35;">${st.desc}</div>
                </div>
            </div>
        `).join('');
    }

    appCore.openModal('rules-modal');
    window.playSound('pop');
    window.hapticTap();
};

appCore.toggleModifier = function(key, el) {
    store[key] = !store[key];
    if (el) el.classList.toggle('active', store[key]);
    store.save();
    window.hapticTap();
    window.renderPlayers();
};

appCore.selectSegment = function(inputId, value, btnEl) {
    const input = document.getElementById(inputId);
    if (input) input.value = value;

    if (btnEl && btnEl.parentElement) {
        const btns = btnEl.parentElement.querySelectorAll('.segment-btn');
        btns.forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }

    window.hapticTap();
    window.playSound('pop');
};

appCore.toggleLobbyRole = function(key, btnEl, label) {
    store[key] = !store[key];
    store.save();
    window.hapticTap();
    window.playSound('pop');
    if (btnEl) {
        const isYellow = label.includes('Bobo');
        const colorVar = isYellow ? 'var(--pop-yellow)' : 'var(--pop-magenta)';
        const bgVar = isYellow ? 'rgba(255,230,0,0.15)' : 'rgba(255,42,133,0.15)';
        btnEl.style.background = store[key] ? bgVar : 'rgba(255,255,255,0.04)';
        btnEl.style.borderColor = store[key] ? colorVar : 'rgba(255,255,255,0.08)';
        btnEl.style.color = store[key] ? colorVar : '#fff';
        btnEl.innerHTML = `<span>${label}</span><span style="font-size:0.8em; font-weight:900;">${store[key] ? 'LIGADO ✅' : 'DESLIGADO ✕'}</span>`;
    }
    const tRoles = document.getElementById('t-roles');
    if (tRoles) tRoles.classList.toggle('active', store[key]);
};

appCore.stepLobbyConfig = function(prop, delta) {
    if (!store.gameConfigs) store.gameConfigs = {};
    if (typeof store.gameConfigs[prop] !== 'number') store.gameConfigs[prop] = 1;
    let max = Math.max(1, Math.floor((store.players.length || 4) / 2));
    store.gameConfigs[prop] = Math.max(1, Math.min(max, store.gameConfigs[prop] + delta));
    const el = document.getElementById('val-lobby-impostores');
    if (el) el.innerText = store.gameConfigs[prop];
    appCore.updateLobbySettingsBadge(store.currentGameActive);
    window.playSound('pop');
    window.hapticTap();
};

appCore.setLobbyRoleValue = function(key, val) {
    store[key] = val;
    appCore.renderLobbySettings(store.currentGameActive);
    window.playSound('pop');
    window.hapticTap();
};

appCore.updateLobbySettingsBadge = function(gameId) {
    const badge = document.getElementById('lobby-settings-badge');
    if (!badge) return;
    if (gameId === 'impostor') {
        const imp = store.gameConfigs.impostorCount || 1;
        const bobo = store.isRoles ? 'Bobo ON' : 'Bobo OFF';
        badge.innerText = `${imp} Impostor${imp > 1 ? 'es' : ''} • ${bobo}`;
    } else if (gameId === 'posicao') {
        badge.innerText = store.isRoles ? 'Sabotador Ativado' : 'Modo Clássico';
    } else if (gameId === 'batata') {
        const sens = store.gameConfigs.sens === 15 ? 'Alta' : store.gameConfigs.sens === 35 ? 'Baixa' : 'Normal';
        badge.innerText = `Sensor ${sens}`;
    } else if (['mimica', 'completa'].includes(gameId)) {
        const t = document.getElementById('config-time')?.value || 60;
        badge.innerText = `Tempo: ${t}s`;
    } else {
        badge.innerText = 'Configurar ➔';
    }
};

appCore.renderLobbySettings = function(gameId) {
    const box = document.getElementById('game-specific-configs');
    const btnRow = document.getElementById('lobby-settings-btn-row');
    const navBtn = document.getElementById('btn-lobby-settings-nav');
    if (!box) return;
    box.innerHTML = '';
    let html = '';

    const needsThemes = ['impostor', 'megasenha', 'completa', 'unica', 'quemsoueu'];
    if (needsThemes.includes(gameId)) {
        appCore.renderThemesModal();
        const themesCount = (store.gameConfigs.themes && store.gameConfigs.themes.length) ? store.gameConfigs.themes.length : 0;
        const themesDesc = themesCount > 0 ? `${themesCount} categorias ativas` : 'Todas as categorias liberadas';
        html += `
            <div class="studio-card-setting" style="cursor:pointer;" onclick="appCore.openModal('themes-modal')">
                <div style="flex:1;">
                    <div class="studio-card-title">🏷️ TEMAS DA PARTIDA</div>
                    <div class="studio-card-desc">${themesDesc}</div>
                </div>
                <div style="font-size:1.1rem; padding: 6px 14px; background: rgba(255,255,255,0.08); border-radius: 999px; font-weight:800;">EDITAR ➔</div>
            </div>
        `;
    }

    if (gameId === 'impostor') {
        const impCount = store.gameConfigs.impostorCount || 1;
        html += `
            <div class="studio-card-setting">
                <div style="flex:1;">
                    <div class="studio-card-title">IMPOSTORES</div>
                    <div class="studio-card-desc">Número de sabotadores na mesa</div>
                </div>
                <div class="studio-stepper-wrap">
                    <button type="button" class="studio-stepper-btn" onclick="appCore.stepLobbyConfig('impostorCount', -1)">−</button>
                    <div class="studio-stepper-value" id="val-lobby-impostores">${impCount}</div>
                    <button type="button" class="studio-stepper-btn" onclick="appCore.stepLobbyConfig('impostorCount', 1)">+</button>
                </div>
            </div>

            <div class="studio-card-setting">
                <div style="flex:1;">
                    <div class="studio-card-title">BOBO DA CORTE</div>
                    <div class="studio-card-desc">Ele vence se for eliminado no tribunal</div>
                </div>
                <div class="studio-segmented-pill">
                    <button type="button" class="studio-segmented-opt ${!store.isRoles ? 'active' : ''}" onclick="appCore.setLobbyRoleValue('isRoles', false)">Desativado</button>
                    <button type="button" class="studio-segmented-opt ${store.isRoles ? 'active' : ''}" onclick="appCore.setLobbyRoleValue('isRoles', true)">Ativado</button>
                </div>
            </div>

            <div class="studio-card-setting">
                <div style="flex:1;">
                    <div class="studio-card-title">TEMPO DE DISCUSSÃO</div>
                    <div class="studio-card-desc">Cronômetro para debates antes da votação</div>
                </div>
                <div class="studio-segmented-pill" id="ctrl-config-time">
                    <button type="button" class="studio-segmented-opt" onclick="appCore.selectSegment('config-time', 120, this)">2 Min</button>
                    <button type="button" class="studio-segmented-opt active" onclick="appCore.selectSegment('config-time', 240, this)">4 Min</button>
                    <button type="button" class="studio-segmented-opt" onclick="appCore.selectSegment('config-time', 360, this)">6 Min</button>
                </div>
                <input type="hidden" id="config-time" value="240">
            </div>
        `;
    } else if (gameId === 'posicao') {
        html += `
            <div class="studio-card-setting">
                <div style="flex:1;">
                    <div class="studio-card-title">PAPEL SABOTADOR</div>
                    <div class="studio-card-desc">Um infiltrado que tenta sabotar a ordem</div>
                </div>
                <div class="studio-segmented-pill">
                    <button type="button" class="studio-segmented-opt ${!store.isRoles ? 'active' : ''}" onclick="appCore.setLobbyRoleValue('isRoles', false)">Desativado</button>
                    <button type="button" class="studio-segmented-opt ${store.isRoles ? 'active' : ''}" onclick="appCore.setLobbyRoleValue('isRoles', true)">Ativado</button>
                </div>
            </div>
        `;
    } else if (gameId === 'batata') {
        html += `
            <div class="studio-card-setting">
                <div style="flex:1;">
                    <div class="studio-card-title">SENSIBILIDADE DA BOMBA</div>
                    <div class="studio-card-desc">Gatilho de movimento e trepidação</div>
                </div>
                <div class="studio-segmented-pill" id="ctrl-config-sens">
                    <button type="button" class="studio-segmented-opt" onclick="appCore.selectSegment('config-sens', 35, this)">Baixa</button>
                    <button type="button" class="studio-segmented-opt active" onclick="appCore.selectSegment('config-sens', 25, this)">Normal</button>
                    <button type="button" class="studio-segmented-opt" onclick="appCore.selectSegment('config-sens', 15, this)">Alta ⚡</button>
                </div>
                <input type="hidden" id="config-sens" value="25">
            </div>
        `;
    } else if (['mimica', 'completa'].includes(gameId)) {
        html += `
            <div class="studio-card-setting">
                <div style="flex:1;">
                    <div class="studio-card-title">TEMPO DA RODADA</div>
                    <div class="studio-card-desc">Duração para a equipe pontuar</div>
                </div>
                <div class="studio-segmented-pill" id="ctrl-config-time">
                    <button type="button" class="studio-segmented-opt" onclick="appCore.selectSegment('config-time', 30, this)">30s</button>
                    <button type="button" class="studio-segmented-opt" onclick="appCore.selectSegment('config-time', 45, this)">45s</button>
                    <button type="button" class="studio-segmented-opt active" onclick="appCore.selectSegment('config-time', 60, this)">60s</button>
                </div>
                <input type="hidden" id="config-time" value="60">
            </div>
        `;
    }

    box.style.display = html ? 'flex' : 'none';
    box.style.flexDirection = 'column';
    box.style.gap = '12px';
    box.innerHTML = html;

    const hasConfigs = !!html;
    if (btnRow) btnRow.style.display = hasConfigs ? 'block' : 'none';
    if (navBtn) navBtn.style.display = hasConfigs ? 'flex' : 'none';
    if (hasConfigs) appCore.updateLobbySettingsBadge(gameId);

    const lblCount = document.getElementById('lobby-player-count-label');
    if (lblCount) {
        lblCount.innerText = `${store.players.length} JOGADORES`;
    }
};

appCore.renderThemesModal = function() {
    const c = document.getElementById('themes-modal-container');
    if (!c) return;
    c.className = 'themes-grid-studio';
    const icons = {
        'Geral': '🎲', 'Cinema': '🎬', 'Geografia': '🌍', 'Música': '🎵',
        'Comidas': '🍕', 'Objetos': '📦', 'Profissões': '💼', 'Esportes': '⚽',
        'Animais': '🦁', 'Séries': '📺', 'Tecnologia': '💻', 'Jogos': '🎮',
        'Marcas': '🏷️', 'História': '📜', 'Ciência': '🔬', 'Desenhos': '🎨'
    };
    const cats = Object.keys(window.categoriasIniciais || {});
    let html = '';
    cats.forEach(cat => {
        const isSel = (store.gameConfigs.themes || []).includes(cat);
        const icon = icons[cat] || '🏷️';
        html += `
            <div class="theme-card-studio ${isSel ? 'is-active' : ''}" onclick="appCore.toggleTheme('${cat}', this)">
                <div class="theme-name"><span>${icon}</span> <span>${cat}</span></div>
                <div class="theme-check">✓</div>
            </div>
        `;
    });
    c.innerHTML = html;
};

appCore.toggleTheme = function(cat, el) {
    if (!store.gameConfigs.themes) store.gameConfigs.themes = [];
    if (store.gameConfigs.themes.includes(cat)) {
        store.gameConfigs.themes = store.gameConfigs.themes.filter(x => x !== cat);
        el.classList.remove('is-active');
    } else {
        store.gameConfigs.themes.push(cat);
        el.classList.add('is-active');
        if (typeof window.gsap !== 'undefined') {
            window.gsap.fromTo(el, { scale: 0.95 }, { scale: 1, duration: 0.18, ease: 'back.out(2)' });
        }
    }
    const sum = document.getElementById('lobby-themes-summary');
    if (sum) {
        const cnt = store.gameConfigs.themes.length;
        sum.innerText = cnt > 0 ? `${cnt} categorias ativas` : 'Todas as categorias liberadas';
    }
    window.playSound('pop');
    window.hapticTap();
};

let selectedSwap = null;
appCore.setupLobbyTeams = function(gameId) {
    const shuf = [...store.players].sort(() => Math.random() - 0.5);
    store.teams = [];
    store.bench = [];

    if (gameId === 'quemsoueu') {
        store.teams.push({ id: 0, name: '👥 Equipe 1', players: shuf.slice(0, 2), score: 0 });
        store.teams.push({ id: 1, name: '👥 Equipe 2', players: shuf.slice(2, 4), score: 0 });
        store.bench = shuf.slice(4);
    } else if (gameId === 'nota') {
        store.teams.push({ id: 0, name: '🎯 Dupla 1 (Avaliador + Adivinhador)', players: shuf.slice(0, 2), score: 0 });
        store.teams.push({ id: 1, name: '🎯 Dupla 2 (Avaliador + Adivinhador)', players: shuf.slice(2, 4), score: 0 });
        store.bench = shuf.slice(4);
    } else if (gameId === 'megasenha') {
        store.teams.push({ id: 0, name: '👥 Time 1', players: shuf.slice(0, 2), score: 0 });
        store.teams.push({ id: 1, name: '👥 Time 2', players: shuf.slice(2, 4), score: 0 });
        store.bench = shuf.slice(4);
    } else if (gameId === 'unica') {
        // Indica claramente no lobby quem adivinha e quem dá dicas
        store.teams.push({ id: 0, name: '🎯 Adivinhador (Quem vai adivinhar)', players: [shuf[0]], score: 0 });
        store.teams.push({ id: 1, name: '✍️ Dão as Dicas (Resto da Mesa)', players: shuf.slice(1), score: 0 });
        store.bench = [];
    } else if (gameId === 'completa') {
        let nt = Math.floor(shuf.length / 3);
        if (nt === 0) nt = 1;
        let idx = 0;
        for (let i = 0; i < nt; i++) {
            store.teams.push({ id: i, name: `👥 Equipe ${i + 1}`, players: shuf.slice(idx, idx + 3), score: 0 });
            idx += 3;
        }
        store.bench = shuf.slice(idx);
    } else {
        store.teams.push({ id: 0, name: 'Jogadores Titulares', players: shuf, score: 0 });
    }
    window.renderLobbyTeams();
};

window.clickSwapTarget = function(tId, pIdx, isBench) {
    if (!selectedSwap) {
        selectedSwap = { tId, pIdx, isBench };
    } else {
        let l1 = selectedSwap.isBench ? store.bench : store.teams[selectedSwap.tId].players;
        let l2 = isBench ? store.bench : store.teams[tId].players;
        let p1 = l1[selectedSwap.pIdx];
        let p2 = l2[pIdx];
        l1[selectedSwap.pIdx] = p2;
        l2[pIdx] = p1;
        selectedSwap = null;
    }
    window.renderLobbyTeams();
};

window.renderLobbyTeams = function() {
    const c = document.getElementById('lobby-teams-container');
    if (!c) return;

    let html = '';
    store.teams.forEach(t => {
        const pHTML = t.players.map((p, pIdx) => {
            const isSel = selectedSwap && !selectedSwap.isBench && selectedSwap.tId === t.id && selectedSwap.pIdx === pIdx;
            return `
                <div onclick="clickSwapTarget(${t.id}, ${pIdx}, false)" style="transition:0.15s; ${isSel ? 'transform:scale(1.1); filter:drop-shadow(0 0 10px var(--pop-cyan));' : ''}">
                    ${window.generateCardHTML(p).replace('width: 104px; height: 148px;', 'width: 76px; height: 108px; font-size:0.75em;')}
                </div>
            `;
        }).join('');

        html += `
            <div style="background:var(--bg-surface); border-radius:18px; padding:14px; border:var(--border-brutal-sm); box-shadow:var(--shadow-brutal-sm);">
                <div style="color:var(--ink-white); font-weight:900; margin-bottom:8px;">${t.name || (store.teams.length > 1 ? `Equipe ${t.id + 1}` : 'Jogadores Titulares')}</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${pHTML}</div>
            </div>
        `;
    });

    if (store.bench.length > 0) {
        const bHTML = store.bench.map((p, pIdx) => {
            const isSel = selectedSwap && selectedSwap.isBench && selectedSwap.pIdx === pIdx;
            return `
                <div onclick="clickSwapTarget(null, ${pIdx}, true)" style="transition:0.15s; ${isSel ? 'transform:scale(1.1); filter:drop-shadow(0 0 10px var(--pop-magenta));' : ''}">
                    ${window.generateCardHTML(p).replace('width: 104px; height: 148px;', 'width: 76px; height: 108px; font-size:0.75em;')}
                </div>
            `;
        }).join('');

        html += `
            <div style="background:var(--bg-surface-elevated); border-radius:18px; padding:14px; border:2px dashed var(--pop-magenta);">
                <div style="color:var(--pop-magenta); font-weight:900; margin-bottom:8px;">Na Reserva / Próximos da Fila</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${bHTML}</div>
            </div>
        `;
    }

    c.innerHTML = html;
};

// ==========================================
// 10. SISTEMA DE PRENDAS / CASTIGOS
// ==========================================
let pendingPunishedPlayer = null;
appCore.dispararPrenda = function(player) {
    pendingPunishedPlayer = player;
    const pool = store.isChaos ? [...window.prendasLista, ...window.prendasCaos] : window.prendasLista;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    document.getElementById('prenda-player-name').innerText = `💥 ${player.name} levou um Castigo!`;
    document.getElementById('prenda-card-title').innerText = chosen.t;
    document.getElementById('prenda-card-desc').innerText = chosen.d;

    window.playSound('kaboom');
    window.vibrar(800);
    appCore.openModal('prenda-modal');
};

appCore.concluirPrenda = function() {
    if (pendingPunishedPlayer) {
        pendingPunishedPlayer.falhas = 0;
        pendingPunishedPlayer = null;
        store.save();
        window.renderPlayers();
    }
    appCore.closeModal('prenda-modal');
    window.playSound('applause');
    bus.emit('fx:juice', { type: 'confetti' });
};

// ==========================================
// 11. TORNEIO, ROLETA & DESEMPATE
// ==========================================
appCore.openTourneySetup = function() {
    window.hapticTap();
    window.playSound('nav');
    if (store.players.length < 2) {
        appCore.nav('screen-players');
        return window.showCustomAlert('Cadê a Galera?', 'O Torneio precisa de pelo menos 2 jogadores na mesa!', '👥');
    }
    appCore.renderTourneyRoster();
    appCore.updateTourneyCTA();
    appCore.nav('screen-tourney-setup');
};

appCore.renderTourneyRoster = function() {
    const countEl = document.getElementById('tourney-roster-count');
    const shelfEl = document.getElementById('tourney-roster-shelf');
    if (countEl) countEl.innerText = store.players.length;
    if (shelfEl) {
        shelfEl.innerHTML = store.players.map(p => `
            <div class="tourney-roster-pill">
                <img src="${p.avatarUrl}" style="width:22px; height:22px; border-radius:50%; border:1px solid #000; background:${p.avatarBg || '#ffc300'};">
                <span>${p.name}</span>
                <span style="color:var(--pop-yellow); font-size:0.85em;">(${p.score || 0} pts)</span>
            </div>
        `).join('');
    }
};

appCore.selectTourneyPreset = function(rounds, el) {
    window.hapticTap();
    window.playSound('pop');
    store.tourneyMaxRounds = rounds;
    document.querySelectorAll('.tourney-preset-card').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    appCore.updateTourneyCTA();
};

appCore.selectTourneyMode = function(mode, el) {
    window.hapticTap();
    window.playSound('pop');
    store.tourneyCuratedMode = mode;
    document.querySelectorAll('.tourney-mode-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
};

appCore.updateTourneyCTA = function() {
    const btn = document.getElementById('btn-start-tourney-cta');
    if (btn) {
        btn.innerText = `🚀 INICIAR TORNEIO (${store.tourneyMaxRounds} JOGOS)`;
    }
};

appCore.startTourney = function() {
    if (store.players.length < 2) {
        return window.showCustomAlert('Cadê a Galera?', 'Precisa de pelo menos 2 jogadores para iniciar o torneio!', '👥');
    }

    store.tournamentMode = true;
    store.tourneyType = 'rounds';
    store.tourneyCurrentRound = 0;

    const allGames = Object.keys(window.gameTitles || {});
    const categories = {
        strategy: ['impostor', 'macabro'],
        mind: ['posicao', 'unica', 'quemsoueu'],
        team: ['duplas', 'megasenha', 'nota', 'completa', 'mimica'],
        adrenaline: ['reacao', 'stop', 'sevira', 'batata', 'ultimo']
    };

    if (store.tourneyCuratedMode === 'balanced') {
        let pool = [];
        const catKeys = Object.keys(categories).sort(() => Math.random() - 0.5);
        catKeys.forEach(cat => {
            const list = categories[cat].filter(g => allGames.includes(g));
            if (list.length > 0) pool.push(list[Math.floor(Math.random() * list.length)]);
        });
        const remainingAll = allGames.filter(g => !pool.includes(g)).sort(() => Math.random() - 0.5);
        while (pool.length < store.tourneyMaxRounds && remainingAll.length > 0) {
            pool.push(remainingAll.pop());
        }
        store.tourneyAllowedGames = pool.slice(0, store.tourneyMaxRounds);
    } else {
        store.tourneyAllowedGames = [...allGames].sort(() => Math.random() - 0.5).slice(0, store.tourneyMaxRounds);
    }

    store.tourneyPool = [...store.tourneyAllowedGames].reverse();
    window.playSound('victory');
    window.hapticTap();
    window.playTournamentNext();
};

let currentSpinTween = null;

window.skipTournamentSpin = function() {
    if (currentSpinTween) {
        currentSpinTween.kill();
        currentSpinTween = null;
    }
    const nextGame = store.currentGameActive;
    if (nextGame) {
        window.playSound('pop');
        window.hapticTap();
        appCore.openGameLobby(nextGame);
    }
};

window.playTournamentNext = function() {
    if (store.isTourneyOver() || store.tourneyPool.length === 0) {
        return appCore.encerrarNoite();
    }

    const nextGame = store.tourneyPool.pop();
    store.currentGameActive = nextGame;
    appCore.nav('screen-tourney-spin');

    const ind = document.getElementById('tourney-spin-indicator');
    if (ind) {
        ind.innerHTML = `<span>⚡</span> RODADA ${store.tourneyCurrentRound + 1} DE ${store.tourneyMaxRounds}`;
    }

    const track = document.getElementById('roulette-track');
    if (!track) return;
    track.innerHTML = '';
    if (typeof window.gsap !== 'undefined') {
        window.gsap.set(track, { x: 0 });
    } else {
        track.style.transform = 'translateX(0px)';
    }

    const all = Object.keys(window.gameTitles || {});
    const spinItems = [];
    for (let i = 0; i < 16; i++) spinItems.push(all[Math.floor(Math.random() * all.length)]);
    spinItems.push(nextGame);
    for (let i = 0; i < 8; i++) spinItems.push(all[Math.floor(Math.random() * all.length)]);

    const itemWidth = 176; // 160px width + 16px horizontal margin

    spinItems.forEach((g, idx) => {
        const isTarget = idx === 16;
        const icon = window.gameGuides[g]?.icon || '🎮';
        const title = window.gameTitles[g] || g;
        track.innerHTML += `
            <div id="${isTarget ? 'roleta-alvo' : ''}" class="roulette-card ${isTarget ? 'is-target' : ''}">
                <div class="roulette-card-icon">${icon}</div>
                <div class="roulette-card-name">${title}</div>
            </div>
        `;
    });

    setTimeout(() => {
        const alvo = document.getElementById('roleta-alvo');
        if (!alvo) return;
        const targetMove = -(alvo.offsetLeft + (alvo.offsetWidth / 2));
        let lastTickCard = -1;

        if (typeof window.gsap !== 'undefined') {
            if (currentSpinTween) currentSpinTween.kill();

            currentSpinTween = window.gsap.to(track, {
                x: targetMove,
                duration: 3.2,
                ease: 'power3.out',
                onUpdate: function() {
                    const currentX = Math.abs(window.gsap.getProperty(track, 'x'));
                    const cardIdx = Math.floor(currentX / itemWidth);
                    if (cardIdx !== lastTickCard) {
                        lastTickCard = cardIdx;
                        window.playSound('tick');
                        if (Math.random() < 0.2) window.hapticTap();
                    }
                },
                onComplete: () => {
                    currentSpinTween = null;
                    window.playSound('victory');
                    window.vibrar(350);
                    alvo.classList.add('is-selected');
                    window.gsap.fromTo(alvo, 
                        { scale: 1 }, 
                        { scale: 1.14, duration: 0.35, yoyo: true, repeat: 1, ease: 'back.out(2)' }
                    );
                    setTimeout(() => appCore.openGameLobby(nextGame), 1100);
                }
            });
        } else {
            setTimeout(() => appCore.openGameLobby(nextGame), 1000);
        }
    }, 120);
};

// Desempate Seguro (Sem destruição de DOM)
let touchFingers = {}, touchDone = false;
const touchColors = ['#ffd600', '#00e5ff', '#ff2a85', '#00e676', '#8b5cf6'];

appCore.encerrarNoite = function() {
    if (store.players.length < 2) return window.showCustomAlert("Mesa Vazia", "Precisa de pelo menos 2 jogadores cadastrados para abrir a retrospectiva da noite.", "👥");
    const s = [...store.players].sort((a, b) => (b.score || 0) - (a.score || 0));
    if (s[0].score === s[1].score && s[0].score > 0) {
        appCore.nav('screen-tiebreaker');
    } else {
        appCore.iniciarRetrospectiva(s);
    }
};

appCore.runTouchRoleta = function() {
    const existing = document.getElementById('touch-board');
    if (existing) {
        existing.remove();
        touchFingers = {};
    }

    const board = document.createElement('div');
    board.id = 'touch-board';
    board.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(9,10,15,0.95); z-index:9999; touch-action:none;';
    board.innerHTML = `<p id="touch-msg" style="color:white; text-align:center; margin-top:20vh; font-size:1.6em; font-weight:900;">Mantenham os dedos pressionados na tela!</p>`;
    document.body.appendChild(board);

    touchFingers = {};
    touchDone = false;
    let timer = null;

    const checkTimer = () => {
        clearTimeout(timer);
        if (Object.keys(touchFingers).length > 1) {
            timer = setTimeout(decideWinner, 3000);
        }
    };

    const decideWinner = () => {
        touchDone = true;
        window.playKaboom();
        window.vibrar(1000);
        const keys = Object.keys(touchFingers);
        const winKey = keys[Math.floor(Math.random() * keys.length)];
        keys.forEach(k => {
            const circle = touchFingers[k];
            if (k === winKey) {
                circle.style.transform = 'translate(-50%, -50%) scale(2.2)';
                circle.style.backgroundColor = 'var(--pop-green)';
            } else {
                circle.style.opacity = '0';
            }
        });
        document.getElementById('touch-msg').innerText = "VENCEDOR ESCOLHIDO!";
        
        const s = [...store.players].sort((a, b) => b.score - a.score);
        if (s[0]) {
            s[0].score = (s[0].score || 0) + 1;
            store.save();
        }

        setTimeout(() => {
            touchFingers = {};
            board.remove();
            appCore.iniciarRetrospectiva();
        }, 2200);
    };

    const addFinger = (id, clientX, clientY) => {
        if (touchDone || touchFingers[id]) return;
        const div = document.createElement('div');
        const color = touchColors[Object.keys(touchFingers).length % touchColors.length];
        div.style.cssText = `position:absolute; width:100px; height:100px; background:${color}; border:4px solid #090a0f; border-radius:50%; transform:translate(-50%, -50%); top:${clientY}px; left:${clientX}px; pointer-events:none;`;
        board.appendChild(div);
        touchFingers[id] = div;
        window.playBeep(true);
        window.hapticTap();
        checkTimer();
    };

    const moveFinger = (id, clientX, clientY) => {
        if (touchDone) return;
        const c = touchFingers[id];
        if (c) { c.style.top = clientY + 'px'; c.style.left = clientX + 'px'; }
    };

    const removeFinger = (id) => {
        if (touchDone) return;
        const c = touchFingers[id];
        if (c) { c.remove(); delete touchFingers[id]; }
        checkTimer();
    };

    board.addEventListener('touchstart', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            addFinger(t.identifier, t.clientX, t.clientY);
        }
    }, { passive: false });

    board.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            moveFinger(t.identifier, t.clientX, t.clientY);
        }
    }, { passive: false });

    board.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            removeFinger(t.identifier);
        }
    }, { passive: false });

    board.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') addFinger(`mouse_${e.pointerId}`, e.clientX, e.clientY);
    });
    board.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse') removeFinger(`mouse_${e.pointerId}`);
    });
};

appCore.runOlhares = function() {
    window.showCustomAlert("Duelo de Olhares!", "Fiquem encarando sem piscar! O primeiro a piscar é eliminado da disputa do trono.", "👁️");
    const s = [...store.players].sort((a, b) => b.score - a.score);
    if (s[0]) {
        s[0].score = (s[0].score || 0) + 1;
        store.save();
    }
    setTimeout(() => appCore.iniciarRetrospectiva(), 2800);
};

appCore.renderPodio = function(sSorted) {
    appCore.nav('screen-podio');
    window.playSound('victory');
    window.vibrar(600);
    window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 150 });

    const s = sSorted || [...store.players].sort((a, b) => b.score - a.score);
    
    // 1º Lugar - Campeão
    const champ = s[0] || { name: 'Jogador', score: 0 };
    const champAvatarEl = document.getElementById('podio-champ-avatar');
    const champNameEl = document.getElementById('podio-champ-name');
    const champPtsEl = document.getElementById('podio-champ-pts');

    if (champAvatarEl) champAvatarEl.innerHTML = window.generateCardHTML(champ);
    if (champNameEl) champNameEl.innerText = champ.name;
    if (champPtsEl) champPtsEl.innerText = `${champ.score} PONTOS`;

    // 2º Lugar
    const p2 = s[1];
    const silverAvatarEl = document.getElementById('podio-silver-avatar');
    const silverNameEl = document.getElementById('podio-silver-name');
    const silverPtsEl = document.getElementById('podio-silver-pts');
    if (silverAvatarEl) silverAvatarEl.innerHTML = p2 ? window.generateCardHTML(p2).replace('width: 104px; height: 148px;', 'width: 72px; height: 102px; font-size:0.68em;') : '';
    if (silverNameEl) silverNameEl.innerText = p2 ? p2.name : 'Ninguém';
    if (silverPtsEl) silverPtsEl.innerText = p2 ? `${p2.score} Pts` : '--';

    // 3º Lugar
    const p3 = s[2];
    const bronzeAvatarEl = document.getElementById('podio-bronze-avatar');
    const bronzeNameEl = document.getElementById('podio-bronze-name');
    const bronzePtsEl = document.getElementById('podio-bronze-pts');
    if (bronzeAvatarEl) bronzeAvatarEl.innerHTML = p3 ? window.generateCardHTML(p3).replace('width: 104px; height: 148px;', 'width: 72px; height: 102px; font-size:0.68em;') : '';
    if (bronzeNameEl) bronzeNameEl.innerText = p3 ? p3.name : 'Ninguém';
    if (bronzePtsEl) bronzePtsEl.innerText = p3 ? `${p3.score} Pts` : '--';

    // Título: Saco de Pancadas
    const maxPrendas = Math.max(0, ...store.players.map(p => (p.falhas || 0) + (p.stats?.prend || 0)));
    const saco = store.players.find(p => ((p.falhas || 0) + (p.stats?.prend || 0)) === maxPrendas && maxPrendas > 0);
    const sacoAvatarEl = document.getElementById('podio-saco-avatar');
    const sacoNameEl = document.getElementById('podio-saco-name');
    if (sacoAvatarEl) sacoAvatarEl.innerHTML = saco ? window.generateCardHTML(saco).replace('width: 104px; height: 148px;', 'width: 68px; height: 96px; font-size:0.65em;') : '<span style="font-size:2em;">🛡️</span>';
    if (sacoNameEl) sacoNameEl.innerText = saco ? saco.name : 'Nenhum punido';

    // Título: Mestre do Blefe
    const maxImp = Math.max(0, ...store.players.map(p => p.stats?.imp || 0));
    const psico = store.players.find(p => (p.stats?.imp || 0) === maxImp && maxImp > 0);
    const psicoAvatarEl = document.getElementById('podio-psico-avatar');
    const psicoNameEl = document.getElementById('podio-psico-name');
    if (psicoAvatarEl) psicoAvatarEl.innerHTML = psico ? window.generateCardHTML(psico).replace('width: 104px; height: 148px;', 'width: 68px; height: 96px; font-size:0.65em;') : '<span style="font-size:2em;">🎭</span>';
    if (psicoNameEl) psicoNameEl.innerText = psico ? psico.name : 'Nenhum blefador';

    if (typeof window.gsap !== 'undefined') {
        window.gsap.fromTo('#podio-champion-card', 
            { scale: 0.85, opacity: 0, y: 30 }, 
            { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.8)' }
        );
    }
};

// ==========================================
// 12. RETROSPECTIVA DA NOITE (CINEMATIC WRAPPED)
// ==========================================
let retroCurrentSlide = 0;
const RETRO_TOTAL_SLIDES = 7;
let retroSlideTimer = null;
let retroSlideProgressTween = null;
let retroIsPaused = false;
let retroAmbientAnimId = null;
let retroAmbientParticles = [];
let retroKeyboardBound = false;
const RETRO_SLIDE_DURATION_SEC = 4.8;

appCore.iniciarRetrospectiva = function(sSorted) {
    if (store.players.length < 2) {
        return window.showCustomAlert(
            "Mesa Vazia",
            "Adicione pelo menos 2 jogadores para gerar a retrospectiva animada da noite!",
            "✨"
        );
    }

    // Ordenação decrescente por pontuação
    const s = sSorted || [...store.players].sort((a, b) => (b.score || 0) - (a.score || 0));

    // Navega para a tela fullscreen da Retrospectiva
    appCore.nav('screen-retrospectiva');
    if (window.stopTension) window.stopTension();

    // 1. Estatísticas Consolidadas da Sessão
    const totalPoints = s.reduce((acc, p) => acc + (p.score || 0), 0);
    const totalBombs = s.reduce((acc, p) => acc + (p.falhas || 0) + (p.stats?.prend || 0), 0);
    const maxStreak = Math.max(0, ...s.map(p => p.streak || 0));
    const roundsPlayed = Math.max(
        store.sessionRounds || 0,
        store.tourneyCurrentRound || 0,
        totalPoints > 0 ? Math.max(1, Math.round(totalPoints / 20)) : (s.length > 0 ? 1 : 0)
    );

    // 2. Destaques & Títulos
    const champ = s[0] || { name: 'Jogador', score: 0 };
    const runner2 = s[1] || null;
    const runner3 = s[2] || null;

    // Saco de Pancadas: maior número de falhas ou prendas
    const maxPrendas = Math.max(0, ...s.map(p => (p.falhas || 0) + (p.stats?.prend || 0)));
    const saco = maxPrendas > 0 ? s.find(p => ((p.falhas || 0) + (p.stats?.prend || 0)) === maxPrendas) : null;
    const sacoTarget = saco || s[s.length - 1];

    // Mestre do Blefe / Judas: maior número de vitórias como impostor
    const maxImp = Math.max(0, ...s.map(p => p.stats?.imp || 0));
    const judas = maxImp > 0 ? s.find(p => (p.stats?.imp || 0) === maxImp) : null;
    const judasTarget = judas || (s[0] !== sacoTarget ? s[0] : (s[1] || s[0]));

    // 3. Preenchimento de Dados do DOM
    // Slide 0: Abertura
    const playerPill = document.getElementById('retro-player-pill');
    if (playerPill) playerPill.innerText = `${s.length} Guerreiros na Mesa`;

    // Slide 1: O Caos em Números
    const elP = document.getElementById('retro-stat-points');
    const elR = document.getElementById('retro-stat-rounds');
    const elS = document.getElementById('retro-stat-streak');
    const elB = document.getElementById('retro-stat-bombs');
    if (elP) elP.innerText = '0';
    if (elR) elR.innerText = '0';
    if (elS) elS.innerText = '0';
    if (elB) elB.innerText = '0';
    window._retroTargetStats = {
        points: totalPoints,
        rounds: roundsPlayed,
        streak: maxStreak,
        bombs: totalBombs
    };
    const punchlineEl = document.getElementById('retro-stat-punchline');
    if (punchlineEl) {
        if (totalPoints === 0) {
            punchlineEl.innerText = '"Uma noite zen: zero pontos, mas muitas risadas!"';
        } else if (totalBombs >= 4) {
            punchlineEl.innerText = '"O caos reinou supremo: bombas explodindo, prendas e vingança!"';
        } else {
            punchlineEl.innerText = '"Nenhum participante saiu dessa mesa com a reputação 100% intacta."';
        }
    }

    // Slide 2: Saco de Pancadas
    const sacoAvatarEl = document.getElementById('retro-saco-avatar');
    const sacoNameEl = document.getElementById('retro-saco-name');
    const sacoMetaEl = document.getElementById('retro-saco-meta');
    const sacoDescEl = document.getElementById('retro-saco-desc');
    if (sacoAvatarEl) sacoAvatarEl.innerHTML = window.generateCardHTML(sacoTarget).replace('width: 104px; height: 148px;', 'width: 84px; height: 120px; font-size:0.75em;');
    if (sacoNameEl) sacoNameEl.innerText = sacoTarget.name;
    if (sacoMetaEl) sacoMetaEl.innerText = `${maxPrendas > 0 ? maxPrendas : 0} penalidades sofridas`;
    if (sacoDescEl) sacoDescEl.innerText = maxPrendas > 0 ? "Sofreu na pele a fúria e o azar da mesa, mas continuou de pé!" : "Inacreditável: mesa zen! Ninguém virou saco de pancadas hoje.";

    // Slide 3: Mestre do Blefe
    const judasAvatarEl = document.getElementById('retro-judas-avatar');
    const judasNameEl = document.getElementById('retro-judas-name');
    const judasMetaEl = document.getElementById('retro-judas-meta');
    const judasDescEl = document.getElementById('retro-judas-desc');
    if (judasAvatarEl) judasAvatarEl.innerHTML = window.generateCardHTML(judasTarget).replace('width: 104px; height: 148px;', 'width: 84px; height: 120px; font-size:0.75em;');
    if (judasNameEl) judasNameEl.innerText = judasTarget.name;
    if (judasMetaEl) judasMetaEl.innerText = `${maxImp > 0 ? maxImp : 1} vitórias em disfarces`;
    if (judasDescEl) judasDescEl.innerText = maxImp > 0 ? "Mentiu, olhou no olho de todo mundo e saiu sorrindo com os pontos!" : "O verdadeiro enxadrista: venceu nas sombras sem levantar suspeitas.";

    // Slide 4: Prata e Bronze
    const bronzeCard = document.getElementById('retro-card-bronze');
    const silverCard = document.getElementById('retro-card-silver');
    const bronzeAvatarEl = document.getElementById('retro-bronze-avatar');
    const bronzeNameEl = document.getElementById('retro-bronze-name');
    const bronzePtsEl = document.getElementById('retro-bronze-pts');
    const silverAvatarEl = document.getElementById('retro-silver-avatar');
    const silverNameEl = document.getElementById('retro-silver-name');
    const silverPtsEl = document.getElementById('retro-silver-pts');

    if (runner3) {
        if (bronzeCard) bronzeCard.style.display = 'flex';
        if (bronzeAvatarEl) bronzeAvatarEl.innerHTML = window.generateCardHTML(runner3).replace('width: 104px; height: 148px;', 'width: 64px; height: 92px; font-size:0.65em;');
        if (bronzeNameEl) bronzeNameEl.innerText = runner3.name;
        if (bronzePtsEl) bronzePtsEl.innerText = `${runner3.score || 0} Pts`;
    } else if (bronzeCard) {
        bronzeCard.style.display = 'none';
    }

    if (runner2) {
        if (silverCard) silverCard.style.display = 'flex';
        if (silverAvatarEl) silverAvatarEl.innerHTML = window.generateCardHTML(runner2).replace('width: 104px; height: 148px;', 'width: 72px; height: 104px; font-size:0.68em;');
        if (silverNameEl) silverNameEl.innerText = runner2.name;
        if (silverPtsEl) silverPtsEl.innerText = `${runner2.score || 0} Pts`;
    } else if (silverCard) {
        silverCard.style.display = 'none';
    }

    // Slide 5: Campeão Supremo
    const champAvatarEl = document.getElementById('retro-champ-avatar');
    const champNameEl = document.getElementById('retro-champ-name');
    const champPtsEl = document.getElementById('retro-champ-pts');
    if (champAvatarEl) champAvatarEl.innerHTML = window.generateCardHTML(champ).replace('width: 104px; height: 148px;', 'width: 96px; height: 136px; font-size:0.8em;');
    if (champNameEl) champNameEl.innerText = champ.name;
    if (champPtsEl) champPtsEl.innerText = `${champ.score || 0} PONTOS`;

    // Slide 6: Resumo Executivo
    const sumChampName = document.getElementById('retro-sum-champ-name');
    const sumChampPts = document.getElementById('retro-sum-champ-pts');
    if (sumChampName) sumChampName.innerText = champ.name;
    if (sumChampPts) sumChampPts.innerText = `${champ.score || 0} Pts`;

    const sumRunnersRow = document.getElementById('retro-summary-runners-row');
    if (sumRunnersRow) {
        let itemsHTML = '';
        if (runner2) {
            itemsHTML += `
                <div class="retro-summary-item">
                    <div class="retro-summary-item-left">
                        <span style="font-size:1.1em;">🥈</span>
                        <div>
                            <div class="retro-summary-item-title">2º LUGAR</div>
                            <div class="retro-summary-item-name">${runner2.name}</div>
                        </div>
                    </div>
                    <div class="retro-summary-item-pts">${runner2.score || 0} Pts</div>
                </div>`;
        }
        if (runner3) {
            itemsHTML += `
                <div class="retro-summary-item">
                    <div class="retro-summary-item-left">
                        <span style="font-size:1.1em;">🥉</span>
                        <div>
                            <div class="retro-summary-item-title">3º LUGAR</div>
                            <div class="retro-summary-item-name">${runner3.name}</div>
                        </div>
                    </div>
                    <div class="retro-summary-item-pts">${runner3.score || 0} Pts</div>
                </div>`;
        }
        if (sacoTarget && sacoTarget.name) {
            itemsHTML += `
                <div class="retro-summary-item">
                    <div class="retro-summary-item-left">
                        <span style="font-size:1.1em;">💥</span>
                        <div>
                            <div class="retro-summary-item-title">SACO DE PANCADAS</div>
                            <div class="retro-summary-item-name">${sacoTarget.name}</div>
                        </div>
                    </div>
                    <div class="retro-summary-item-pts" style="color:var(--pop-magenta);">${maxPrendas} penalidades</div>
                </div>`;
        }
        if (judasTarget && judasTarget.name) {
            itemsHTML += `
                <div class="retro-summary-item">
                    <div class="retro-summary-item-left">
                        <span style="font-size:1.1em;">🎭</span>
                        <div>
                            <div class="retro-summary-item-title">MESTRE DO BLEFE</div>
                            <div class="retro-summary-item-name">${judasTarget.name}</div>
                        </div>
                    </div>
                    <div class="retro-summary-item-pts" style="color:var(--pop-cyan);">${maxImp > 0 ? maxImp : 1} blefes</div>
                </div>`;
        }
        sumRunnersRow.innerHTML = itemsHTML;
    }

    // 4. Inicializa HUD, Canvas e Teclado
    appCore.retroBuildProgressTrack();
    appCore.retroInitAmbientCanvas();
    appCore.retroBindKeys();

    // 5. Inicia no Slide 0
    retroIsPaused = false;
    appCore.retroUpdatePauseButton();
    appCore.retroIrParaSlide(0);
};

appCore.retroBuildProgressTrack = function() {
    const track = document.getElementById('retro-progress-track');
    if (!track) return;
    track.innerHTML = '';
    for (let i = 0; i < RETRO_TOTAL_SLIDES; i++) {
        const seg = document.createElement('div');
        seg.className = 'retro-seg';
        seg.id = `retro-seg-${i}`;
        seg.innerHTML = `<div class="retro-seg-fill" id="retro-seg-fill-${i}"></div>`;
        track.appendChild(seg);
    }
};

appCore.retroUpdateProgressBars = function(activeIndex) {
    for (let i = 0; i < RETRO_TOTAL_SLIDES; i++) {
        const seg = document.getElementById(`retro-seg-${i}`);
        const fill = document.getElementById(`retro-seg-fill-${i}`);
        if (!seg || !fill) continue;

        if (i < activeIndex) {
            seg.classList.add('completed');
            fill.style.width = '100%';
        } else if (i === activeIndex) {
            seg.classList.remove('completed');
            fill.style.width = '0%';
        } else {
            seg.classList.remove('completed');
            fill.style.width = '0%';
        }
    }
};

appCore.retroInitAmbientCanvas = function() {
    const canvas = document.getElementById('retro-ambient-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    retroAmbientParticles = [];
    const colors = ['#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#ffffff'];
    for (let i = 0; i < 35; i++) {
        retroAmbientParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: 0.8 + Math.random() * 2.2,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 0.4,
            vy: -0.2 - Math.random() * 0.5,
            alpha: 0.15 + Math.random() * 0.45,
            phase: Math.random() * Math.PI * 2
        });
    }

    if (retroAmbientAnimId) cancelAnimationFrame(retroAmbientAnimId);

    const loop = () => {
        const retroScreen = document.getElementById('screen-retrospectiva');
        if (!retroScreen || retroScreen.style.display === 'none') {
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let p of retroAmbientParticles) {
            p.x += p.vx;
            p.y += p.vy;
            p.phase += 0.02;

            if (p.y < -10) p.y = canvas.height + 10;
            if (p.x < -10) p.x = canvas.width + 10;
            if (p.x > canvas.width + 10) p.x = -10;

            const curAlpha = Math.max(0.05, p.alpha + Math.sin(p.phase) * 0.2);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = curAlpha;
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        retroAmbientAnimId = requestAnimationFrame(loop);
    };

    retroAmbientAnimId = requestAnimationFrame(loop);
};

appCore.retroBindKeys = function() {
    if (retroKeyboardBound) return;
    retroKeyboardBound = true;
    window.addEventListener('keydown', (e) => {
        const retroScreen = document.getElementById('screen-retrospectiva');
        if (!retroScreen || retroScreen.style.display === 'none') return;

        if (e.key === 'ArrowRight' || e.key === ' ') {
            e.preventDefault();
            appCore.retroNextSlide();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            appCore.retroPrevSlide();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            appCore.retroClose();
        }
    });
};

appCore.retroIrParaSlide = function(index) {
    if (index < 0) index = 0;
    if (index >= RETRO_TOTAL_SLIDES) index = RETRO_TOTAL_SLIDES - 1;
    retroCurrentSlide = index;

    // Atualiza tag de capítulo
    const tagEl = document.getElementById('retro-hud-tag');
    if (tagEl) tagEl.innerText = `CAPÍTULO ${index + 1} DE ${RETRO_TOTAL_SLIDES}`;

    // Alterna slides visíveis
    for (let i = 0; i < RETRO_TOTAL_SLIDES; i++) {
        const slide = document.getElementById(`retro-slide-${i}`);
        if (slide) {
            slide.classList.toggle('active', i === index);
        }
    }

    // Atualiza barras de progresso
    appCore.retroUpdateProgressBars(index);

    // No último slide (resumo executivo), desativa as áreas de tap overlay para não bloquear os botões
    const tapLeft = document.querySelector('.retro-tap-left');
    const tapRight = document.querySelector('.retro-tap-right');
    const footerCue = document.querySelector('.retro-footer-cue');
    const isLastSlide = (index === RETRO_TOTAL_SLIDES - 1);
    if (tapLeft) tapLeft.style.display = isLastSlide ? 'none' : 'block';
    if (tapRight) tapRight.style.display = isLastSlide ? 'none' : 'block';
    if (footerCue) footerCue.style.display = isLastSlide ? 'none' : 'block';

    // Limpa timers anteriores
    if (retroSlideTimer) clearTimeout(retroSlideTimer);
    if (retroSlideProgressTween) {
        retroSlideProgressTween.kill();
        retroSlideProgressTween = null;
    }

    const activeSlideEl = document.getElementById(`retro-slide-${index}`);
    if (!activeSlideEl) return;

    const hasGsap = typeof window.gsap !== 'undefined';
    if (hasGsap) {
        window.gsap.killTweensOf(activeSlideEl.querySelectorAll('*'));
    }

    // Animação Orquestrada por Slide (Skill motion-design-gsap)
    switch(index) {
        case 0: // Abertura
            window.playSound?.('pop');
            if (hasGsap) {
                window.gsap.fromTo(activeSlideEl.querySelector('.retro-intro-title'), 
                    { scale: 0.88, opacity: 0, y: 20 },
                    { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.8)' }
                );
                window.gsap.fromTo(activeSlideEl.querySelector('.retro-intro-desc'),
                    { opacity: 0, y: 15 },
                    { opacity: 1, y: 0, duration: 0.4, delay: 0.2, ease: 'power2.out' }
                );
                window.gsap.fromTo(activeSlideEl.querySelector('.retro-start-btn'),
                    { scale: 0.9, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.35, delay: 0.35, ease: 'back.out(2)' }
                );
            }
            break;

        case 1: // O Caos em Números (Odômetros com Ticker)
            window.playSound?.('nav');
            if (hasGsap && window._retroTargetStats) {
                const statCards = activeSlideEl.querySelectorAll('.retro-stat-card');
                window.gsap.fromTo(statCards,
                    { opacity: 0, y: 24, scale: 0.92 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.08, ease: 'power3.out' }
                );
                
                const obj = { p: 0, r: 0, s: 0, b: 0 };
                window.gsap.to(obj, {
                    p: window._retroTargetStats.points,
                    r: window._retroTargetStats.rounds,
                    s: window._retroTargetStats.streak,
                    b: window._retroTargetStats.bombs,
                    duration: 1.6,
                    ease: 'power2.out',
                    onUpdate: () => {
                        const elP = document.getElementById('retro-stat-points');
                        const elR = document.getElementById('retro-stat-rounds');
                        const elS = document.getElementById('retro-stat-streak');
                        const elB = document.getElementById('retro-stat-bombs');
                        if (elP) elP.innerText = Math.round(obj.p);
                        if (elR) elR.innerText = Math.round(obj.r);
                        if (elS) elS.innerText = Math.round(obj.s);
                        if (elB) elB.innerText = Math.round(obj.b);
                    },
                    onComplete: () => {
                        window.playPop?.();
                    }
                });
            }
            break;

        case 2: // Saco de Pancadas
            window.playSound?.('kaboom');
            window.vibrar?.(250);
            if (hasGsap) {
                const card = document.getElementById('retro-card-saco');
                const stamp = card?.querySelector('.retro-card-stamp');
                window.gsap.fromTo(activeSlideEl,
                    { x: -8 },
                    { x: 0, duration: 0.35, ease: 'power2.out' }
                );
                if (card) {
                    window.gsap.fromTo(card,
                        { scale: 0.75, opacity: 0, rotateZ: -10, y: -35 },
                        { scale: 1, opacity: 1, rotateZ: 0, y: 0, duration: 0.55, ease: 'bounce.out' }
                    );
                }
                if (stamp) {
                    window.gsap.fromTo(stamp,
                        { scale: 2.8, opacity: 0 },
                        { scale: 1, opacity: 1, duration: 0.3, delay: 0.35, ease: 'back.out(2.5)' }
                    );
                }
            }
            break;

        case 3: // Mestre do Blefe
            window.playSound?.('heartbeat');
            window.hapticTap?.();
            if (hasGsap) {
                const card = document.getElementById('retro-card-judas');
                const stamp = card?.querySelector('.retro-card-stamp');
                if (card) {
                    window.gsap.fromTo(card,
                        { rotateY: 90, opacity: 0, scale: 0.8 },
                        { rotateY: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'power3.out' }
                    );
                }
                if (stamp) {
                    window.gsap.fromTo(stamp,
                        { scale: 2.5, opacity: 0 },
                        { scale: 1, opacity: 1, duration: 0.3, delay: 0.4, ease: 'back.out(2.2)' }
                    );
                }
            }
            break;

        case 4: // Prata e Bronze
            window.playSound?.('pop');
            window.hapticTap?.();
            if (hasGsap) {
                const bronze = document.getElementById('retro-card-bronze');
                const silver = document.getElementById('retro-card-silver');
                if (bronze) {
                    window.gsap.fromTo(bronze,
                        { x: -50, opacity: 0, scale: 0.85 },
                        { x: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)' }
                    );
                }
                if (silver) {
                    window.gsap.fromTo(silver,
                        { x: 50, opacity: 0, scale: 0.85 },
                        { x: 0, opacity: 1, scale: 1, duration: 0.5, delay: 0.15, ease: 'back.out(1.6)' }
                    );
                }
            }
            break;

        case 5: // Campeão Supremo (Clímax)
            window.playSound?.('heartbeat');
            if (hasGsap) {
                const champCard = document.getElementById('retro-card-champ');
                const crown = document.getElementById('retro-crown-icon');
                const beam = activeSlideEl.querySelector('.retro-spotlight-beam');
                
                if (beam) {
                    window.gsap.fromTo(beam, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out' });
                }
                if (champCard) {
                    window.gsap.fromTo(champCard,
                        { scale: 0.6, opacity: 0, y: 60 },
                        { scale: 1, opacity: 1, y: 0, duration: 0.6, delay: 0.25, ease: 'back.out(1.8)' }
                    );
                }
                if (crown) {
                    window.gsap.fromTo(crown,
                        { y: -80, opacity: 0, scale: 2 },
                        { y: 0, opacity: 1, scale: 1, duration: 0.5, delay: 0.55, ease: 'bounce.out' }
                    );
                }
            }
            // Chuva maciça de confetes e fanfarra
            setTimeout(() => {
                window.playSound?.('victory');
                window.vibrar?.(500);
                if (typeof window.confetti === 'function') {
                    window.confetti({
                        particleCount: 175,
                        spread: 100,
                        origin: { y: 0.55 },
                        colors: ['#f59e0b', '#ec4899', '#06b6d4', '#10b981', '#ffffff']
                    });
                }
            }, 550);
            break;

        case 6: // Resumo Final
            window.playSound?.('coin');
            if (hasGsap) {
                const sumCard = activeSlideEl.querySelector('.retro-summary-card');
                const actions = activeSlideEl.querySelector('.retro-actions-stack');
                if (sumCard) {
                    window.gsap.fromTo(sumCard,
                        { scale: 0.9, opacity: 0, y: 20 },
                        { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }
                    );
                }
                if (actions) {
                    window.gsap.fromTo(actions.querySelectorAll('.btn'),
                        { opacity: 0, y: 15 },
                        { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, delay: 0.2, ease: 'power2.out' }
                    );
                }
            }
            break;
    }

    // Auto-advance de Stories (exceto último slide ou se pausado)
    if (index < RETRO_TOTAL_SLIDES - 1 && !retroIsPaused) {
        appCore.retroStartProgressAnimation(index);
    }
};

appCore.retroStartProgressAnimation = function(index) {
    const curFill = document.getElementById(`retro-seg-fill-${index}`);
    if (!curFill) return;

    curFill.style.width = '0%';
    const durationMs = RETRO_SLIDE_DURATION_SEC * 1000;

    if (typeof window.gsap !== 'undefined') {
        retroSlideProgressTween = window.gsap.to(curFill, {
            width: '100%',
            duration: RETRO_SLIDE_DURATION_SEC,
            ease: 'none',
            onComplete: () => {
                if (!retroIsPaused && retroCurrentSlide === index) {
                    appCore.retroNextSlide();
                }
            }
        });
    } else {
        curFill.style.transition = `width ${RETRO_SLIDE_DURATION_SEC}s linear`;
        curFill.style.width = '100%';
        retroSlideTimer = setTimeout(() => {
            if (!retroIsPaused && retroCurrentSlide === index) appCore.retroNextSlide();
        }, durationMs);
    }
};

appCore.retroNextSlide = function() {
    if (retroCurrentSlide < RETRO_TOTAL_SLIDES - 1) {
        appCore.retroIrParaSlide(retroCurrentSlide + 1);
    }
};

appCore.retroPrevSlide = function() {
    if (retroCurrentSlide > 0) {
        appCore.retroIrParaSlide(retroCurrentSlide - 1);
    }
};

appCore.retroTogglePause = function() {
    retroIsPaused = !retroIsPaused;
    appCore.retroUpdatePauseButton();
    if (retroIsPaused) {
        if (retroSlideProgressTween) retroSlideProgressTween.pause();
        if (retroSlideTimer) clearTimeout(retroSlideTimer);
    } else {
        if (retroSlideProgressTween) {
            retroSlideProgressTween.resume();
        } else {
            appCore.retroStartProgressAnimation(retroCurrentSlide);
        }
    }
};

appCore.retroUpdatePauseButton = function() {
    const btn = document.getElementById('retro-btn-pause');
    if (btn) btn.innerText = retroIsPaused ? '▶️' : '⏸️';
};

appCore.retroToggleSound = function() {
    store.isSoundOn = !store.isSoundOn;
    store.save();
    const btn = document.getElementById('retro-btn-sound');
    if (btn) btn.innerText = store.isSoundOn ? '🔊' : '🔇';
    window.hapticTap?.();
};

appCore.retroSkipToEnd = function() {
    window.hapticTap?.();
    appCore.retroIrParaSlide(RETRO_TOTAL_SLIDES - 1);
};

appCore.retroReplay = function() {
    window.hapticTap?.();
    appCore.retroIrParaSlide(0);
};

appCore.retroClose = function() {
    if (retroSlideTimer) clearTimeout(retroSlideTimer);
    if (retroSlideProgressTween) retroSlideProgressTween.kill();
    if (retroAmbientAnimId) cancelAnimationFrame(retroAmbientAnimId);
    appCore.nav('screen-home');
};

window.showRetrospectiva = appCore.iniciarRetrospectiva;

appCore.verPosterInApp = function() {
    window.hapticTap();
    window.playSound('pop');
    
    const canvas = document.getElementById('poster-canvas');
    if (!canvas) return;
    
    appCore.desenharPosterNoCanvas(canvas, () => {
        appCore.openModal('poster-modal');
    });
};

appCore.desenharPosterNoCanvas = function(canvas, onReady) {
    const s = [...store.players].sort((a, b) => b.score - a.score);
    const champ = s[0] || { name: 'Campeão', score: 0 };
    
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');

    // Fundo Neo-Brutalista Amarelo Pop
    ctx.fillStyle = '#ffd600';
    ctx.fillRect(0, 0, 1080, 1350);

    // Moldura brutalista
    ctx.lineWidth = 24;
    ctx.strokeStyle = '#090a0f';
    ctx.strokeRect(20, 20, 1040, 1310);

    // Faixa Superior
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(20, 20, 1040, 180);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚔️ GAME IS WAR: A GUERRA', 540, 110);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '900 32px system-ui, sans-serif';
    const dataStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    ctx.fillText(`RELATÓRIO OFICIAL DA NOITE • ${dataStr}`, 540, 165);

    // Box do Campeão Supremo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(100, 260, 880, 560);
    ctx.strokeRect(100, 260, 880, 560);

    ctx.fillStyle = '#ff2a85';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillText('👑 CAMPEÃO SUPREMO DO TRONO 👑', 540, 335);

    ctx.fillStyle = '#090a0f';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.fillText(champ.name, 540, 710);

    ctx.fillStyle = '#58cc02';
    ctx.font = '900 48px system-ui, sans-serif';
    ctx.fillText(`${champ.score} PONTOS CONQUISTADOS`, 540, 775);

    // Box Saco de Pancadas e Mestre do Blefe
    const maxPrendas = Math.max(0, ...store.players.map(p => (p.falhas || 0) + (p.stats?.prend || 0)));
    const saco = store.players.find(p => ((p.falhas || 0) + (p.stats?.prend || 0)) === maxPrendas && maxPrendas > 0);
    const maxImp = Math.max(0, ...store.players.map(p => p.stats?.imp || 0));
    const psico = store.players.find(p => (p.stats?.imp || 0) === maxImp && maxImp > 0);

    // Box Saco de Pancadas
    ctx.fillStyle = '#ff2a85';
    ctx.fillRect(100, 860, 420, 280);
    ctx.strokeRect(100, 860, 420, 280);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px system-ui, sans-serif';
    ctx.fillText('💥 SACO DE PANCADAS', 310, 930);
    ctx.font = '900 50px system-ui, sans-serif';
    ctx.fillText(saco?.name || 'Ninguém', 310, 1020);
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText('Mais punido da noite', 310, 1090);

    // Box Mestre do Blefe
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(560, 860, 420, 280);
    ctx.strokeRect(560, 860, 420, 280);
    ctx.fillStyle = '#090a0f';
    ctx.font = '900 32px system-ui, sans-serif';
    ctx.fillText('🕵️ MESTRE DO BLEFE', 770, 930);
    ctx.font = '900 50px system-ui, sans-serif';
    ctx.fillText(psico?.name || 'Ninguém', 770, 1020);
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText('Enganou a mesa inteira', 770, 1090);

    // Rodapé
    ctx.fillStyle = '#090a0f';
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.fillText('GAME IS WAR 3.0 • CAMPEÃO DA NOITE', 540, 1260);

    if (champ.avatarUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try { ctx.drawImage(img, 415, 360, 250, 250); } catch (_) {}
            if (onReady) onReady();
        };
        img.onerror = () => { if (onReady) onReady(); };
        img.src = champ.avatarUrl;
    } else {
        if (onReady) onReady();
    }
};

appCore.baixarPosterCanvas = function() {
    window.hapticTap();
    const canvas = document.getElementById('poster-canvas');
    if (!canvas) return;
    try {
        const a = document.createElement('a');
        a.download = `game-is-war-podio-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        window.showCustomAlert("Pôster Salvo!", "O pôster da vitória foi salvo no seu dispositivo!", "📸");
    } catch (e) {
        window.showCustomAlert("Pôster!", "Toque e segure sobre a imagem para salvar!", "📸");
    }
};

appCore.confirmarNovaNoite = function() {
    window.showCustomConfirm({
        title: "Começar Nova Noite?",
        text: "O placar e as penalidades de todos serão zerados para uma nova rodada de jogos!<br>Os avatares e nomes continuarão salvos na mesa.",
        icon: "🔄",
        confirmLabel: "SIM, ZERAR PONTOS",
        confirmColor: "warning",
        onConfirm: () => {
            appCore.fecharPodio();
            window.showCustomAlert("Placar Zerado!", "Pontuação zerada com sucesso! Bora começar uma nova disputa!", "🔄");
        }
    });
};

appCore.fecharPodio = function() {
    store.tournamentMode = false;
    store.tourneyCurrentRound = 0;
    store.sessionRounds = 0;
    store.tourneyPool = [];
    store.players.forEach(p => { 
        p.score = 0; 
        p.falhas = 0; 
        if (p.stats) { p.stats.imp = 0; p.stats.prend = 0; }
    });
    store.save();
    window.renderPlayers();
    appCore.nav('screen-home');
};

// Façades de Som Procedural
window.playSound = (sfx, highTone) => bus.emit('audio:play', { sfx, highTone });
window.playBeep = (isHigh = false) => bus.emit('audio:play', { sfx: 'beep', highTone: !!isHigh });
window.playKaboom = () => bus.emit('audio:play', { sfx: 'kaboom' });
window.playHeartbeat = () => bus.emit('audio:play', { sfx: 'heartbeat' });
window.playClick = () => bus.emit('audio:play', { sfx: 'click' });
window.playPop = () => bus.emit('audio:play', { sfx: 'pop' });
window.playCoin = () => bus.emit('audio:play', { sfx: 'coin' });
window.playVictory = () => bus.emit('audio:play', { sfx: 'victory' });
window.playError = () => bus.emit('audio:play', { sfx: 'error' });
window.playNav = () => bus.emit('audio:play', { sfx: 'nav' });
window.vibrar = (ms = 150) => bus.emit('haptics:trigger', { pattern: ms });
window.hapticTap = () => bus.emit('haptics:trigger', { preset: 'tap' });
window.playTension = (remainingSec) => bus.emit('audio:tension', { remainingSec });
window.stopTension = () => bus.emit('audio:tension_stop');

// Conexão Automática de Áudio Procedural na Interface
document.addEventListener('click', (e) => {
    if (!store.isSoundOn) return;
    const target = e.target;
    if (!target) return;

    const toggleEl = target.closest('.toggle-switch, .switch');
    if (toggleEl) {
        const willBeActive = !toggleEl.classList.contains('active');
        window.playSound(willBeActive ? 'toggle_on' : 'toggle_off');
        return;
    }
    if (target.closest('.chip')) {
        window.playSound('pop');
        return;
    }
    if (target.closest('.nav-item')) {
        window.playSound('nav');
        return;
    }
    if (target.closest('.duo-tab-btn')) {
        window.playSound('pop');
        return;
    }
    if (target.closest('.game-card')) {
        window.playSound('pop');
        return;
    }
    const btn = target.closest('.btn, .nav-icon-btn, .vote-card-btn, button');
    if (btn) {
        if (btn.classList.contains('btn-danger')) {
            window.playSound('badum');
        } else if (btn.classList.contains('btn-success')) {
            window.playSound('pop');
        } else {
            window.playSound('click');
        }
    }
}, { capture: true, passive: true });

// Feedback Visual Imediato: Toast Flutuante de Pontos
window.spawnScoreToast = function(text, x, y, color = 'var(--pop-yellow)') {
    const toast = document.createElement('div');
    toast.className = 'score-float-toast';
    toast.innerText = text;
    toast.style.color = color;
    toast.style.left = `${x || (window.innerWidth / 2 - 45)}px`;
    toast.style.top = `${y || (window.innerHeight / 2 - 25)}px`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 800);
};

// Micro-animação Visual de Toque (Ripple Tátil)
document.addEventListener('pointerdown', (e) => {
    if (e.clientX && e.clientY) {
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple-circle';
        ripple.style.left = `${e.clientX - 16}px`;
        ripple.style.top = `${e.clientY - 16}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 350);
    }
}, { passive: true });

// Overlay Cinemático de Bounty / Wasted
window.showBountyWastedBanner = function(hunter, prey, reward) {
    const el = document.getElementById('bounty-wasted-overlay');
    if (!el) return;
    document.getElementById('bounty-hunter-name').innerText = hunter.name;
    document.getElementById('bounty-prey-name').innerText = prey.name;
    document.getElementById('bounty-reward-val').innerText = `+${reward} Pts`;
    el.style.display = 'flex';
    
    if (typeof window.gsap !== 'undefined') {
        window.gsap.fromTo('#bounty-stamp-box', 
            { scale: 3.5, opacity: 0, rotation: -20 }, 
            { scale: 1, opacity: 1, rotation: -5, duration: 0.4, ease: 'back.out(2)' }
        );
        window.gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    }

    setTimeout(() => {
        if (typeof window.gsap !== 'undefined') {
            window.gsap.to(el, { opacity: 0, duration: 0.35, onComplete: () => { el.style.display = 'none'; } });
        } else {
            el.style.display = 'none';
        }
    }, 2800);
};

// Exportador de Pôster da Guerra (Atalho direto para modal in-app)
appCore.exportNightPoster = function() {
    appCore.verPosterInApp();
};

window.addEventListener('DOMContentLoaded', () => {
    appCore.nav('screen-home');
    store.syncSettingsUI();
    window.renderPlayers();
    appCore.renderHomeGrid();
});