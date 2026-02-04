import test from "node:test";
import assert from "node:assert/strict";

import { linearRegression, linearRegressionInWindow, meanInWindow } from "../src/regression.js";

function nearlyEqual(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be near ${expected}`);
}

test("linearRegression returns exact slope and intercept for perfect data", () => {
  const x = [0, 1, 2, 3, 4];
  const y = x.map((value) => 3 * value + 2);

  const fit = linearRegression(x, y);

  assert.ok(fit);
  nearlyEqual(fit.slope, 3);
  nearlyEqual(fit.intercept, 2);
  nearlyEqual(fit.r2, 1);
  assert.equal(fit.count, 5);
});

test("linearRegressionInWindow uses only the selected interval", () => {
  const times = [0, 1, 2, 3, 4, 5];
  const values = [1, 3, 5, 7, 10, 13];

  const fit = linearRegressionInWindow(times, values, 1, 3);

  assert.ok(fit);
  nearlyEqual(fit.slope, 2);
  nearlyEqual(fit.intercept, 1);
  assert.equal(fit.count, 3);
});

test("meanInWindow computes the average from selected values", () => {
  const times = [0, 0.5, 1, 1.5, 2];
  const values = [2, 4, 6, 8, 10];

  const mean = meanInWindow(times, values, 0.5, 1.5);

  nearlyEqual(mean, 6);
});
