/**
 * @typedef {import("./physics.js").TrialPhysics} TrialPhysics
 * @typedef {import("./signals.js").TrialSignals} TrialSignals
 */

/**
 * @typedef {Object} TrialMeasurement
 * @property {{startS: number, endS: number}|null} forceWindow
 * @property {{startS: number, endS: number}|null} velocityWindow
 * @property {number|null} forceMeanN
 * @property {number|null} accelerationMps2
 */

/**
 * @typedef {Object} TrialRecord
 * @property {string} scenario
 * @property {string} preset
 * @property {number} trial_id
 * @property {number} hanging_mass_kg
 * @property {number} force_mean_N
 * @property {number} accel_mps2
 * @property {boolean} moved
 * @property {number} force_window_start_s
 * @property {number} force_window_end_s
 * @property {number} vel_window_start_s
 * @property {number} vel_window_end_s
 * @property {boolean} noise_enabled
 * @property {string} timestamp_iso
 */

/**
 * @typedef {Object} CurrentTrial
 * @property {number} id
 * @property {TrialPhysics} physics
 * @property {TrialSignals} signals
 */

/**
 * @typedef {Object} AppState
 * @property {"cart_only" | "cart_plus_pad"} scenario
 * @property {string} presetId
 * @property {number} hangingMassKg
 * @property {boolean} noiseEnabled
 * @property {boolean} showFbd
 * @property {CurrentTrial|null} currentTrial
 * @property {TrialMeasurement} measurement
 * @property {TrialRecord[]} trialRecords
 * @property {number} nextTrialId
 */

/**
 * @returns {TrialMeasurement}
 */
function defaultMeasurement() {
  return {
    forceWindow: null,
    velocityWindow: null,
    forceMeanN: null,
    accelerationMps2: null
  };
}

/**
 * @returns {AppState}
 */
function createInitialState() {
  return {
    scenario: "cart_only",
    presetId: "low",
    hangingMassKg: 0.1,
    noiseEnabled: false,
    showFbd: true,
    currentTrial: null,
    measurement: defaultMeasurement(),
    trialRecords: [],
    nextTrialId: 1
  };
}

/**
 * @returns {{getState: () => AppState, setState: (partial: Partial<AppState>) => void, update: (updater: (state: AppState) => AppState) => void, subscribe: (fn: (state: AppState) => void) => () => void, resetMeasurement: () => void}}
 */
export function createStore() {
  /** @type {AppState} */
  let state = createInitialState();
  const subscribers = new Set();

  const notify = () => {
    for (const subscriber of subscribers) {
      subscriber(state);
    }
  };

  return {
    getState() {
      return state;
    },

    setState(partial) {
      state = {
        ...state,
        ...partial
      };
      notify();
    },

    update(updater) {
      state = updater(state);
      notify();
    },

    subscribe(subscriber) {
      subscribers.add(subscriber);

      return () => {
        subscribers.delete(subscriber);
      };
    },

    resetMeasurement() {
      state = {
        ...state,
        measurement: defaultMeasurement()
      };
      notify();
    }
  };
}
