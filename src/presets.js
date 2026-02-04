/**
 * @typedef {"cart_only" | "cart_plus_pad"} ScenarioId
 */

/**
 * @typedef {Object} ScenarioFrictionConfig
 * @property {number} dragN Constant opposing force while moving.
 * @property {number} startThresholdN Minimum pulling force required to start sustained motion.
 */

/**
 * @typedef {Object} TeacherPreset
 * @property {string} id
 * @property {string} label
 * @property {boolean} noiseDefault
 * @property {number} cartMassKg
 * @property {number} padMassKg
 * @property {{cart_only: ScenarioFrictionConfig, cart_plus_pad: ScenarioFrictionConfig}} scenario
 */

export const HANGING_MASS_STEPS_KG = Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);

/** @type {TeacherPreset[]} */
export const PRESETS = Object.freeze([
  {
    id: "low",
    label: "Low Friction",
    noiseDefault: false,
    cartMassKg: 0.5,
    padMassKg: 0.2,
    scenario: {
      cart_only: {
        dragN: 0.06,
        startThresholdN: 0.04
      },
      cart_plus_pad: {
        dragN: 1.05,
        startThresholdN: 0.95
      }
    }
  },
  {
    id: "medium",
    label: "Medium Friction",
    noiseDefault: false,
    cartMassKg: 0.5,
    padMassKg: 0.22,
    scenario: {
      cart_only: {
        dragN: 0.09,
        startThresholdN: 0.06
      },
      cart_plus_pad: {
        dragN: 1.35,
        startThresholdN: 1.15
      }
    }
  },
  {
    id: "high",
    label: "High Friction",
    noiseDefault: true,
    cartMassKg: 0.5,
    padMassKg: 0.24,
    scenario: {
      cart_only: {
        dragN: 0.12,
        startThresholdN: 0.08
      },
      cart_plus_pad: {
        dragN: 1.7,
        startThresholdN: 1.35
      }
    }
  }
]);

/**
 * @param {string} presetId
 * @returns {TeacherPreset}
 */
export function getPresetById(presetId) {
  const preset = PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }

  return preset;
}

/**
 * @param {ScenarioId} scenario
 * @returns {string}
 */
export function scenarioTitle(scenario) {
  return scenario === "cart_plus_pad" ? "Cart + Friction Pad" : "Cart Only";
}
