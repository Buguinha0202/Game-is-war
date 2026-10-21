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

class GameStore {
    players = [];
    teams = [];
    bench = [];
    currentGameActive = '';
    currentEvent = null;
    isBetting = false;
    isMarioKart = false;
    isEvents = true;
    isChaos = false;
    isRoles = true;
    isSoundOn = true;
    isVibOn = true;
    tourneyTarget = 100;
    tourneyPool = [];
    tourneyAllowedGames = [];
    tournamentMode = false;
    gameConfigs = { time: 60, sensibilidade: 25, modes: 'classico', themes: [] };

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
                tourneyTarget: this.tourneyTarget
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
        let globalMult = (this.currentEvent !== null || this.isBetting) ? 2 : 1;
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

        if (this.isBetting && Array.isArray(resultPayload.losers)) {
            resultPayload.losers.forEach(id => {
                const lp = this.players.find(x => x.id === id);
                if (lp) {
                    lp.score = Math.max(0, lp.score - 10);
                    if (!punishedPlayer) punishedPlayer = lp;
                }
            });
        }

        // Reseta Aposta de Sangue para a próxima rodada
        this.isBetting = false;
        const btnAposta = document.getElementById('btn-lobby-aposta');
        if (btnAposta) {
            btnAposta.innerText = '🎲 Aposta de Sangue (Desligada)';
            btnAposta.style.color = 'var(--pop-cyan)';
        }

        this.save();
        this.updateStreakBadge();
        window.renderPlayers();
        bus.emit('state:updated');

        if (punishedPlayer) {
            setTimeout(() => appCore.dispararPrenda(punishedPlayer), 1200);
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
                isBetting: store.isBetting,
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

    constructor() {
        bus.on('audio:play', p => this.#playSfx(p));
        bus.on('audio:filter', p => this.#setFilter(p));

        const unlock = () => {
            this.#initCtx();
            ['click', 'touchstart', 'pointerdown'].forEach(ev => document.removeEventListener(ev, unlock));
        };
        ['click', 'touchstart', 'pointerdown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, passive: true }));
    }

    #initCtx() {
        if (this.#ctx) {
            if (this.#ctx.state === 'suspended') this.#ctx.resume();
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
    { id: 'completa', title: 'Completa', icon: '🧩', catName: 'Competição de Equipes', catKey: 'team', min: 3, badge: 'Speedrun de 40s', hook: '2 dadores de dica alternam palavras, gritam COMPLETA e o 3º responde em 40s!' },
    { id: 'mimica', title: 'Mímica', icon: '🤹', catName: 'Competição de Equipes', catKey: 'team', min: 2, badge: 'Ação Sem Sons', hook: 'Escolha a dificuldade da carta (Fácil, Média, Difícil) e atue sem emitir sons!' },

    { id: 'stop', title: 'Stop de Roda', icon: '🛑', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Letra Rápida', hook: 'O tempo diminui a cada palavra falada! Quem travar é eliminado da roda!' },
    { id: 'sevira', title: 'Se Vira', icon: '⏱️', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Pavio Curto', hook: 'A bomba acelera a cada eliminado! Fale um item, passe o celular e sobreviva!' },
    { id: 'cinco', title: '5 Segundos', icon: '✋', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Diga 3 Coisas', hook: 'Parece fácil... até você ter que falar 3 coisas no ritmo dos 5 bipes sonoros!' },
    { id: 'batata', title: 'Batata Quente', icon: '💣', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 3, badge: 'Sensor de Tremor', hook: 'Passe com cuidado extremo: trepidações e tempo secreto detonam a bomba!' },
    { id: 'ultimo', title: 'Último a Falar', icon: '☠️', catName: 'Roda de Adrenalina', catKey: 'adrenaline', min: 2, badge: 'Eliminação Súbita', hook: 'Contagem 3, 2, 1... Tema surpresa na tela! Quem falar por último é eliminado!' }
];

appCore.showcaseIdx = 0;

appCore.renderShowcaseCard = function(animateDir = 0) {
    const list = window.gameCatalog;
    if (!list || !list.length) return;
    
    if (appCore.showcaseIdx < 0) appCore.showcaseIdx = list.length - 1;
    if (appCore.showcaseIdx >= list.length) appCore.showcaseIdx = 0;

    const game = list[appCore.showcaseIdx];
    const card = document.getElementById('showcase-active-card');
    const indicator = document.getElementById('showcase-indicator-text');
    const dotsTrack = document.getElementById('showcase-dots');

    if (indicator) {
        indicator.innerText = `Jogo ${appCore.showcaseIdx + 1} de ${list.length}`;
    }

    if (dotsTrack) {
        dotsTrack.innerHTML = list.map((_, i) => 
            `<div class="showcase-dot ${i === appCore.showcaseIdx ? 'active' : ''}" onclick="appCore.jumpToShowcase(${i})"></div>`
        ).join('');
    }

    if (card) {
        card.className = `showcase-card cat-${game.catKey}`;
        card.innerHTML = `
            <div>
                <span class="card-cat-badge">${game.catName}</span>
                <div class="card-game-icon">${game.icon}</div>
                <h1 class="card-game-title">${game.title}</h1>
                <div class="card-game-meta">Mín ${game.min} Guerreiros • ${game.badge}</div>
                <p class="card-game-hook">"${game.hook}"</p>
            </div>
            <button class="card-play-btn" onclick="appCore.openGameLobby('${game.id}')">
                JOGAR ESTE ➔
            </button>
        `;

        if (animateDir !== 0 && typeof window.gsap !== 'undefined') {
            window.gsap.fromTo(card, 
                { x: animateDir * 70, opacity: 0.3, rotation: animateDir * 4 }, 
                { x: 0, opacity: 1, rotation: 0, duration: 0.28, ease: 'back.out(1.8)' }
            );
        }
    }
};

appCore.showcaseNav = function(dir) {
    appCore.showcaseIdx += dir;
    window.hapticTap();
    window.playSound('pop');
    appCore.renderShowcaseCard(dir);
};

appCore.jumpToShowcase = function(idx) {
    const dir = idx > appCore.showcaseIdx ? 1 : -1;
    appCore.showcaseIdx = idx;
    window.hapticTap();
    window.playSound('pop');
    appCore.renderShowcaseCard(dir);
};

appCore.bindShowcaseGestures = function() {
    const wrapper = document.getElementById('showcase-card-wrapper');
    if (!wrapper || wrapper._gesturesBound) return;
    wrapper._gesturesBound = true;

    let startX = 0, currentX = 0, isDragging = false;

    wrapper.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        startX = e.clientX;
        currentX = e.clientX;
        isDragging = true;
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        currentX = e.clientX;
        const diffX = currentX - startX;
        const card = document.getElementById('showcase-active-card');
        if (card && Math.abs(diffX) < 120) {
            card.style.transform = `translateX(${diffX * 0.45}px) rotate(${diffX * 0.04}deg)`;
        }
    });

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        const diffX = currentX - startX;
        const card = document.getElementById('showcase-active-card');
        if (card) card.style.transform = '';

        if (diffX < -45) {
            appCore.showcaseNav(1);
        } else if (diffX > 45) {
            appCore.showcaseNav(-1);
        }
    };

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
};

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
                    <span class="catalog-row-meta">Mín ${g.min} Guerreiros • ${g.badge}</span>
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
        minPlayers: 'Mín 3 Guerreiros',
        tagline: 'Descubra quem não sabe a palavra secreta antes que a mesa seja enganada!',
        steps: [
            { title: 'Passe o Celular', desc: 'Inocentes recebem Tema + Palavra Secreta. O Impostor recebe apenas o Tema e fica no escuro!' },
            { title: 'Perguntas Sutis', desc: 'Façam perguntas indiretas em roda. Cuidado para não entregar a palavra ao Impostor!' },
            { title: 'Votação no Tribunal', desc: 'Debatam e votem no suspeito. Inocentes vencem acertando o Impostor (+10 Pts)!' }
        ],
        goldenRule: 'O melhor Impostor não fica em silêncio: dê respostas neutras que se encaixem em quase tudo!',
        rolesInfo: '🤡 Bobo da Corte: Sabe a palavra real, mas vence sozinho (+25 Pts) se a mesa votar nele no tribunal!'
    },
    duplas: {
        icon: '👯',
        minPlayers: 'Mín 5 Guerreiros',
        tagline: 'Encontre seu par secreto sem entregar sua identidade ao Infiltrado Solitário!',
        steps: [
            { title: 'Pares Secretos', desc: 'O celular distribui palavras que formam duplas (ex: Batman e Coringa). Um jogador fica avulso (Infiltrado)!' },
            { title: 'Dicas Indiretas', desc: 'Vão conversando na mesa para identificar seu parceiro sem falar as palavras abertamente.' },
            { title: 'Eliminar Infiltrado', desc: 'Achem e votem na pessoa que não tem par antes que ela descubra as duplas!' }
        ],
        goldenRule: 'Não fale palavras óbvias demais: se o infiltrado perceber a ligação, ele rouba o seu lugar!',
        rolesInfo: '🤡 Bobo da Corte: Tenta se passar pelo infiltrado para ser eliminado e vencer (+25 Pts) sozinho!'
    },
    macabro: {
        icon: '🔪',
        minPlayers: 'Mín 2 Guerreiros',
        tagline: 'Desvende o mistério bizarro fazendo apenas perguntas de Sim ou Não ao narrador!',
        steps: [
            { title: 'O Enigma', desc: 'O narrador lê a situação sinistra em voz alta e segura o botão para ler a resposta secreta.' },
            { title: 'Interrogatório', desc: 'A mesa faz perguntas livres. O narrador responde apenas SIM, NÃO ou IRRELEVANTE.' },
            { title: 'Caso Resolvido', desc: 'Quando a mesa reconstruir toda a história, toquem em "Desvendado" (+15 Pts para todos)!' }
        ],
        goldenRule: 'Profissões, metáforas e detalhes sutis de tempo/clima quase sempre escondem a chave do mistério!'
    },
    posicao: {
        icon: '📈',
        minPlayers: 'Mín 3 Guerreiros',
        tagline: 'Organize as cartas de 1 a 10 apenas com dicas conceituais de intensidade!',
        steps: [
            { title: 'Notas Secretas', desc: 'Cada um recebe um número secreto de 1 a 10 no celular sobre o tema sorteado.' },
            { title: 'Dicas na Mesa', desc: 'Dêem dicas orais expressando a intensidade do seu número (terminantemente proibido falar dígitos!).' },
            { title: 'Ordenar na Tela', desc: 'Arrumem a lista na ordem crescente do menor para o maior e apertem "Verificar Gabarito"!' }
        ],
        goldenRule: 'Crie analogias claras: se 1 é um sopro e 10 é um furacão, calibre a sua intensidade com precisão!',
        rolesInfo: '🧨 Sabotador: Se a mesa errar a ordem, o Sabotador rouba +20 Pts sozinho!'
    },
    nota: {
        icon: '🎯',
        minPlayers: 'Mín 2 Guerreiros (Em Dupla)',
        tagline: 'Segure para ver a nota secreta e calibre a sintonia da dupla com perguntas temáticas!',
        steps: [
            { title: 'Segure para Ver', desc: 'O Parceiro 1 segura o botão na tela para ver a nota (1 a 10) sem ninguém espiar.' },
            { title: 'Perguntas de Calibração', desc: 'O Parceiro 2 faz perguntas temáticas ("Comida, Filme ou Música com essa nota?") para calibrar.' },
            { title: 'Chute da Dupla', desc: 'O Parceiro 2 escolhe no seletor 1 a 10. Na mosca = +20 Pts para a dupla!' }
        ],
        goldenRule: 'Use as sugestões de perguntas para calibrar se um 7 é bom ou se é só aceitável!'
    },
    unica: {
        icon: '💡',
        minPlayers: 'Mín 3 Guerreiros',
        tagline: 'Dicas repetidas são ANULADAS! Seja criativo para ajudar o adivinhador!',
        steps: [
            { title: 'Olhos Fechados', desc: 'O Adivinhador fecha os olhos enquanto o celular passa pela roda.' },
            { title: '1 Dica por Pessoa', desc: 'Cada um digita secretamente 1 única palavra como pista da palavra secreta.' },
            { title: 'Filtro Automático', desc: 'O jogo anula todas as dicas repetidas! O Adivinhador chuta usando apenas as pistas únicas.' }
        ],
        goldenRule: 'Fuja do óbvio: a palavra mais comum sempre será pensada por duas pessoas e acabará anulada!'
    },
    quemsoueu: {
        icon: '🤔',
        minPlayers: 'Mín 4 Guerreiros (2 Equipes)',
        tagline: 'Celular deitado na mesa! Cada equipe pergunta e responde entre si: quem acertar primeiro vence!',
        steps: [
            { title: 'Celular na Mesa', desc: 'Coloque o celular deitado entre as duas equipes. Cada parceiro que responde olha a palavra do seu colega.' },
            { title: 'Perguntas Exclusivas', desc: 'As duas equipes jogam ao mesmo tempo! Você só responde "Sim / Não" para o seu parceiro.' },
            { title: 'Corrida sem Limite', desc: 'Sem pressão de cronômetro: a equipe que acertar primeiro toca no seu botão e leva +20 Pts para o time!' }
        ],
        goldenRule: 'Responda rápido para o seu parceiro não perder tempo enquanto a outra equipe pergunta!'
    },
    megasenha: {
        icon: '🗣️',
        minPlayers: 'Mín 4 Guerreiros (2 Duplas)',
        tagline: 'Duelo de 5 senhas: dê 1 palavra por vez até sua dupla acertar primeiro!',
        steps: [
            { title: 'Oradores na Tela', desc: 'Os dois oradores olham a mesma senha secreta na tela.' },
            { title: 'Vez Alternada', desc: 'Time A dá 1 palavra de dica. Se errar, Time B dá 1 palavra. Alterna até alguém acertar!' },
            { title: 'Melhor de 5 Senhas', desc: 'A dupla que acertar a senha fatura +10 Pts. Quem somar mais em 5 palavras vence a rodada!' }
        ],
        goldenRule: 'Proibido falar palavras da mesma família ou gesticular!'
    },
    completa: {
        icon: '🧩',
        minPlayers: 'Mín 3 Guerreiros',
        tagline: 'Speedrun de 40s! 2 dadores de dica alternam palavras, gritam "COMPLETA!" na vida real e o 3º responde!',
        steps: [
            { title: 'A Corrida dos 40s', desc: 'O relógio de 40 segundos começa a correr para abrir até 8 palavras do tema.' },
            { title: 'Alternância e Voz', desc: 'Jogador 1 fala 1 palavra, Jogador 2 fala 1 palavra. Quando a pista estiver pronta, gritem "COMPLETA!" na vida real.' },
            { title: 'Chute do Adivinhador', desc: 'O Jogador 3 responde na hora. Acertou? +10 Pts e a próxima palavra entra imediatamente!' }
        ],
        goldenRule: 'Seja veloz: se a dica ficou clara em 2 palavras, gritem COMPLETA na hora sem hesitar!'
    },
    mimica: {
        icon: '🤹',
        minPlayers: 'Mín 2 Guerreiros',
        tagline: 'O Ator escolhe a dificuldade e arrisca os pontos; quem adivinhar primeiro leva bônus!',
        steps: [
            { title: 'Escolha do Ator', desc: 'O ator escolhe na tela o nível de risco: Fácil (+10), Média (+20) ou Difícil (+30).' },
            { title: 'Atuação Muda', desc: 'Gere gestos sem emitir sons. A mesa toda tenta adivinhar o mais rápido possível.' },
            { title: 'Pontos Divididos', desc: 'O Ator ganha os pontos da carta arriscada! O Adivinhador rápido ganha +10 Pts de bônus!' }
        ],
        goldenRule: 'Indique com os dedos no início quantas palavras tem a mímica!'
    },
    stop: {
        icon: '🛑',
        minPlayers: 'Mín 2 Guerreiros',
        tagline: 'O tempo cai a cada acerto! Quem travar é eliminado e os sobreviventes seguem com novo tema!',
        steps: [
            { title: 'Letra & Aceleração', desc: 'Fale uma palavra no tema com a letra sorteada. A cada acerto, o tempo encurta!' },
            { title: 'Eliminação da Rodada', desc: 'O relógio zerou? Aponte quem travou. Essa pessoa sai da rodada.' },
            { title: 'Sobrevivência', desc: 'Novo tema e letra sorteados para os sobreviventes até restar o campeão da mesa (+25 Pts)!' }
        ],
        goldenRule: 'Mantenha o foco absoluto: nas rodadas avançadas o tempo é relâmpago!'
    },
    sevira: {
        icon: '⏱️',
        minPlayers: 'Mín 2 Guerreiros',
        tagline: 'A bomba acelera a cada eliminado! Fale um item, passe o celular e sobreviva!',
        steps: [
            { title: 'Bomba Ticando', desc: 'Fale um item da categoria e passe o celular rápido tocando no botão.' },
            { title: 'Quem Estourou Sai', desc: 'Ao explodir, selecione na tela quem estava segurando a bomba.' },
            { title: 'Pavio Encurtando', desc: 'A próxima rodada começa com pavio 30% mais curto para os sobreviventes!' }
        ],
        goldenRule: 'Já entregue o celular na direção do próximo enquanto fala a sua resposta!'
    },
    cinco: {
        icon: '✋',
        minPlayers: 'Mín 2 Guerreiros',
        tagline: 'Parece fácil... até você ter que falar 3 coisas em exatos 5 segundos!',
        steps: [
            { title: 'O Desafio', desc: 'A tela exibe o desafio: "Diga 3... (ex: Marcas de Carro)".' },
            { title: '5 Bipes Curtos', desc: 'Ao disparar, você tem 5 segundos contados nos bipes sonoros para falar tudo.' },
            { title: 'Julgamento', desc: 'A mesa decide se as 3 respostas foram válidas e se você não gaguejou.' }
        ],
        goldenRule: 'Fale o que vier no impulso sem filtrar, porque se você pensar meio segundo o tempo acaba!'
    },
    batata: {
        icon: '💣',
        minPlayers: 'Mín 3 Guerreiros',
        tagline: 'Passe suave! A cada explosão a tensão sobe com tempo secreto ainda mais rápido!',
        steps: [
            { title: 'Passe com Calma', desc: 'Segure o celular com máxima estabilidade e passe na roda com movimentos suaves.' },
            { title: 'Sensor de Tremor', desc: 'Movimentos bruscos, balanços rápidos ou solavancos detonam a bomba na hora!' },
            { title: 'Pavio Curto', desc: 'A rodada seguinte recomeça com tempo secreto reduzido até o sobrevivente final!' }
        ],
        goldenRule: 'Não tente acelerar o passe: a bomba perdoa lentidão, mas odeia solavancos!'
    },
    ultimo: {
        icon: '☠️',
        minPlayers: 'Mín 2 Guerreiros',
        tagline: 'Contagem 3, 2, 1... Tema surpresa na tela! Quem falar por último é eliminado!',
        steps: [
            { title: 'Contagem 3.. 2.. 1..', desc: 'Suspense na tela! O tema surge de surpresa após o alarme sonoro.' },
            { title: 'Gritaria na Roda', desc: 'Todos falam um item em roda rapidamente.' },
            { title: 'Apontar Eliminado', desc: 'Quem hesitou, repetiu ou falou por último é eliminado. Novo tema para quem sobrou!' }
        ],
        goldenRule: 'Tenha 2 ou 3 itens na ponta da língua assim que bater os olhos no tema!'
    }
};

window.gameInstructions = {
    impostor: "Inocentes recebem tema e palavra secreta. O Impostor recebe só o tema e NÃO sabe a palavra! Debatam, façam perguntas indiretas e votem no suspeito.",
    duplas: "Jogadores formam pares secretos com a mesma palavra. Há 1 ou 2 Infiltrados na mesa. Ache sua dupla sem entregar a palavra ao impostor!",
    macabro: "O Mestre lê o enigma mórbido. A mesa faz perguntas de 'Sim' ou 'Não' até desvendar a história completa.",
    posicao: "Todos recebem secretamente números de 1 a 10 para uma escala temática. Sem falar números, dêem dicas e arranjem as cartas na ordem crescente correta!",
    nota: "O jogador vê secretamente uma nota de 1 a 10 e a esconde. Dá uma dica verbal daquela intensidade e a mesa chuta o número no seletor!",
    unica: "O Adivinhador fecha os olhos. Todos digitam 1 palavra de dica no celular. Dicas repetidas são ANULADAS automaticamente pelo jogo!",
    quemsoueu: "Cole o celular na testa! A mesa grita pistas da palavra e você toca em ACERTOU ou PULAR antes do tempo acabar.",
    megasenha: "Em duplas: um guerreiro dá dicas de 1 única palavra e o parceiro tenta acertar a senha antes que o relógio zere.",
    completa: "Painel com 8 palavras do tema. A equipe dá dicas e tenta abrir todas as 8 caixas antes do cronômetro zerar.",
    mimica: "Um guerreiro faz mímica para a equipe adivinhar a ação ou personagem. Sons são terminantemente proibidos!",
    stop: "Sorteia Tema + Letra com timer rápido de 10s. Quem falar uma palavra válida toca no botão para trocar a letra e resetar o tempo!",
    sevira: "A bomba vai estourar! Fale um item da categoria exibida e passe o celular rápido para o próximo guerreiro da roda.",
    cinco: "A tela mostra 'Diga 3...'. Ao disparar, o guerreiro tem exatos 5 Segundos para falar tudo sem gaguejar!",
    batata: "Passe o celular com cuidado! O tempo é surpresa e qualquer movimento brusco faz o sensor de aceleração explodir a bomba!",
    ultimo: "Tema livre na tela com cronômetro de 8s. A mesa vai falando itens em roda. Quem demorar ou repetir perde a vida!"
};

window.categoriasIniciais = {
    'Animais': ['Leão','Tigre','Elefante','Cachorro','Gato','Girafa','Crocodilo','Águia','Pinguim','Urso','Lobo','Tartaruga','Cobra','Sapo','Baleia','Tubarão','Gorila','Capivara','Macaco'],
    'Comida': ['Pizza','Hambúrguer','Sushi','Lasanha','Salada','Sorvete','Churrasco','Bolo','Pastel','Macarronada','Feijoada','Taco','Batata Frita','Chocolate','Coxinha'],
    'Famosos': ['Silvio Santos','Anitta','Michael Jackson','Neymar','Rihanna','Will Smith','Beyoncé','Leonardo DiCaprio','Tom Cruise','Faustão','Xuxa'],
    'Ciências': ['Tabela Periódica','Átomo','Laboratório','Reação','Microscópio','DNA','Molécula','Ácido','Gravidade','Fóssil','Buraco Negro'],
    'Cinema & TV': ['Pipoca','Oscar','Diretor','Bilheteria','Tela Grande','Vilão','Super-Herói','Dublê','Roteiro','Trilha Sonora','Zumbi'],
    'Lugares': ['Hospital','Cassino','Submarino','Estação Espacial','Circo','Aeroporto','Navio Pirata','Escola','Restaurante','Prisão']
};

window.caosWords = ['Motel', 'Preservativo', 'Ressaca', 'Gemido', 'Traição', 'Calcinha', 'Cabaré', 'Algemas', 'Orgia', 'Tatuagem Íntima', 'OnlyFans', 'Cerveja', 'Tinder', 'Nude'];

window.prendasLista = [
    { t: "Falar com Sotaque", d: "Fale com sotaque francês ou caipira até o final da próxima rodada!" },
    { t: "Cantar uma Canção", d: "Cante o refrão de uma música infantil como se fosse um cantor de ópera!" },
    { t: "Foto da Galeria", d: "Mostre a última foto da sua galeria do celular para a mesa!" },
    { t: "Elogio Constrangedor", d: "Faça um elogio poético e super dramático para quem estiver à sua direita!" },
    { t: "Mímica Secreta", d: "Imite uma galinha chocando um ovo por 10 segundos sem rir!" },
    { t: "10 Polichinelos", d: "Levante agora e pague 10 polichinelos gritando 'Sou um guerreiro!'." }
];

window.prendasCaos = [
    { t: "Mande um Áudio", d: "Mande um áudio no grupo da família rindo igual a uma hiena por 5 segundos!" },
    { t: "Verdade ou Mico", d: "Revele qual foi a mensagem mais constrangedora que você mandou essa semana!" },
    { t: "Estátua Humana", d: "Fique na pose mais ridícula possível até a sua vez chegar no próximo jogo!" },
    { t: "História Secreta", d: "Conte o maior mico que você já passou bêbado(a)!" }
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
    if (!n) return window.showCustomAlert("Atenção", "Digite um nome para forjar seu guerreiro!", "✏️");
    if (!editingPlayerId && store.players.length >= 20) return window.showCustomAlert("Arena Lotada", "Máximo de 20 guerreiros atingido.", "🛡️");

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
    if (screenId === 'screen-home' || screenId === 'screen-players' || screenId === 'screen-tourney-setup') {
        if (window.GIW?.runner) window.GIW.runner.abortCurrentGame();
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
        window.gsap.fromTo(next, { opacity: 0, y: 14, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: 'power2.out' });
    }
    document.querySelectorAll('#nav-player-count').forEach(e => e.innerText = store.players.length);
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    if (screenId === 'screen-home') document.getElementById('nav-btn-home')?.classList.add('active');
    else if (screenId === 'screen-players') document.getElementById('nav-btn-players')?.classList.add('active');
    else if (screenId === 'screen-tourney-setup') document.getElementById('nav-btn-tourney')?.classList.add('active');
    bus.emit('state:updated');
};

appCore.stopAudioAndNav = function(screenId) {
    if (window.GIW?.runner) window.GIW.runner.abortCurrentGame();
    appCore.nav(screenId);
};

appCore.openModal = function(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.style.display = 'flex';
    if (id === 'store-modal') appCore.atualizarLojaNegra();
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
    document.getElementById('ca-title').innerText = title;
    document.getElementById('ca-text').innerText = message;
    document.getElementById('ca-icon').innerText = icon;
    appCore.openModal('custom-alert-modal');
    window.vibrar(120);
    window.playBeep(true);
};

window.showPlayerSelectorModal = function({ icon = '🎯', title = 'Quem Adivinhou?', subtitle = 'Toque no guerreiro correspondente:', players = [], onSelect, cancelable = false }) {
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

window.renderPlayers = function() {
    const c = document.getElementById('players-card-grid');
    if (!c) return;
    c.innerHTML = '';
    let totalScore = 0;

    if (store.players.length === 0) {
        c.innerHTML = '<p style="color:var(--ink-muted); font-weight:800; text-align:center; width:100%; margin-top:20px;">Nenhum guerreiro forjado.</p>';
    } else {
        store.players.forEach(p => {
            totalScore += p.score;
            c.innerHTML += `
                <div style="position:relative;">
                    ${window.generateCardHTML(p, '', `onclick="appCore.editarPlayer('${p.id}')"`)}
                    <button class="nav-icon-btn" style="position:absolute; top:-6px; right:-6px; background:var(--pop-magenta); color:white; width:26px; height:26px; font-size:0.8em; padding:0; z-index:20;" onclick="appCore.removePlayer('${p.id}')">✕</button>
                </div>
            `;
        });
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
    if (btnEnc) btnEnc.style.display = totalScore > 0 ? 'block' : 'none';

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
        title: "Apagar Todos os Guerreiros?",
        text: "Deseja realmente apagar todos os guerreiros da arena?<br>Essa ação não poderá ser desfeita!",
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
    window.showCustomAlert("Mágica Concluída", "5 Guerreiros invocados com estilo Duolingo!", "🪄");
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

    let ticks = 0;
    const maxTicks = 8;
    const tickInterval = setInterval(() => {
        appCore.showcaseIdx = (appCore.showcaseIdx + 1) % list.length;
        appCore.renderShowcaseCard(1);
        window.playSound('pop');
        window.hapticTap();
        ticks++;
        if (ticks >= maxTicks) {
            clearInterval(tickInterval);
            const chosen = pool[Math.floor(Math.random() * pool.length)];
            appCore.showcaseIdx = list.findIndex(g => g.id === chosen.id);
            appCore.renderShowcaseCard(1);

            window.playSound('victory');
            window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 75 });
            
            window.showCustomAlert(
                '🎰 Minigame Sorteado!',
                `A roleta parou em:\n<b style="font-size:1.35em; color:var(--pop-yellow);">${chosen.title.toUpperCase()}</b>!\n\nEntrando no lobby da rodada...`,
                '🎲'
            );
            setTimeout(() => {
                appCore.closeModal('alert-modal');
                appCore.openGameLobby(chosen.id);
            }, 1300);
        }
    }, 80);
};

appCore.openGameLobby = function(gameId) {
    const gameMeta = (window.gameCatalog || []).find(g => g.id === gameId);
    const min = gameMeta ? gameMeta.min : 2;
    if (store.players.length < min) {
        if (store.players.length === 0) {
            appCore.abrirCriador();
            return window.showCustomAlert('Faltam Guerreiros', `Este minigame exige no mínimo ${min} jogadores na mesa. Forje o primeiro guerreiro agora!`, '🛡️');
        } else {
            appCore.nav('screen-players');
            return window.showCustomAlert('Faltam Guerreiros', `Este minigame exige ${min} guerreiros (você tem ${store.players.length}). Crie mais ${min - store.players.length} ou use a Mágica 🪄!`, '👥');
        }
    }

    store.currentGameActive = gameId;
    store.isBetting = false;
    const btnAposta = document.getElementById('btn-lobby-aposta');
    if (btnAposta) {
        btnAposta.innerText = '🎲 Aposta de Sangue (Desligada)';
        btnAposta.style.color = 'var(--pop-cyan)';
    }
    document.getElementById('lobby-title').innerText = (window.gameTitles[gameId] || gameId).toUpperCase();
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
    const goldenText = document.getElementById('rm-golden-text');
    const rolesBox = document.getElementById('rm-roles-box');
    const rolesText = document.getElementById('rm-roles-text');

    if (titleEl) titleEl.innerText = window.gameTitles[gid] || gid;
    if (iconEl) iconEl.innerText = guide.icon || '🎮';
    if (badgeEl) badgeEl.innerText = guide.minPlayers || 'Todos';
    if (taglineEl) taglineEl.innerText = `"${guide.tagline}"`;

    if (stepsCont) {
        stepsCont.innerHTML = guide.steps.map((st, i) => `
            <div class="rule-step-card">
                <div class="rule-step-num">${i + 1}</div>
                <div class="rule-step-body">
                    <div class="rule-step-title">${st.title}</div>
                    <div class="rule-step-desc">${st.desc}</div>
                </div>
            </div>
        `).join('');
    }

    if (goldenText) goldenText.innerText = guide.goldenRule || 'Foque no objetivo e divirta-se com a mesa!';

    if (rolesBox && rolesText) {
        if (guide.rolesInfo && (store.isRoles ?? true)) {
            rolesBox.style.display = 'block';
            rolesText.innerText = guide.rolesInfo;
        } else {
            rolesBox.style.display = 'none';
        }
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

appCore.toggleAposta = function() {
    store.isBetting = !store.isBetting;
    const btn = document.getElementById('btn-lobby-aposta');
    if (btn) {
        btn.innerText = store.isBetting ? '🎲 Aposta de Sangue (ATIVADA!)' : '🎲 Aposta de Sangue (Desligada)';
        btn.style.color = store.isBetting ? 'var(--pop-yellow)' : 'var(--pop-cyan)';
    }
    if (store.isBetting) window.showCustomAlert("Aposta de Sangue!", "Quem perder nesta rodada sofrerá -10 Pts e levará um Castigo da Mesa!", "🎲");
};

appCore.renderLobbySettings = function(gameId) {
    const box = document.getElementById('game-specific-configs');
    box.innerHTML = '';
    let html = '';

    const needsThemes = ['impostor', 'duplas', 'megasenha', 'completa', 'mimica', 'unica', 'quemsoueu'];
    if (needsThemes.includes(gameId)) {
        appCore.renderThemesModal();
        html += `<button class="btn btn-dark" style="margin-bottom:12px;" onclick="appCore.openModal('themes-modal')">🏷️ Escolher Temas da Partida</button>`;
    }

    if (gameId === 'impostor') {
        html += `<div style="font-size:0.85em; font-weight:900; margin-bottom:4px; text-transform:uppercase;">Tempo de Discussão</div><select id="config-time" class="brutal-input"><option value="120">2 Minutos</option><option value="240" selected>4 Minutos</option><option value="360">6 Minutos</option></select>`;
    } else if (gameId === 'batata') {
        html += `<div style="font-size:0.85em; font-weight:900; margin-bottom:4px; text-transform:uppercase;">Sensibilidade do Sensor</div><select id="config-sens" class="brutal-input"><option value="35">Baixa (Menos estouros)</option><option value="25" selected>Normal</option><option value="15">Alta (Qualquer tremor explode!)</option></select>`;
    } else if (['mimica', 'sevira', 'megasenha', 'completa'].includes(gameId)) {
        html += `<div style="font-size:0.85em; font-weight:900; margin-bottom:4px; text-transform:uppercase;">Tempo da Rodada</div><select id="config-time" class="brutal-input"><option value="30">30 Segundos</option><option value="45">45 Segundos</option><option value="60" selected>60 Segundos</option></select>`;
    }

    box.style.display = html ? 'block' : 'none';
    box.innerHTML = html;
};

appCore.renderThemesModal = function() {
    const c = document.getElementById('themes-modal-container');
    if (!c) return;
    c.innerHTML = '';
    Object.keys(window.categoriasIniciais).forEach(cat => {
        const isSel = store.gameConfigs.themes.includes(cat);
        c.innerHTML += `<button class="chip ${isSel ? 'on' : ''}" onclick="appCore.toggleTheme('${cat}', this)">${cat}</button>`;
    });
};

appCore.toggleTheme = function(cat, el) {
    if (store.gameConfigs.themes.includes(cat)) {
        store.gameConfigs.themes = store.gameConfigs.themes.filter(x => x !== cat);
        el.classList.remove('on');
    } else {
        store.gameConfigs.themes.push(cat);
        el.classList.add('on');
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 300);
    }
    window.playSound('pop');
    window.hapticTap();
};

let selectedSwap = null;
appCore.setupLobbyTeams = function(gameId) {
    const reqSize = (gameId === 'completa') ? 3 : (['megasenha', 'nota'].includes(gameId)) ? 2 : 1;
    const shuf = [...store.players].sort(() => Math.random() - 0.5);
    store.teams = [];
    store.bench = [];

    if (gameId === 'quemsoueu' && shuf.length >= 2) {
        store.teams.push({ id: 0, players: [shuf[0]], score: 0 });
        store.teams.push({ id: 1, players: [shuf[1]], score: 0 });
        store.bench = shuf.slice(2);
    } else if (gameId === 'megasenha') {
        store.teams.push({ id: 0, players: shuf.slice(0, 2), score: 0 });
        store.teams.push({ id: 1, players: shuf.slice(2, 4), score: 0 });
        store.bench = shuf.slice(4);
    } else if (reqSize > 1) {
        let nt = Math.floor(shuf.length / reqSize);
        if (nt === 0) nt = 1;
        let idx = 0;
        for (let i = 0; i < nt; i++) {
            store.teams.push({ id: i, players: shuf.slice(idx, idx + reqSize), score: 0 });
            idx += reqSize;
        }
        store.bench = shuf.slice(idx);
    } else {
        store.teams.push({ id: 0, players: shuf, score: 0 });
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
    c.innerHTML = '';

    store.teams.forEach(t => {
        const pHTML = t.players.map((p, pIdx) => {
            const isSel = selectedSwap && !selectedSwap.isBench && selectedSwap.tId === t.id && selectedSwap.pIdx === pIdx;
            return `
                <div onclick="clickSwapTarget(${t.id}, ${pIdx}, false)" style="transition:0.15s; ${isSel ? 'transform:scale(1.1); filter:drop-shadow(0 0 10px var(--pop-cyan));' : ''}">
                    ${window.generateCardHTML(p).replace('width: 104px; height: 148px;', 'width: 76px; height: 108px; font-size:0.75em;')}
                </div>
            `;
        }).join('');

        c.innerHTML += `
            <div style="background:var(--bg-surface); border-radius:18px; padding:14px; border:var(--border-brutal-sm); box-shadow:var(--shadow-brutal-sm);">
                <div style="color:var(--ink-white); font-weight:900; margin-bottom:8px;">${store.teams.length > 1 ? `Equipe ${t.id + 1}` : 'Guerreiros Titulares'}</div>
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

        c.innerHTML += `
            <div style="background:var(--bg-surface-elevated); border-radius:18px; padding:14px; border:2px dashed var(--pop-magenta);">
                <div style="color:var(--pop-magenta); font-weight:900; margin-bottom:8px;">Guerreiros na Reserva</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${bHTML}</div>
            </div>
        `;
    }
};

appCore.atualizarLojaNegra = function() {
    const runner = window.GIW.runner;
    const activeGame = runner?.activeGame;
    let balance = 0;
    let name = "Arena Geral";

    if (activeGame && activeGame.teamScores) {
        const tid = activeGame.activeTeam || 0;
        balance = activeGame.teamScores[tid] || 0;
        name = `Equipe ${tid + 1}`;
    } else if (activeGame && typeof activeGame.score === 'number') {
        balance = activeGame.score;
        name = activeGame.players?.[0]?.name || "Jogador Ativo";
    } else {
        const p = activeGame?.players?.[0] || store.players[0];
        balance = p?.score || 0;
        name = p?.name || "Guerreiro";
    }

    const info = document.getElementById('store-team-info');
    if (info) info.innerText = `${name} | Saldo: ${balance} Pts`;

    // Atualiza visual de preços com desconto de 50% se Mario Kart estiver ativo
    const mk = store.isMarioKart;
    const cMordaca = document.getElementById('store-cost-mordaca');
    if (cMordaca) cMordaca.innerText = mk ? '-15 Pts (MK!)' : '-30 Pts';
    const cTempo = document.getElementById('store-cost-tempo');
    if (cTempo) cTempo.innerText = mk ? '-20 Pts (MK!)' : '-40 Pts';
    const cVoz = document.getElementById('store-cost-voz');
    if (cVoz) cVoz.innerText = mk ? '-25 Pts (MK!)' : '-50 Pts';
};

// ==========================================
// 10. SISTEMA DE PRENDAS / CASTIGOS
// ==========================================
let pendingPunishedPlayer = null;
appCore.dispararPrenda = function(player) {
    pendingPunishedPlayer = player;
    const pool = store.isChaos ? [...window.prendasLista, ...window.prendasCaos] : window.prendasLista;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    document.getElementById('prenda-player-name').innerText = `💥 ${player.name} foi Punido(a)!`;
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
    if (store.players.length < 3) {
        appCore.nav('screen-players');
        return window.showCustomAlert('Aviso', 'O Torneio exige pelo menos 3 guerreiros forjados!', '🏆');
    }
    const c = document.getElementById('tourney-games-list');
    if (c) {
        c.innerHTML = '';
        Object.keys(window.gameTitles).forEach(gid => {
            c.innerHTML += `<button class="btn btn-warning btn-sm" style="width:auto;" id="chk-${gid}" onclick="this.classList.toggle('btn-dark'); this.classList.toggle('btn-warning'); window.hapticTap();">${window.gameTitles[gid]}</button>`;
        });
    }
    appCore.nav('screen-tourney-setup');
};

appCore.startTourney = function() {
    store.tourneyAllowedGames = [];
    Object.keys(window.gameTitles).forEach(gid => {
        const el = document.getElementById(`chk-${gid}`);
        if (el && el.classList.contains('btn-warning')) store.tourneyAllowedGames.push(gid);
    });
    if (store.tourneyAllowedGames.length === 0) return window.showCustomAlert("Atenção", "Selecione ao menos 1 minigame para a roleta!");
    store.tourneyTarget = parseInt(document.getElementById('tourney-target').value, 10) || 100;
    store.tournamentMode = true;
    store.tourneyPool = [...store.tourneyAllowedGames].sort(() => Math.random() - 0.5);
    window.playTournamentNext();
};

window.playTournamentNext = function() {
    if (store.tourneyPool.length === 0) store.tourneyPool = [...store.tourneyAllowedGames].sort(() => Math.random() - 0.5);
    const nextGame = store.tourneyPool.pop();
    appCore.nav('screen-tourney-spin');

    const track = document.getElementById('roulette-track');
    if (!track) return;
    track.innerHTML = '';

    const spinItems = [];
    for (let i = 0; i < 20; i++) spinItems.push(store.tourneyAllowedGames[Math.floor(Math.random() * store.tourneyAllowedGames.length)]);
    spinItems.push(nextGame);
    for (let i = 0; i < 8; i++) spinItems.push(store.tourneyAllowedGames[Math.floor(Math.random() * store.tourneyAllowedGames.length)]);

    spinItems.forEach((g, idx) => {
        const isTarget = idx === 20;
        track.innerHTML += `<div id="${isTarget ? 'roleta-alvo' : ''}" style="font-size:1.8em; font-weight:900; color:white; padding:0 35px; display:flex; align-items:center;">${window.gameTitles[g]}</div>`;
    });

    setTimeout(() => {
        const alvo = document.getElementById('roleta-alvo');
        if (!alvo) return;
        const targetMove = -(alvo.offsetLeft + (alvo.offsetWidth / 2));
        if (typeof window.gsap !== 'undefined') {
            window.gsap.to(track, {
                x: targetMove,
                duration: 4.2,
                ease: 'power4.out',
                onUpdate: () => { if (Math.random() < 0.1) window.hapticTap(); },
                onComplete: () => {
                    window.playKaboom();
                    window.vibrar(700);
                    window.gsap.fromTo(alvo, { scale: 1 }, { scale: 1.3, color: 'var(--pop-yellow)', duration: 0.3, yoyo: true, repeat: 3 });
                    setTimeout(() => appCore.openGameLobby(nextGame), 2200);
                }
            });
        }
    }, 150);
};

// Desempate Seguro (Sem destruição de DOM)
let touchFingers = {}, touchDone = false;
const touchColors = ['#ffd600', '#00e5ff', '#ff2a85', '#00e676', '#8b5cf6'];

appCore.encerrarNoite = function() {
    if (store.players.length < 2) return window.showCustomAlert("Aviso", "Precisa de pelo menos 2 guerreiros forjados na mesa para o pódio.");
    const s = [...store.players].sort((a, b) => b.score - a.score);
    if (s[0].score === s[1].score && s[0].score > 0) {
        appCore.nav('screen-tiebreaker');
    } else {
        appCore.renderPodio(s);
    }
};

appCore.runTouchRoleta = function() {
    const existing = document.getElementById('touch-board');
    if (existing) existing.remove();

    const board = document.createElement('div');
    board.id = 'touch-board';
    board.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(9,10,15,0.95); z-index:9999; touch-action:none;';
    board.innerHTML = `<p id="touch-msg" style="color:white; text-align:center; margin-top:20vh; font-size:1.6em; font-weight:900;">Mantenham o dedo na tela!</p>`;
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
        document.getElementById('touch-msg').innerText = "VENCEDOR DEFINIDO!";
        
        const s = [...store.players].sort((a, b) => b.score - a.score);
        if (s[0]) {
            s[0].score = (s[0].score || 0) + 1;
            store.save();
        }

        setTimeout(() => {
            board.remove();
            appCore.renderPodio();
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
    setTimeout(() => appCore.renderPodio(), 2800);
};

appCore.renderPodio = function(sSorted) {
    appCore.nav('screen-podio');
    window.playSound('victory');
    window.vibrar(600);
    window.GIW.bus.emit('fx:juice', { type: 'confetti', particleCount: 150 });

    const s = sSorted || [...store.players].sort((a, b) => b.score - a.score);
    
    // 1º Lugar - Campeão
    const champ = s[0] || { name: 'Guerreiro', score: 0 };
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

window.showRetrospectiva = appCore.renderPodio;

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
    ctx.fillText('GAME IS WAR 3.0 • PROVADO NO CAMPO DE BATALHA', 540, 1260);

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
        title: "Iniciar Nova Noite?",
        text: "Os pontos e estatísticas de todos os guerreiros serão zerados para um novo placar!<br>Os avatares e nomes continuarão salvos na mesa.",
        icon: "🔄",
        confirmLabel: "SIM, ZERAR PLACAR",
        confirmColor: "warning",
        onConfirm: () => {
            appCore.fecharPodio();
            window.showCustomAlert("Placar Zerado!", "Os guerreiros estão prontos para uma nova batalha!", "⚔️");
        }
    });
};

appCore.fecharPodio = function() {
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
    appCore.renderShowcaseCard();
    appCore.bindShowcaseGestures();
});