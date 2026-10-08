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

test("changing table mass correctly updates system mass and acceleration", () => {
  const defaultMass = computeTrialPhysics({
    scenario: "cart_only",
    presetId: "low",
    hangingMassKg: 0.4
  });

  const heavyTable = computeTrialPhysics({
    scenario: "cart_only",
    presetId: "low",
    hangingMassKg: 0.4,
    tableMassKg: 1.0
  });

  assert.equal(heavyTable.config.cartMassKg, 1.0);
  assert.equal(heavyTable.config.systemMassKg, 1.0);
  nearlyEqual(heavyTable.accelerationMps2, (0.4 * 9.81 - 0.06) / (1.0 + 0.4));
  assert.ok(heavyTable.accelerationMps2 < defaultMass.accelerationMps2);
  nearlyEqual(heavyTable.tensionN, 1.0 * heavyTable.accelerationMps2 + 0.06);
});

test("cart_plus_pad with custom table mass includes pad mass in system mass", () => {
  const result = computeTrialPhysics({
    scenario: "cart_plus_pad",
    presetId: "low",
    hangingMassKg: 0.5,
    tableMassKg: 0.8
  });

  // padMassKg for low preset is 0.2
  assert.equal(result.config.cartMassKg, 0.8);
  assert.equal(result.config.padMassKg, 0.2);
  nearlyEqual(result.config.systemMassKg, 1.0);
  nearlyEqual(result.accelerationMps2, (0.5 * 9.81 - 1.05) / (1.0 + 0.5));
});

