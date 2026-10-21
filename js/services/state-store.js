/**
 * StateStore - Nível 1 (Seção 8 do plano).
 * Gerenciamento centralizado de estado reativo e preservação das regras de negócio:
 * - Jogadores, Equipes e Reservas
 * - Modificadores (Mario Kart, Eventos Dinâmicos, Mutações do Caos, Aposta de Sangue)
 * - Torneio & Retrospectiva
 * - Cálculo padronizado de resultados e pontuações
 */

export class StateStore {
    #bus;

    constructor({ eventBus }) {
        this.#bus = eventBus;
    }

    // Leitura das listas globais mantidas em sincronia com core.js
    getPlayers() {
        return window.players || [];
    }

    setPlayers(newPlayers) {
        window.players = newPlayers;
        if (typeof window.renderPlayers === 'function') {
            window.renderPlayers();
        }
    }

    getTeams() {
        return window.teams || [];
    }

    setTeams(newTeams) {
        window.teams = newTeams;
        if (typeof window.renderLobbyTeams === 'function') {
            window.renderLobbyTeams();
        }
    }

    getBench() {
        return window.bench || [];
    }

    setBench(newBench) {
        window.bench = newBench;
        if (typeof window.renderLobbyTeams === 'function') {
            window.renderLobbyTeams();
        }
    }

    getModifiers() {
        return {
            isMarioKart: !!window.isMarioKart,
            isEvents: !!window.isEvents,
            isChaos: !!window.isChaos,
            isBetting: !!window.isBetting,
            currentEvent: window.currentEvent || null,
            tournamentMode: !!window.tournamentMode,
            tourneyTarget: Number(window.tourneyTarget) || 100
        };
    }

    /**
     * Constrói a configuração consolidada para iniciar um minigame.
     * @param {string} gameId
     * @returns {Object}
     */
    buildGameConfig(gameId) {
        const rawConfigs = window.gameConfigs || {};
        const mods = this.getModifiers();

        // Categorias base
        const dict = structuredClone(window.categoriasIniciais || {
            'Animais': ['Leão','Tigre','Elefante','Cachorro','Gato','Crocodilo','Pinguim','Lobo','Tartaruga','Tubarão','Gorila','Capivara','Macaco'],
            'Comida': ['Pizza','Hambúrguer','Sushi','Lasanha','Salada','Churrasco','Pastel','Macarronada','Feijoada','Batata Frita','Chocolate'],
            'Famosos': ['Silvio Santos','Anitta','Michael Jackson','Neymar','Rihanna','Will Smith','Beyoncé','Leonardo DiCaprio','Tom Cruise'],
            'Química & Ciências': ['Tabela Periódica', 'Átomo', 'Laboratório', 'Reação', 'Microscópio', 'DNA', 'Molécula', 'Mistura'],
            'Cinema & TV': ['Pipoca', 'Oscar', 'Cadeira de Diretor', 'Bilheteria', 'Tela Grande', 'Cinépolis', 'Claquete', 'Vilão'],
            'Parques & Lazer': ['Montanha-Russa', 'Roda Gigante', 'Carrossel', 'Beto Carrero', 'Ingresso', 'Tiro ao Alvo', 'Algodão Doce']
        });

        // Se Modo Caos estiver ativo, injeta palavras caóticas
        if (mods.isChaos) {
            dict['Caos & Adulto'] = window.caosWords || [
                'Motel', 'Preservativo', 'Ressaca', 'Gemido', 'Traição', 'Calcinha', 'Cabaré', 'Algemas', 'Orgia'
            ];
        }

        return {
            gameId,
            time: Number(rawConfigs.time) || 60,
            sensibilidade: Number(rawConfigs.sensibilidade) || 25,
            modes: rawConfigs.modes || 'classico',
            themes: Array.isArray(rawConfigs.themes) && rawConfigs.themes.length > 0 ? [...rawConfigs.themes] : Object.keys(dict),
            modifiers: mods,
            dictionary: dict
        };
    }

    /**
     * Aplica o GameResultPayload com todos os modificadores de jogo.
     * @param {Object} resultPayload
     */
    applyGameResult(resultPayload) {
        const mods = this.getModifiers();
        const players = this.getPlayers();

        // Multiplicador de Rodada de Ouro ou Aposta de Sangue
        let multiplier = 1;
        if (mods.currentEvent !== null || mods.isBetting) {
            multiplier = 2;
        }

        const mutations = resultPayload.scoreMutations || [];

        mutations.forEach((mut) => {
            const p = players.find((x) => x.id === mut.playerId);
            if (!p) return;

            let delta = mut.baseDelta || 0;
            if (delta > 0) {
                delta *= multiplier;
            }

            p.score = Math.max(0, (p.score || 0) + delta);

            if (mut.statImpDelta) {
                p.stats.imp = (p.stats.imp || 0) + mut.statImpDelta;
            }
            if (mut.statPrendDelta) {
                p.stats.prend = (p.stats.prend || 0) + mut.statPrendDelta;
            }
            if (mut.falhasDelta) {
                p.falhas = (p.falhas || 0) + mut.falhasDelta;
                if (p.falhas >= 3 && this.#bus) {
                    this.#bus.emit('fx:juice', { type: 'crack' });
                }
            }
        });

        // Aplica penalidade da Aposta de Sangue para perdedores caso indicado
        if (mods.isBetting && resultPayload.losers && Array.isArray(resultPayload.losers)) {
            resultPayload.losers.forEach((loserId) => {
                const lp = players.find((x) => x.id === loserId);
                if (lp) {
                    lp.score = Math.max(0, lp.score - 10);
                }
            });
        }

        this.setPlayers(players);

        if (this.#bus) {
            this.#bus.emit('state:mutation', { resultPayload, players: structuredClone(players) });
        }
    }
}
