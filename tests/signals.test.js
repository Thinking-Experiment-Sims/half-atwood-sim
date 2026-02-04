import test from "node:test";
import assert from "node:assert/strict";

import { computeTrialPhysics } from "../src/physics.js";
import { generateTrialSignals } from "../src/signals.js";

test("noise-disabled signals are deterministic regardless of seed", () => {
  const physics = computeTrialPhysics({
    scenario: "cart_only",
    presetId: "low",
    hangingMassKg: 0.3
  });

  const a = generateTrialSignals(physics, { noiseEnabled: false, seed: 1 });
  const b = generateTrialSignals(physics, { noiseEnabled: false, seed: 99999 });

  assert.deepEqual(a.forceN, b.forceN);
  assert.deepEqual(a.velocityMps, b.velocityMps);
});

test("noise-enabled signals are repeatable with same seed", () => {
  const physics = computeTrialPhysics({
    scenario: "cart_plus_pad",
    presetId: "medium",
    hangingMassKg: 0.5
  });

  const a = generateTrialSignals(physics, { noiseEnabled: true, seed: 42 });
  const b = generateTrialSignals(physics, { noiseEnabled: true, seed: 42 });
  const c = generateTrialSignals(physics, { noiseEnabled: true, seed: 43 });

  assert.deepEqual(a.forceN, b.forceN);
  assert.deepEqual(a.velocityMps, b.velocityMps);
  assert.notDeepEqual(a.forceN, c.forceN);
});

test("no-motion trial returns null motionWindow", () => {
  const physics = computeTrialPhysics({
    scenario: "cart_plus_pad",
    presetId: "high",
    hangingMassKg: 0.1
  });

  const signals = generateTrialSignals(physics, { noiseEnabled: false, seed: 5 });
  assert.equal(physics.moved, false);
  assert.equal(signals.motionWindow, null);
});

test("moved trial includes ordered phases and stop segment", () => {
  const physics = computeTrialPhysics({
    scenario: "cart_only",
    presetId: "low",
    hangingMassKg: 0.4
  });

  const signals = generateTrialSignals(physics, { noiseEnabled: false, seed: 22 });

  assert.ok(signals.phases.accelStartS > signals.phases.initialStartS);
  assert.ok(signals.phases.accelEndS > signals.phases.accelStartS);
  assert.ok(signals.phases.stopEndS > signals.phases.accelEndS);
  assert.ok(signals.motionWindow);
  assert.equal(signals.motionWindow.startS, signals.phases.accelStartS);
  assert.equal(signals.motionWindow.endS, signals.phases.accelEndS);
});
