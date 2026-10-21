/**
 * EventBus - Nível 0 (Seção 3.1 do plano).
 * Pub/Sub síncrono com escopo opcional para limpeza em lote (ver ResourceSandbox, Nível 1).
 * Não depende de nenhum outro módulo.
 */
export class EventBus {
    #listeners = new Map(); // Map<string, Set<{ fn: Function, scope: symbol | null, once: boolean }>>

    /**
     * Registra um listener opcionalmente atrelado a um escopo de ciclo de vida.
     * @param {string} event - Nome do evento (namespace:acao)
     * @param {Function} handler - Função callback(payload)
     * @param {symbol|null} [scope=null] - Token de escopo para limpeza automática em lote
     * @returns {Function} Função de desinscrição (unsubscribe)
     */
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
            try {
                entry.fn(payload);
            } catch (err) {
                console.error(`[EventBus] Falha no handler de "${event}":`, err);
            }
        }
    }

    /**
     * Remove todos os listeners registrados por um plugin específico durante onDestroy().
     * @param {symbol} scope
     */
    clearScope(scope) {
        if (!scope) return;
        for (const set of this.#listeners.values()) {
            for (const entry of set) {
                if (entry.scope === scope) set.delete(entry);
            }
        }
    }
}
