/**
 * AudioEngine - Serviço de Nível 1 (Seção 3.3 do plano).
 *
 * Grafo:
 *   [Fontes Procedurais] -> [Master Gain] -> [BiquadFilterNode Master]
 *                        -> [DynamicsCompressorNode] -> [audioCtx.destination]
 *
 * Eventos assinados (catálogo Seção 3.2):
 *   audio:play   { sfx: 'beep'|'kaboom'|'heartbeat'|'siren'|'badum'|'cricket'|'applause'|
 *                       'typewriter'|'scan'|'glitch'|'success', highTone?: boolean, rate?: number }
 *   audio:filter { mode: 'normal'|'muffled'|'tension'|'panic', frequency?: number, q?: number, rampSec?: number }
 *
 * Dependência única: um objeto com `on(event, handler)` (o EventBus do Nível 0).
 */

const TAU = Math.PI * 2;
const MAX_VOICES = 48;
const DEFAULT_Q = 0.7071;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class AudioEngine {
    #bus;
    #isEnabled;
    #masterVolume;

    #ctx = null;
    #master = null;
    #filter = null;
    #compressor = null;
    #noiseBuffer = null;
    #lfo = null;
    #openFreq = 22050;
    #voices = 0;

    #pendingFilter = null;
    #unsubs = [];
    #unlockAbort = null;
    #globalAbort = new AbortController();
    #disposed = false;

    /**
     * @param {Object} opts
     * @param {{ on: Function }} opts.bus - EventBus (Nível 0)
     * @param {() => boolean} [opts.isEnabled] - Leitura da flag global de som (isSoundOn)
     * @param {number} [opts.masterVolume] - Ganho do Master Gain (0..1)
     */
    constructor({ bus, isEnabled = () => true, masterVolume = 0.8 } = {}) {
        if (!bus || typeof bus.on !== 'function') {
            throw new Error('[AudioEngine] É necessário injetar um EventBus com on(event, handler).');
        }
        this.#bus = bus;
        this.#isEnabled = isEnabled;
        this.#masterVolume = clamp(masterVolume, 0, 1);

        this.#unsubs.push(
            this.#bus.on('audio:play', (p) => this.#onPlay(p)),
            this.#bus.on('audio:filter', (p) => this.#onFilter(p))
        );

        this.#bindUnlock();

        // Economiza bateria: suspende o contexto com a aba oculta.
        document.addEventListener('visibilitychange', () => {
            if (!this.#ctx) return;
            if (document.visibilityState === 'hidden') {
                this.#ctx.suspend().catch(() => {});
            } else if (this.#isEnabled()) {
                this.#ctx.resume().catch(() => {});
            }
        }, { signal: this.#globalAbort.signal });
    }

    get state() {
        return this.#ctx ? this.#ctx.state : 'uninitialized';
    }

    dispose() {
        if (this.#disposed) return;
        this.#disposed = true;

        this.#unsubs.forEach((off) => off());
        this.#unsubs = [];
        if (this.#unlockAbort) this.#unlockAbort.abort();
        this.#globalAbort.abort();

        if (this.#ctx) {
            this.#stopLfo(this.#ctx.currentTime);
            this.#ctx.close().catch(() => {});
        }
        this.#ctx = null;
        this.#master = null;
        this.#filter = null;
        this.#compressor = null;
        this.#noiseBuffer = null;
    }

    /* ======================================================
       Contexto e grafo
       ====================================================== */
    #bindUnlock() {
        const ac = new AbortController();
        this.#unlockAbort = ac;

        const unlock = () => {
            const ctx = this.#ensureContext();
            if (!ctx) return;
            if (ctx.state === 'running') {
                ac.abort();
                this.#unlockAbort = null;
            } else {
                ctx.resume().then(() => {
                    if (ctx.state === 'running') {
                        ac.abort();
                        this.#unlockAbort = null;
                    }
                }).catch(() => {});
            }
        };

        ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((type) => {
            document.addEventListener(type, unlock, { capture: true, passive: true, signal: ac.signal });
        });
    }

    #ensureContext() {
        if (this.#ctx) return this.#ctx;
        if (this.#disposed || !this.#isEnabled()) return null;

        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;

        const ctx = new AC({ latencyHint: 'interactive' });
        this.#openFreq = Math.min(22050, ctx.sampleRate / 2);

        const master = ctx.createGain();
        master.gain.value = this.#masterVolume;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = this.#openFreq;
        filter.Q.value = DEFAULT_Q;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 24;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;

        master.connect(filter);
        filter.connect(compressor);
        compressor.connect(ctx.destination);

        this.#ctx = ctx;
        this.#master = master;
        this.#filter = filter;
        this.#compressor = compressor;

        // Filtro solicitado antes de o contexto existir (ex.: Loja Negra aberta antes do 1º toque).
        if (this.#pendingFilter) this.#applyFilter({ ...this.#pendingFilter, rampSec: 0.01 });

        return ctx;
    }

    #reserve() {
        if (this.#voices >= MAX_VOICES) return false;
        this.#voices++;
        return true;
    }

    #getNoise() {
        if (!this.#noiseBuffer) {
            const c = this.#ctx;
            const len = Math.floor(c.sampleRate * 1.5);
            const buf = c.createBuffer(1, len, c.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            this.#noiseBuffer = buf;
        }
        return this.#noiseBuffer;
    }

    /* ======================================================
       audio:filter
       ====================================================== */
    #onFilter(p = {}) {
        if (this.#disposed) return;
        const mode = p.mode || 'normal';
        if (!['normal', 'muffled', 'tension', 'panic'].includes(mode)) {
            console.warn(`[AudioEngine] audio:filter com mode desconhecido: "${mode}"`);
            return;
        }
        this.#pendingFilter = { mode, frequency: p.frequency, q: p.q, rampSec: p.rampSec };
        if (!this.#ctx) return;
        this.#applyFilter(this.#pendingFilter);
    }

    #applyFilter({ mode, frequency, q, rampSec }) {
        const ctx = this.#ctx;
        const f = this.#filter.frequency;
        const qp = this.#filter.Q;
        const t = ctx.currentTime;
        const nyquist = this.#openFreq;

        this.#stopLfo(t);

        f.cancelScheduledValues(t);
        f.setValueAtTime(Math.max(f.value, 20), t);
        qp.cancelScheduledValues(t);
        qp.setValueAtTime(qp.value, t);

        this.#filter.type = 'lowpass';

        if (mode === 'normal') {
            const ramp = clamp(rampSec ?? 0.15, 0.01, 10);
            f.exponentialRampToValueAtTime(nyquist, t + ramp);
            qp.linearRampToValueAtTime(DEFAULT_Q, t + ramp);
            return;
        }

        if (mode === 'muffled') {
            const ramp = clamp(rampSec ?? 0.3, 0.01, 10);
            f.exponentialRampToValueAtTime(clamp(frequency ?? 380, 40, nyquist), t + ramp);
            qp.linearRampToValueAtTime(q ?? 0.9, t + ramp);
            return;
        }

        if (mode === 'tension') {
            const base = clamp(frequency ?? 1600, 200, nyquist);
            const ramp = clamp(rampSec ?? 8, 0.5, 60);
            f.exponentialRampToValueAtTime(base, t + Math.min(ramp, 1.2));
            qp.linearRampToValueAtTime(q ?? 5, t + Math.min(ramp, 1.2));
            // O LFO acelera de 1.2Hz a 5.5Hz: o filtro "respira" cada vez mais rápido.
            this.#startLfo(t, { rate0: 1.2, rate1: 5.5, rateRamp: ramp, depth: base * 0.55, depthRamp: Math.min(ramp, 1.2) });
            return;
        }

        // panic
        const base = clamp(frequency ?? 900, 200, nyquist);
        const ramp = clamp(rampSec ?? 0.2, 0.01, 10);
        f.exponentialRampToValueAtTime(base, t + ramp);
        qp.linearRampToValueAtTime(q ?? 9, t + ramp);
        this.#startLfo(t, { rate0: 9, rate1: 9, rateRamp: 0.1, depth: base * 0.6, depthRamp: ramp });
    }

    #startLfo(t, { rate0, rate1, rateRamp, depth, depthRamp }) {
        const ctx = this.#ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(rate0, t);
        osc.frequency.linearRampToValueAtTime(rate1, t + rateRamp);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(depth, t + depthRamp);

        osc.connect(gain);
        gain.connect(this.#filter.frequency);
        osc.start(t);

        this.#lfo = { osc, gain };
    }

    #stopLfo(t) {
        if (!this.#lfo) return;
        const { osc, gain } = this.#lfo;
        this.#lfo = null;

        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, 0.04);
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
        try { osc.stop(t + 0.25); } catch (_) { /* já parado */ }
    }

    /* ======================================================
       Primitivas de síntese
       ====================================================== */

    /**
     * Oscilador com envelope.
     * path: [[offsetSec, freqHz], ...]; ramp: 'exp' | 'lin' | 'step' (transição entre pontos).
     * env:  'exp' | 'lin' (decaimento do ganho até o fim de dur).
     */
    #tone({ type = 'sine', path, ramp = 'exp', start = 0, dur, vol = 1, env = 'exp', attack = 0.004, rate = 1 }) {
        if (!this.#reserve()) return;
        const c = this.#ctx;
        const t = c.currentTime + start;

        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;

        osc.frequency.setValueAtTime(path[0][1] * rate, t);
        for (let i = 1; i < path.length; i++) {
            const when = t + path[i][0];
            const hz = path[i][1] * rate;
            if (ramp === 'step') osc.frequency.setValueAtTime(hz, when);
            else if (ramp === 'lin') osc.frequency.linearRampToValueAtTime(hz, when);
            else osc.frequency.exponentialRampToValueAtTime(hz, when);
        }

        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + attack);
        if (env === 'lin') g.gain.linearRampToValueAtTime(0, t + dur);
        else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        osc.connect(g);
        g.connect(this.#master);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        osc.onended = () => {
            this.#voices--;
            osc.disconnect();
            g.disconnect();
        };
    }

    /** Rajada de ruído branco filtrado (dur máx. ~1.1s). */
    #noiseBurst({ start = 0, dur = 0.2, vol = 0.5, type = 'lowpass', f0 = 1000, f1 = null, q = 0.7, attack = 0.003, rate = 1 }) {
        if (!this.#reserve()) return;
        const c = this.#ctx;
        const t = c.currentTime + start;
        const length = Math.min(dur, 1.1);

        const src = c.createBufferSource();
        src.buffer = this.#getNoise();

        const flt = c.createBiquadFilter();
        flt.type = type;
        flt.Q.value = q;
        flt.frequency.setValueAtTime(Math.max(20, f0 * rate), t);
        if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), t + length);

        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + Math.min(attack, length * 0.5));
        g.gain.exponentialRampToValueAtTime(0.0001, t + length);

        src.connect(flt);
        flt.connect(g);
        g.connect(this.#master);
        src.start(t, Math.random() * 0.4);
        src.stop(t + length + 0.02);
        src.onended = () => {
            this.#voices--;
            src.disconnect();
            flt.disconnect();
            g.disconnect();
        };
    }

    /* ======================================================
       audio:play - catálogo completo de SFX
       ====================================================== */
    #onPlay(p = {}) {
        if (this.#disposed || !this.#isEnabled()) return;

        const ctx = this.#ensureContext();
        if (!ctx) return;
        if (ctx.state !== 'running') {
            // Sem gesto do usuário o relógio do contexto está parado; agendar causaria rajada ao retomar.
            ctx.resume().catch(() => {});
            return;
        }

        const rate = clamp(Number(p.rate) || 1, 0.25, 4);

        switch (p.sfx) {
            case 'beep':       this.#sfxBeep(!!p.highTone, rate); break;
            case 'kaboom':     this.#sfxKaboom(0, rate); break;
            case 'heartbeat':  this.#sfxHeartbeat(rate); break;
            case 'siren':      this.#sfxSiren(rate); break;
            case 'badum':      this.#sfxBadum(rate); break;
            case 'cricket':    this.#sfxCricket(rate); break;
            case 'applause':   this.#sfxApplause(rate); break;
            case 'typewriter': this.#sfxTypewriter(rate); break;
            case 'scan':       this.#sfxScan(rate); break;
            case 'glitch':     this.#sfxGlitch(rate); break;
            case 'success':    this.#sfxSuccess(rate); break;
            default:
                console.warn(`[AudioEngine] audio:play com sfx desconhecido: "${p.sfx}"`);
        }
    }

    #sfxBeep(highTone, rate) {
        const hz = highTone ? 1200 : 800;
        this.#tone({ type: 'sine', path: [[0, hz]], dur: 0.1, vol: 1, rate });
    }

    #sfxKaboom(start, rate) {
        this.#tone({ type: 'square', path: [[0, 100], [0.5, 20]], ramp: 'exp', start, dur: 0.5, vol: 1, rate });
        this.#noiseBurst({ start, dur: 0.5, vol: 0.8, type: 'lowpass', f0: 900, f1: 80, q: 0.8, rate });
    }

    #sfxHeartbeat(rate) {
        // "Lub-dub": dois baques graves com o segundo mais suave.
        this.#tone({ type: 'sine', path: [[0, 60], [0.3, 40]], ramp: 'exp', dur: 0.3, vol: 1, rate });
        this.#tone({ type: 'sine', path: [[0, 55], [0.25, 36]], ramp: 'exp', start: 0.2, dur: 0.25, vol: 0.7, rate });
    }

    #sfxSiren(rate) {
        this.#tone({
            type: 'triangle',
            path: [[0, 600], [0.5, 1200], [1.0, 600]],
            ramp: 'lin', dur: 1.0, vol: 1, env: 'lin', attack: 0.01, rate
        });
    }

    #sfxBadum(rate) {
        this.#tone({ type: 'square', path: [[0, 150], [0.2, 40]], ramp: 'exp', dur: 0.2, vol: 1, rate });
        this.#sfxKaboom(0.25, rate);
    }

    #sfxCricket(rate) {
        for (let i = 0; i < 2; i++) {
            this.#tone({ type: 'sawtooth', path: [[0, 3000]], start: i * 0.14, dur: 0.1, vol: 0.2, env: 'lin', rate });
        }
    }

    #sfxApplause(rate) {
        this.#noiseBurst({ dur: 1.0, vol: 0.22, type: 'bandpass', f0: 1800, q: 0.5, attack: 0.15, rate });
        for (let i = 0; i < 16; i++) {
            const s = rand(0, 0.9);
            this.#noiseBurst({
                start: s,
                dur: rand(0.04, 0.09),
                vol: rand(0.25, 0.5) * (1 - s * 0.5),
                type: 'bandpass',
                f0: rand(1200, 3600),
                q: 1.2,
                rate
            });
        }
    }

    #sfxTypewriter(rate) {
        this.#tone({ type: 'square', path: [[0, 1500]], dur: 0.05, vol: 0.3, rate });
    }

    #sfxScan(rate) {
        this.#tone({ type: 'sine', path: [[0, 2000]], dur: 0.1, vol: 0.1, rate });
    }

    #sfxGlitch(rate) {
        this.#tone({
            type: 'sawtooth',
            path: [[0, 100], [0.1, 800], [0.2, 50]],
            ramp: 'lin', dur: 0.2, vol: 0.5, env: 'lin', rate
        });
        this.#noiseBurst({ dur: 0.15, vol: 0.15, type: 'highpass', f0: 3000, q: 0.7, rate });
    }

    #sfxSuccess(rate) {
        this.#tone({
            type: 'sine',
            path: [[0, 600], [0.1, 800], [0.2, 1200]],
            ramp: 'step', dur: 0.5, vol: 1, env: 'lin', attack: 0.1, rate
        });
    }
}
