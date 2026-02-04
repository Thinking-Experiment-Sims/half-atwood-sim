import test from "node:test";
import assert from "node:assert/strict";

import { computeTrialPhysics } from "../src/physics.js";

function nearlyEqual(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be near ${expected}`);
}

test("cart_only uses configured drag and returns expected acceleration", () => {
  const result = computeTrialPhysics({
    scenario: "cart_only",
    presetId: "low",
    hangingMassKg: 0.4
  });

  assert.equal(result.moved, true);
  nearlyEqual(result.pullingForceN, 0.4 * 9.81);
  nearlyEqual(result.accelerationMps2, (0.4 * 9.81 - 0.06) / (0.5 + 0.4));
  nearlyEqual(result.tensionN, result.config.systemMassKg * result.accelerationMps2 + result.config.dragN);
});

test("start threshold blocks low-force motion", () => {
  const result = computeTrialPhysics({
    scenario: "cart_plus_pad",
    presetId: "high",
    hangingMassKg: 0.1
  });

  assert.equal(result.moved, false);
  nearlyEqual(result.accelerationMps2, 0);
  assert.equal(result.travelTimeS, null);
});

test("cart_plus_pad has lower acceleration than cart_only under same hanging mass", () => {
  const cartOnly = computeTrialPhysics({
    scenario: "cart_only",
    presetId: "medium",
    hangingMassKg: 0.4
  });

  const withPad = computeTrialPhysics({
    scenario: "cart_plus_pad",
    presetId: "medium",
    hangingMassKg: 0.4
  });

  assert.equal(cartOnly.moved, true);
  assert.equal(withPad.moved, true);
  assert.ok(withPad.accelerationMps2 < cartOnly.accelerationMps2);
  assert.ok(withPad.config.systemMassKg > cartOnly.config.systemMassKg);
});
