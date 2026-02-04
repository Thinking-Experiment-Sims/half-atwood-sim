import { getPresetById, scenarioTitle } from "./presets.js";

export const G = 9.81;
export const TRACK_LENGTH_M = 1.2;

/**
 * @typedef {import("./presets.js").ScenarioId} ScenarioId
 */

/**
 * @typedef {Object} ScenarioConfig
 * @property {ScenarioId} scenario
 * @property {string} scenarioLabel
 * @property {string} presetId
 * @property {string} presetLabel
 * @property {number} cartMassKg
 * @property {number} padMassKg
 * @property {number} systemMassKg
 * @property {number} dragN
 * @property {number} startThresholdN
 */

/**
 * @typedef {Object} TrialInput
 * @property {ScenarioId} scenario
 * @property {string} presetId
 * @property {number} hangingMassKg
 */

/**
 * @typedef {Object} TrialPhysics
 * @property {ScenarioConfig} config
 * @property {number} hangingMassKg
 * @property {number} pullingForceN
 * @property {number} netForceN
 * @property {number} accelerationMps2
 * @property {number} tensionN
 * @property {boolean} moved
 * @property {number|null} travelTimeS
 */

/**
 * @param {TrialInput} input
 * @returns {ScenarioConfig}
 */
export function getScenarioConfig(input) {
  const preset = getPresetById(input.presetId);
  const scenarioFriction = preset.scenario[input.scenario];

  if (!scenarioFriction) {
    throw new Error(`Unsupported scenario: ${input.scenario}`);
  }

  const systemMassKg = input.scenario === "cart_plus_pad"
    ? preset.cartMassKg + preset.padMassKg
    : preset.cartMassKg;

  return {
    scenario: input.scenario,
    scenarioLabel: scenarioTitle(input.scenario),
    presetId: preset.id,
    presetLabel: preset.label,
    cartMassKg: preset.cartMassKg,
    padMassKg: preset.padMassKg,
    systemMassKg,
    dragN: scenarioFriction.dragN,
    startThresholdN: scenarioFriction.startThresholdN
  };
}

/**
 * @param {TrialInput} input
 * @returns {TrialPhysics}
 */
export function computeTrialPhysics(input) {
  const config = getScenarioConfig(input);
  const pullingForceN = input.hangingMassKg * G;

  if (pullingForceN <= config.startThresholdN) {
    return {
      config,
      hangingMassKg: input.hangingMassKg,
      pullingForceN,
      netForceN: 0,
      accelerationMps2: 0,
      tensionN: pullingForceN,
      moved: false,
      travelTimeS: null
    };
  }

  const netForceN = pullingForceN - config.dragN;
  const totalAcceleratedMassKg = config.systemMassKg + input.hangingMassKg;
  const accelerationMps2 = netForceN / totalAcceleratedMassKg;

  if (accelerationMps2 <= 0) {
    return {
      config,
      hangingMassKg: input.hangingMassKg,
      pullingForceN,
      netForceN,
      accelerationMps2: 0,
      tensionN: pullingForceN,
      moved: false,
      travelTimeS: null
    };
  }

  const tensionN = config.systemMassKg * accelerationMps2 + config.dragN;
  const travelTimeS = Math.sqrt((2 * TRACK_LENGTH_M) / accelerationMps2);

  return {
    config,
    hangingMassKg: input.hangingMassKg,
    pullingForceN,
    netForceN,
    accelerationMps2,
    tensionN,
    moved: true,
    travelTimeS
  };
}
