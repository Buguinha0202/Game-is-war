/**
 * MiniGamePlugin - Nível 3 (Seção 5.2 do plano).
 * Interface base padronizada para todos os 16 minigames do "Game is War".
 */

export class MiniGamePlugin {
    config = null;
    teams = [];
    ctx = null;

    /**
     * 1. INICIALIZAÇÃO
     * Prepara estado interno, sorteios e estrutura inicial sem iniciar cronômetros nem sensores.
     * @param {Object} config
     * @param {Array} teams
     * @param {Object} context - { sandbox, bus, timer, ui, completeGame }
     */
    onInit(config, teams, context) {
        this.config = config;
        this.teams = teams;
        this.ctx = context;
    }

    /**
     * 2. PARTIDA
     * Invocado quando a tela do jogo está montada e pronta.
     */
    onStart() {}

    /**
     * 3. LOOP DE TEMPO REAL
     * @param {number} deltaSec
     * @param {number} elapsedSec
     * @param {number} remainingSec
     */
    onTick(deltaSec, elapsedSec, remainingSec) {}

    /**
     * 4. AÇÕES E INTERAÇÕES
     * @param {string} type
     * @param {Object} payload
     */
    onAction(type, payload = {}) {}

    /**
     * 5. FINALIZAÇÃO DA REGRA DE NEGÓCIO
     * @param {Object} rawOutcome
     * @returns {Object} GameResultPayload
     */
    onFinish(rawOutcome) {
        throw new Error('MiniGamePlugin.onFinish(rawOutcome) deve ser implementado pela subclasse.');
    }

    /**
     * 6. LIMPEZA DETERMINÍSTICA
     */
    onDestroy() {}
}
