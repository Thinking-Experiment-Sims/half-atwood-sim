/**
 * @typedef {import("./physics.js").TrialPhysics} TrialPhysics
 */

/**
 * @typedef {Object} SignalPhases
 * @property {number} initialStartS
 * @property {number} accelStartS
 * @property {number} accelEndS
 * @property {number} stopEndS
 */

/**
 * @typedef {Object} TrialSignals
 * @property {number[]} timesS
 * @property {number[]} forceN
 * @property {number[]} velocityMps
 * @property {{startS: number, endS: number}|null} motionWindow
 * @property {SignalPhases} phases
 */

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} presetSeed
 * @param {boolean} noiseEnabled
 * @returns {(scale: number) => number}
 */
function buildNoiseSampler(presetSeed, noiseEnabled) {
  if (!noiseEnabled) {
    return () => 0;
  }

  const rng = createRng(presetSeed);

  return (scale) => {
    const u1 = clamp(rng(), 1e-8, 1 - 1e-8);
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z * scale;
  };
}

/**
 * @param {TrialPhysics} physics
 * @param {{noiseEnabled: boolean, seed: number, durationS?: number, sampleRateHz?: number}} options
 * @returns {TrialSignals}
 */
export function generateTrialSignals(physics, options) {
  const durationS = options.durationS ?? 4.5;
  const sampleRateHz = options.sampleRateHz ?? 60;
  const count = Math.floor(durationS * sampleRateHz) + 1;

  const noise = buildNoiseSampler(options.seed, options.noiseEnabled);

  const timesS = [];
  const forceN = [];
  const velocityMps = [];

  const initialStartS = 0;
  const accelStartS = 0.7;
  const accelDurationS = physics.moved
    ? clamp((physics.travelTimeS ?? 1.8) * 0.8, 1.1, 2.0)
    : 0;
  const accelEndS = physics.moved
    ? clamp(accelStartS + accelDurationS, 1.8, durationS - 1.2)
    : accelStartS;
  const rampWindowS = physics.moved ? Math.min(0.24, Math.max(0.12, 0.14 * accelDurationS)) : 0;
  const linearStartS = accelStartS + rampWindowS;
  const linearEndS = accelEndS - rampWindowS;
  const stopDurationS = physics.moved ? 0.45 : 0;
  const stopEndS = physics.moved
    ? clamp(accelEndS + stopDurationS, accelEndS + 0.35, durationS - 0.35)
    : accelStartS + 0.35;

  const peakVelocity = physics.moved ? physics.accelerationMps2 * (accelEndS - accelStartS) : 0;

  for (let index = 0; index < count; index += 1) {
    const t = index / sampleRateHz;

    let force = 0;
    let velocity = 0;

    if (physics.moved) {
      if (t < accelStartS) {
        const phaseRatio = t / accelStartS;
        force = physics.tensionN * (0.15 + 0.85 * phaseRatio) + 0.01 * Math.sin(8 * t);
        velocity = 0.004 * Math.sin(9 * t);
      } else if (t <= accelEndS) {
        const dt = t - accelStartS;
        const oscillation = 0.035 * Math.exp(-3 * dt) * Math.sin(14 * dt);
        force = physics.tensionN + oscillation;
        if (t < linearStartS) {
          // Smooth ramp into near-constant acceleration.
          const u = clamp((t - accelStartS) / rampWindowS, 0, 1);
          velocity = 0.5 * physics.accelerationMps2 * rampWindowS * u * u;
        } else if (t <= linearEndS) {
          const vRamp = 0.5 * physics.accelerationMps2 * rampWindowS;
          velocity = vRamp + physics.accelerationMps2 * (t - linearStartS);
        } else {
          // Smooth ramp out of acceleration to avoid an unrealistic sharp peak.
          const u = clamp((t - linearEndS) / rampWindowS, 0, 1);
          const vRamp = 0.5 * physics.accelerationMps2 * rampWindowS;
          const vLinear = vRamp + physics.accelerationMps2 * (linearEndS - linearStartS);
          velocity = vLinear + physics.accelerationMps2 * rampWindowS * (u - 0.5 * u * u);
        }
      } else if (t <= stopEndS) {
        const dt = t - accelEndS;
        const ratio = clamp(dt / stopDurationS, 0, 1);
        velocity = peakVelocity * Math.exp(-3.2 * dt);
        force = (1 - ratio) * physics.tensionN * 0.7 + 0.03 * Math.sin(18 * dt) * Math.exp(-4 * dt);
      } else {
        const dt = t - stopEndS;
        velocity = 0.002 * Math.sin(11 * dt) * Math.exp(-4 * dt);
        force = 0.01 * Math.sin(14 * dt) * Math.exp(-4 * dt);
      }

      force += noise(0.01);
      velocity += noise(0.006);
    } else {
      const pulse = Math.sin(10 * t) > 0.82 ? 1 : 0;
      force = physics.pullingForceN * (0.9 + 0.05 * Math.sin(3.8 * t)) + pulse * 0.04;
      velocity = (pulse ? 0.015 : 0) + 0.003 * Math.sin(11 * t);

      force += noise(0.015);
      velocity += noise(0.003);
    }

    timesS.push(t);
    forceN.push(force);
    velocityMps.push(velocity);
  }

  return {
    timesS,
    forceN,
    velocityMps,
    motionWindow: physics.moved
      ? {
          startS: accelStartS,
          endS: accelEndS
        }
      : null,
    phases: {
      initialStartS,
      accelStartS,
      accelEndS,
      stopEndS
    }
  };
}
