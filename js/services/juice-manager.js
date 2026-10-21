/**
 * JuiceManager - Serviço de Nível 1.
 *
 * Eventos assinados (catálogo Seção 3.2):
 *   fx:juice        { type: 'confetti'|'flash'|'crack'|'pulse', color?, target?, particleCount?,
 *                     x?, y?, peak?, durationMs?, persist?, clear?, scale?, hitstopMs? }
 *   fx:screenshake  { intensity: 'low'|'medium'|'heavy', durationMs?, targetId?, hitstopMs? }
 *   haptics:trigger { preset: 'tap'|'warning'|'explosion'|'heartbeat', pattern? }
 *
 * Dependência única: um objeto com `on(event, handler)` (o EventBus do Nível 0).
 */

const TAU = Math.PI * 2;

const SHAKE_PRESETS = {
    low:    { amp: 4,  rot: 0.3, ms: 250 },
    medium: { amp: 9,  rot: 0.8, ms: 420 },
    heavy:  { amp: 18, rot: 1.6, ms: 700 }
};

const HAPTIC_PRESETS = {
    tap: 50,
    warning: [80, 40, 80],
    explosion: 1000,
    heartbeat: [60, 90, 120]
};

const CONFETTI_COLORS = ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b', '#ce82ff', '#ffffff'];

const CARD_VARS = ['--tilt-x', '--tilt-y', '--shadow-x', '--shadow-y', '--glare-x', '--glare-y'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class JuiceManager {
    #bus;
    #isVibrationEnabled;
    #shakeRoot;

    #unsubs = [];
    #globalAbort = new AbortController();
    #disposed = false;

    #canvas = null;
    #g = null;
    #w = 0;
    #h = 0;
    #dpr = 1;

    #particles = [];
    #shakes = new Map();

    #loopOn = false;
    #loopUsesGsap = false;
    #rafId = 0;
    #lastRaf = 0;

    #hitstopActive = false;
    #hitstopTimer = 0;
    #timelinePausedByUs = false;

    #motionQuery = null;

    #flashEl = null;
    #crackEl = null;
    #crackHoldTimer = 0;
    #crackFadeTimer = 0;

    #liftedCard = null;
    #cardAbort = null;

    /**
     * @param {Object} opts
     * @param {{ on: Function }} opts.bus - EventBus (Nível 0)
     * @param {() => boolean} [opts.isVibrationEnabled] - Leitura da flag global de vibração
     * @param {string|HTMLElement|null} [opts.shakeRoot] - Container padrão do shake (ex.: '#app').
     *        Se ausente, usa #app e, por fim, a '.screen.active'. Nunca o <body>: um transform no body
     *        quebraria todos os elementos position:fixed.
     */
    constructor({ bus, isVibrationEnabled = () => true, shakeRoot = null } = {}) {
        if (!bus || typeof bus.on !== 'function') {
            throw new Error('[JuiceManager] É necessário injetar um EventBus com on(event, handler).');
        }
        this.#bus = bus;
        this.#isVibrationEnabled = isVibrationEnabled;
        this.#shakeRoot = shakeRoot;
        this.#motionQuery = typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;

        this.#unsubs.push(
            this.#bus.on('fx:juice', (p) => this.#onJuice(p)),
            this.#bus.on('fx:screenshake', (p) => this.#onShake(p)),
            this.#bus.on('haptics:trigger', (p) => this.#onHaptics(p))
        );

        document.addEventListener('pointerdown', this.#onCardPointerDown, {
            capture: true,
            passive: true,
            signal: this.#globalAbort.signal
        });
        window.addEventListener('resize', () => this.#resizeCanvas(), {
            passive: true,
            signal: this.#globalAbort.signal
        });
    }

    dispose() {
        if (this.#disposed) return;
        this.#disposed = true;

        this.#unsubs.forEach((off) => off());
        this.#unsubs = [];
        this.#globalAbort.abort();
        this.#releaseCard();
        this.#stopLoop();

        for (const el of this.#shakes.keys()) {
            el.style.removeProperty('translate');
            el.style.removeProperty('rotate');
        }
        this.#shakes.clear();
        this.#particles.length = 0;

        clearTimeout(this.#crackHoldTimer);
        clearTimeout(this.#crackFadeTimer);
        this.#endHitstop();

        if (this.#canvas) {
            this.#canvas.remove();
            this.#canvas = null;
            this.#g = null;
        }
    }

    /* ======================================================
       Utilitários
       ====================================================== */
    get #reduceMotion() {
        return !!(this.#motionQuery && this.#motionQuery.matches);
    }

    #hasGsap() {
        return typeof window.gsap !== 'undefined';
    }

    #resolve(target) {
        if (!target) return null;
        if (target instanceof Element) return target;
        if (typeof target === 'string') return document.querySelector(target);
        return null;
    }

    #shakeTarget(targetId) {
        const byId = targetId ? document.getElementById(targetId) : null;
        if (byId) return byId;
        const root = this.#resolve(this.#shakeRoot);
        if (root) return root;
        return document.getElementById('app') || document.querySelector('.screen.active');
    }

    #origin(p) {
        if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y };
        const el = this.#resolve(p.target);
        if (el) {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return { x: this.#w / 2, y: this.#h * 0.42 };
    }

    /* ======================================================
       Canvas overlay
       ====================================================== */
    #ensureCanvas() {
        if (this.#canvas) return true;
        if (!document.body) return false;

        const canvas = document.createElement('canvas');
        canvas.id = 'juice-canvas';
        canvas.className = 'juice-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);

        this.#canvas = canvas;
        this.#g = canvas.getContext('2d');
        this.#resizeCanvas();
        return !!this.#g;
    }

    #resizeCanvas() {
        if (!this.#canvas || !this.#g) return;
        this.#dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.#w = window.innerWidth;
        this.#h = window.innerHeight;
        this.#canvas.width = Math.round(this.#w * this.#dpr);
        this.#canvas.height = Math.round(this.#h * this.#dpr);
        this.#g.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    }

    /* ======================================================
       Loop unificado (gsap.ticker com fallback para rAF)
       ====================================================== */
    #tick = (_time, deltaMs) => {
        const dt = Math.min((deltaMs || 16.7) / 1000, 0.05);
        if (this.#hitstopActive) return; // micro-freeze: partículas e shakes param juntos

        this.#stepShakes(dt);
        this.#stepParticles(dt);

        if (this.#particles.length === 0 && this.#shakes.size === 0) this.#stopLoop();
    };

    #startLoop() {
        if (this.#loopOn || this.#disposed) return;
        this.#loopOn = true;

        if (this.#hasGsap() && window.gsap.ticker) {
            this.#loopUsesGsap = true;
            window.gsap.ticker.add(this.#tick);
        } else {
            this.#loopUsesGsap = false;
            this.#lastRaf = performance.now();
            const step = (now) => {
                if (!this.#loopOn) return;
                this.#tick(now, now - this.#lastRaf);
                this.#lastRaf = now;
                this.#rafId = requestAnimationFrame(step);
            };
            this.#rafId = requestAnimationFrame(step);
        }
    }

    #stopLoop() {
        if (!this.#loopOn) return;
        this.#loopOn = false;
        if (this.#loopUsesGsap && this.#hasGsap()) window.gsap.ticker.remove(this.#tick);
        cancelAnimationFrame(this.#rafId);
        if (this.#g) this.#g.clearRect(0, 0, this.#w, this.#h);
    }

    /* ======================================================
       fx:juice
       ====================================================== */
    #onJuice(p = {}) {
        if (this.#disposed) return;
        switch (p.type) {
            case 'confetti': this.#confetti(p); break;
            case 'flash':    this.#flash(p); break;
            case 'crack':    this.#crack(p); break;
            case 'pulse':    this.#pulse(p); break;
            default:
                console.warn(`[JuiceManager] fx:juice com type desconhecido: "${p.type}"`);
                return;
        }
        const hitstopMs = p.hitstopMs ?? (p.type === 'crack' && !p.clear ? 90 : 0);
        if (hitstopMs > 0) this.#hitstop(hitstopMs);
    }

    #confetti(p) {
        const count = clamp(p.particleCount ?? 150, 1, 400);
        const colors = Array.isArray(p.color)
            ? p.color
            : (p.color ? [p.color, '#ffffff'] : CONFETTI_COLORS);

        if (typeof window.confetti === 'function') {
            window.confetti({ particleCount: count, spread: 80, origin: { y: 0.6 }, colors });
            return;
        }

        if (!this.#ensureCanvas()) return;
        const ox = this.#w / 2;
        const oy = this.#h * 0.6;
        for (let i = 0; i < count; i++) {
            const angle = -Math.PI / 2 + rand(-0.75, 0.75);
            const speed = rand(500, 1100);
            const life = rand(1.8, 3);
            this.#particles.push({
                kind: 'rect',
                x: ox, y: oy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                g: 900,
                drag: 1.4,
                rot: rand(0, TAU),
                vr: rand(-10, 10),
                tumble: rand(0, TAU),
                tv: rand(6, 16),
                w: rand(6, 11),
                h: rand(4, 7),
                color: colors[(Math.random() * colors.length) | 0],
                life, max: life
            });
        }
        this.#startLoop();
    }

    #getFlashEl() {
        if (this.#flashEl && this.#flashEl.isConnected) return this.#flashEl;
        let el = document.getElementById('flash-overlay');
        if (!el && document.body) {
            el = document.createElement('div');
            el.id = 'flash-overlay';
            el.className = 'flash-overlay';
            document.body.appendChild(el);
        }
        this.#flashEl = el;
        return el;
    }

    #flash(p) {
        const el = this.#getFlashEl();
        if (!el) return;

        // Fotossensibilidade: reduz o brilho máximo para quem pede menos movimento.
        const peak = clamp(p.peak ?? 0.85, 0, 1) * (this.#reduceMotion ? 0.3 : 1);
        const dur = clamp(p.durationMs ?? 350, 60, 2000) / 1000;
        el.style.backgroundColor = p.color || '#ffffff';

        if (this.#hasGsap()) {
            window.gsap.killTweensOf(el);
            window.gsap.fromTo(el, { opacity: peak }, { opacity: 0, duration: dur, ease: 'power2.out' });
        } else {
            el.style.transition = 'none';
            el.style.opacity = String(peak);
            void el.offsetWidth;
            el.style.transition = `opacity ${dur}s ease-out`;
            el.style.opacity = '0';
        }
    }

    #getCrackEl() {
        if (this.#crackEl && this.#crackEl.isConnected) return this.#crackEl;
        let el = document.getElementById('glass-crack');
        if (!el && document.body) {
            el = document.createElement('div');
            el.id = 'glass-crack';
            el.className = 'glass-crack-overlay';
            document.body.appendChild(el);
        }
        this.#crackEl = el;
        return el;
    }

    #hideCrackOverlay() {
        const el = this.#getCrackEl();
        clearTimeout(this.#crackHoldTimer);
        clearTimeout(this.#crackFadeTimer);
        if (!el) return;
        el.classList.remove('is-visible', 'is-fading');
        el.style.display = 'none';
    }

    #showCrackOverlay(p) {
        const el = this.#getCrackEl();
        if (!el) return;

        clearTimeout(this.#crackHoldTimer);
        clearTimeout(this.#crackFadeTimer);

        // display explícito: appCore.fecharPodio() força display:none inline.
        el.style.display = 'block';
        el.classList.remove('is-visible', 'is-fading');
        void el.offsetWidth;
        el.classList.add('is-visible');

        if (!p.persist) {
            this.#crackHoldTimer = setTimeout(() => {
                el.classList.add('is-fading');
                this.#crackFadeTimer = setTimeout(() => this.#hideCrackOverlay(), 750);
            }, 1800);
        }
    }

    #crack(p) {
        if (p.clear) {
            this.#hideCrackOverlay();
            return;
        }

        this.#showCrackOverlay(p);
        if (!this.#ensureCanvas()) return;

        const { x, y } = this.#origin(p);
        const count = clamp(p.particleCount ?? 70, 10, 200);

        for (let i = 0; i < count; i++) {
            const sides = 3 + ((Math.random() * 3) | 0);
            const points = [];
            for (let k = 0; k < sides; k++) {
                const a = (k / sides) * TAU + rand(-0.4, 0.4);
                const r = rand(7, 26);
                points.push([Math.cos(a) * r, Math.sin(a) * r]);
            }

            const angle = rand(0, TAU);
            const speed = rand(180, 950);
            const life = rand(1.2, 2.0);
            this.#particles.push({
                kind: 'shard',
                points,
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - rand(0, 350),
                g: 2000,
                drag: 0.4,
                rot: rand(0, TAU),
                vr: rand(-12, 12),
                tumble: rand(0, TAU),
                tv: rand(4, 14),
                life, max: life
            });
        }
        this.#startLoop();
    }

    #pulse(p) {
        const el = this.#resolve(p.target);
        if (!el) return;
        const scale = clamp(p.scale ?? 1.1, 1.01, 1.5);

        if (this.#hasGsap()) {
            window.gsap.fromTo(el,
                { scale: 1 },
                { scale, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out', overwrite: 'auto', clearProps: 'scale' }
            );
        } else {
            el.classList.remove('juice-pulse');
            void el.offsetWidth;
            el.classList.add('juice-pulse');
            el.addEventListener('animationend', () => el.classList.remove('juice-pulse'), { once: true });
        }
    }

    /* ======================================================
       Partículas
       ====================================================== */
    #stepParticles(dt) {
        const g = this.#g;
        if (!g) return;

        g.clearRect(0, 0, this.#w, this.#h);
        const ps = this.#particles;

        for (let i = ps.length - 1; i >= 0; i--) {
            const p = ps[i];
            p.life -= dt;
            if (p.life <= 0 || p.y > this.#h + 120) {
                ps.splice(i, 1);
                continue;
            }

            const drag = Math.max(0, 1 - p.drag * dt);
            p.vx *= drag;
            p.vy = p.vy * drag + p.g * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            p.tumble += p.tv * dt;

            const alpha = Math.pow(clamp(p.life / p.max, 0, 1), 0.6);

            g.save();
            g.globalAlpha = alpha;
            g.translate(p.x, p.y);
            g.rotate(p.rot);
            g.scale(1, Math.cos(p.tumble));

            if (p.kind === 'shard') {
                g.beginPath();
                g.moveTo(p.points[0][0], p.points[0][1]);
                for (let k = 1; k < p.points.length; k++) g.lineTo(p.points[k][0], p.points[k][1]);
                g.closePath();
                g.fillStyle = 'rgba(185, 225, 255, 0.35)';
                g.fill();
                g.lineWidth = 1.5;
                g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                g.stroke();
            } else {
                g.fillStyle = p.color;
                g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            }
            g.restore();
        }
    }

    /* ======================================================
       fx:screenshake - Camera Shake com decaimento quadrático
       Usa as propriedades CSS individuais `translate` e `rotate`,
       que compõem com `transform` e não brigam com tweens do GSAP.
       ====================================================== */
    #onShake(p = {}) {
        if (this.#disposed || this.#reduceMotion) return;

        const preset = SHAKE_PRESETS[p.intensity] || SHAKE_PRESETS.medium;
        const el = this.#shakeTarget(p.targetId);
        if (!el) return;

        const durMs = p.durationMs > 0 ? p.durationMs : preset.ms;
        const prev = this.#shakes.get(el);
        const residual = prev ? prev.amp * Math.pow(1 - prev.t / prev.dur, 2) : 0;

        this.#shakes.set(el, {
            t: 0,
            dur: durMs / 1000,
            amp: Math.max(preset.amp, residual),
            rot: preset.rot,
            freq: rand(26, 34),
            ph: [rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU)]
        });
        this.#startLoop();

        const hitstopMs = p.hitstopMs ?? (p.intensity === 'heavy' ? 60 : 0);
        if (hitstopMs > 0) this.#hitstop(hitstopMs);
    }

    #stepShakes(dt) {
        for (const [el, s] of this.#shakes) {
            s.t += dt;
            if (s.t >= s.dur || !el.isConnected) {
                el.style.removeProperty('translate');
                el.style.removeProperty('rotate');
                this.#shakes.delete(el);
                continue;
            }
            const k = 1 - s.t / s.dur;
            const d = k * k;
            const w = s.freq * s.t;
            const x = Math.sin(w + s.ph[0]) * 0.6 + Math.sin(w * 2.3 + s.ph[1]) * 0.4;
            const y = Math.sin(w * 1.1 + s.ph[2]) * 0.6 + Math.sin(w * 2.7 + s.ph[3]) * 0.4;
            const r = Math.sin(w * 0.9 + s.ph[4]) * 0.6 + Math.sin(w * 2.1 + s.ph[5]) * 0.4;

            el.style.translate = `${(x * s.amp * d).toFixed(2)}px ${(y * s.amp * d).toFixed(2)}px`;
            el.style.rotate = `${(r * s.rot * d).toFixed(3)}deg`;
        }
    }

    /* ======================================================
       Hitstop - micro-freeze em eliminações críticas
       ====================================================== */
    #hitstop(ms) {
        if (this.#disposed || this.#reduceMotion) return;
        const duration = clamp(ms, 16, 250);

        if (!this.#hitstopActive) {
            this.#hitstopActive = true;
            document.documentElement.classList.add('juice-hitstop');
            if (this.#hasGsap() && !window.gsap.globalTimeline.paused()) {
                window.gsap.globalTimeline.pause();
                this.#timelinePausedByUs = true;
            }
        }

        clearTimeout(this.#hitstopTimer);
        this.#hitstopTimer = setTimeout(() => this.#endHitstop(), duration);
    }

    #endHitstop() {
        clearTimeout(this.#hitstopTimer);
        if (!this.#hitstopActive) return;
        this.#hitstopActive = false;
        document.documentElement.classList.remove('juice-hitstop');
        if (this.#timelinePausedByUs && this.#hasGsap()) window.gsap.globalTimeline.resume();
        this.#timelinePausedByUs = false;
    }

    /* ======================================================
       haptics:trigger
       ====================================================== */
    #onHaptics(p = {}) {
        if (this.#disposed || !this.#isVibrationEnabled()) return;
        const pattern = p.pattern ?? HAPTIC_PRESETS[p.preset];
        if (pattern === undefined || pattern === null) {
            console.warn(`[JuiceManager] haptics:trigger com preset desconhecido: "${p.preset}"`);
            return;
        }
        try {
            if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
        } catch (_) { /* vibração indisponível ou bloqueada pelo navegador */ }
    }

    /* ======================================================
       Elevação 3D das cartas (.player-card) - estado visual em style-juice.css
       ====================================================== */
    #onCardPointerDown = (e) => {
        if (this.#reduceMotion) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        const card = e.target instanceof Element ? e.target.closest('.player-card') : null;
        if (!card) return;

        this.#releaseCard();
        this.#liftedCard = card;
        card.classList.add('is-lifted');
        this.#tiltCard(card, e.clientX, e.clientY);

        const ac = new AbortController();
        this.#cardAbort = ac;
        const opts = { signal: ac.signal, passive: true };
        document.addEventListener('pointermove', (ev) => this.#tiltCard(card, ev.clientX, ev.clientY), opts);
        document.addEventListener('pointerup', () => this.#releaseCard(), opts);
        document.addEventListener('pointercancel', () => this.#releaseCard(), opts);
    };

    #tiltCard(card, clientX, clientY) {
        const r = card.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;

        const nx = clamp((clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
        const ny = clamp((clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);

        card.style.setProperty('--tilt-x', `${(-ny * 14).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(nx * 14).toFixed(2)}deg`);
        card.style.setProperty('--shadow-x', `${(-nx * 16).toFixed(1)}px`);
        card.style.setProperty('--shadow-y', `${(22 - ny * 10).toFixed(1)}px`);
        card.style.setProperty('--glare-x', `${(nx * 50 + 50).toFixed(1)}%`);
        card.style.setProperty('--glare-y', `${(ny * 50 + 50).toFixed(1)}%`);
    }

    #releaseCard() {
        if (this.#cardAbort) {
            this.#cardAbort.abort();
            this.#cardAbort = null;
        }
        const card = this.#liftedCard;
        this.#liftedCard = null;
        if (!card) return;
        card.classList.remove('is-lifted');
        CARD_VARS.forEach((v) => card.style.removeProperty(v));
    }
}
