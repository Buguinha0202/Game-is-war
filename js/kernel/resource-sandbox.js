/**
 * ResourceSandbox - Nível 1 (Seção 4.1 do plano).
 * Blindagem total de memória e recursos:
 * - Timers rastreados (setTimeout, setInterval)
 * - EventListeners com AbortController (DOM, Touch, DeviceMotion)
 * - GSAP Scoped Animations (gsap.context) com revert()
 * - Screen WakeLock com reaquisição no visibilitychange e liberação garantida
 * - Escopo próprio no EventBus com limpeza em lote
 */
export class ResourceSandbox {
    #intervals = new Set();
    #timeouts = new Set();
    #abortController = new AbortController();
    #gsapContext = null;
    #wakeLockSentinel = null;
    #busScope = Symbol('MiniGameScope');
    #bus = null;
    #isDisposed = false;

    constructor(eventBus, rootElement) {
        this.#bus = eventBus;
        if (typeof window.gsap !== 'undefined' && rootElement) {
            this.#gsapContext = window.gsap.context(() => {}, rootElement);
        }

        // Reaquisição automática de WakeLock se o app minimizar e voltar durante a partida
        this.addEventListener(document, 'visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.#wakeLockSentinel !== null) {
                this.requestWakeLock();
            }
        });
    }

    get busScope() { return this.#busScope; }

    // 1. Timers Rastreados
    setTimeout(fn, delayMs, ...args) {
        if (this.#isDisposed) return null;
        const id = window.setTimeout(() => {
            this.#timeouts.delete(id);
            if (!this.#isDisposed) fn(...args);
        }, delayMs);
        this.#timeouts.add(id);
        return id;
    }

    clearTimeout(id) {
        window.clearTimeout(id);
        this.#timeouts.delete(id);
    }

    setInterval(fn, intervalMs, ...args) {
        if (this.#isDisposed) return null;
        const id = window.setInterval(() => {
            if (!this.#isDisposed) fn(...args);
        }, intervalMs);
        this.#intervals.add(id);
        return id;
    }

    clearInterval(id) {
        window.clearInterval(id);
        this.#intervals.delete(id);
    }

    // 2. Event Listeners com AbortSignal
    addEventListener(target, type, listener, options = {}) {
        if (this.#isDisposed || !target?.addEventListener) return;
        const mergedOptions = typeof options === 'boolean'
            ? { capture: options, signal: this.#abortController.signal }
            : { ...options, signal: this.#abortController.signal };
        target.addEventListener(type, listener, mergedOptions);
    }

    // 3. Sensor de Movimento (DeviceMotion para Batata Quente)
    async bindDeviceMotion(onShockCallback, threshold = 25) {
        if (this.#isDisposed) return false;
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission !== 'granted') return false;
            } catch {
                return false;
            }
        }
        this.addEventListener(window, 'devicemotion', (event) => {
            const acc = event.accelerationIncludingGravity || event.acceleration;
            if (!acc) return;
            const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
            // Subtrai gravidade terrestre (~9.8m/s²) para isolar o solavanco
            const deltaForce = Math.abs(magnitude - 9.81);
            if (deltaForce >= threshold) {
                onShockCallback({ magnitude, deltaForce, raw: acc });
            }
        }, { passive: true });
        return true;
    }

    // 4. GSAP Scoped Animations
    animate(fn) {
        if (this.#isDisposed) return;
        if (this.#gsapContext) {
            this.#gsapContext.add(fn);
        } else {
            fn();
        }
    }

    // 5. Gerenciamento de Screen WakeLock
    async requestWakeLock() {
        if (this.#isDisposed || !('wakeLock' in navigator)) return;
        try {
            this.#wakeLockSentinel = await navigator.wakeLock.request('screen');
        } catch (_) { /* Silencioso em dispositivos sem suporte ou bateria baixa */ }
    }

    async releaseWakeLock() {
        if (this.#wakeLockSentinel) {
            try { await this.#wakeLockSentinel.release(); } catch (_) {}
            this.#wakeLockSentinel = null;
        }
    }

    // 6. Destruição Determinística Total
    dispose() {
        if (this.#isDisposed) return;
        this.#isDisposed = true;

        for (const id of this.#timeouts) window.clearTimeout(id);
        this.#timeouts.clear();

        for (const id of this.#intervals) window.clearInterval(id);
        this.#intervals.clear();

        this.#abortController.abort();

        if (this.#gsapContext) {
            this.#gsapContext.revert();
            this.#gsapContext = null;
        }

        if (this.#bus) {
            this.#bus.clearScope(this.#busScope);
            this.#bus.emit('audio:filter', { mode: 'normal' });
        }

        this.releaseWakeLock();
    }
}
