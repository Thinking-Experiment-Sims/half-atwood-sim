import { ScatterFitGraph, TimeSeriesGraph } from "./graphs.js";
import { HalfAtwoodView } from "./machineView.js";
import { exportGraphsSnapshot, exportTrialDataCsv } from "./export.js";
import { computeTrialPhysics, getScenarioConfig } from "./physics.js";
import { PRESETS, HANGING_MASS_STEPS_KG, getPresetById, scenarioTitle } from "./presets.js";
import { linearRegression, linearRegressionInWindow, mean, sliceWindow } from "./regression.js";
import { generateTrialSignals } from "./signals.js";
import { createStore } from "./state.js";

const MIN_SELECTION_WIDTH_S = 0.12;
const MIN_POINTS = 6;

/**
 * @param {"cart_only" | "cart_plus_pad"} scenario
 * @returns {typeof PRESETS}
 */
function availablePresets(scenario) {
  if (scenario === "cart_only") {
    return PRESETS.filter((preset) => preset.id === "low");
  }

  return PRESETS;
}

/**
 * @param {number} value
 * @param {number} digits
 * @returns {number}
 */
function roundTo(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * @param {number|null} value
 * @param {number} digits
 * @returns {string}
 */
function formatNumber(value, digits = 3) {
  return value === null || Number.isNaN(value) ? "--" : value.toFixed(digits);
}

/**
 * @param {{startS: number, endS: number}|null} selection
 * @returns {boolean}
 */
function isValidSelection(selection) {
  if (!selection) {
    return false;
  }

  return Math.abs(selection.endS - selection.startS) >= MIN_SELECTION_WIDTH_S;
}

/**
 * @param {{startS: number, endS: number}} selection
 * @returns {{startS: number, endS: number}}
 */
function normalize(selection) {
  return {
    startS: Math.min(selection.startS, selection.endS),
    endS: Math.max(selection.startS, selection.endS)
  };
}

const store = createStore();

const elements = {
  scenarioSelect: document.querySelector("#scenarioSelect"),
  presetSelect: document.querySelector("#presetSelect"),
  hangingMassSelect: document.querySelector("#hangingMassSelect"),
  noiseCheckbox: document.querySelector("#noiseCheckbox"),
  showFbdCheckbox: document.querySelector("#showFbdCheckbox"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  runTrialButton: document.querySelector("#runTrialButton"),
  addTrialButton: document.querySelector("#addTrialButton"),
  clearTrialsButton: document.querySelector("#clearTrialsButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportPngButton: document.querySelector("#exportPngButton"),
  statusText: document.querySelector("#statusText"),
  presetDetails: document.querySelector("#presetDetails"),
  currentTrialSummary: document.querySelector("#currentTrialSummary"),
  forceSelectionLabel: document.querySelector("#forceSelectionLabel"),
  velocitySelectionLabel: document.querySelector("#velocitySelectionLabel"),
  forceMeanValue: document.querySelector("#forceMeanValue"),
  accelValue: document.querySelector("#accelValue"),
  dataTableBody: document.querySelector("#dataTableBody"),
  fitEquation: document.querySelector("#fitEquation"),
  fitQuality: document.querySelector("#fitQuality"),
  fitInterpretation: document.querySelector("#fitInterpretation"),
  checklistItems: {
    setup: document.querySelector("#stepSetup"),
    run: document.querySelector("#stepRun"),
    forceWindow: document.querySelector("#stepForceWindow"),
    velocityWindow: document.querySelector("#stepVelocityWindow"),
    add: document.querySelector("#stepAdd"),
    fit: document.querySelector("#stepFit"),
    export: document.querySelector("#stepExport")
  },
  fbdPanel: document.querySelector("#fbdPanel"),
  fbdFigure: document.querySelector("#fbdFigure"),
  machineCanvas: document.querySelector("#machineCanvas"),
  machinePlayButton: document.querySelector("#machinePlayButton"),
  machineTimeSlider: document.querySelector("#machineTimeSlider"),
  machineTimeValue: document.querySelector("#machineTimeValue"),
  machinePhaseValue: document.querySelector("#machinePhaseValue"),
  machineForceValue: document.querySelector("#machineForceValue"),
  machineVelocityValue: document.querySelector("#machineVelocityValue"),
  machineScenarioValue: document.querySelector("#machineScenarioValue")
};

const forceGraph = new TimeSeriesGraph({
  canvas: /** @type {HTMLCanvasElement} */ (document.querySelector("#forceCanvas")),
  title: "Tension (Fₜ) vs Time",
  yLabel: "Fₜ (N)",
  onSelectionChange(selection) {
    store.update((state) => ({
      ...state,
      measurement: {
        ...state.measurement,
        forceWindow: selection
      }
    }));
    updateMeasurementValues();
  }
});

const velocityGraph = new TimeSeriesGraph({
  canvas: /** @type {HTMLCanvasElement} */ (document.querySelector("#velocityCanvas")),
  title: "Velocity vs Time",
  yLabel: "Velocity (m/s)",
  onSelectionChange(selection) {
    store.update((state) => ({
      ...state,
      measurement: {
        ...state.measurement,
        velocityWindow: selection
      }
    }));
    updateMeasurementValues();
  }
});

const fitGraph = new ScatterFitGraph({
  canvas: /** @type {HTMLCanvasElement} */ (document.querySelector("#fitCanvas")),
  title: "Force of Tension (Fₜ) vs Acceleration"
});

const machineView = new HalfAtwoodView({
  canvas: /** @type {HTMLCanvasElement} */ (elements.machineCanvas),
  playButton: /** @type {HTMLButtonElement} */ (elements.machinePlayButton),
  timeSlider: /** @type {HTMLInputElement} */ (elements.machineTimeSlider),
  timeValue: elements.machineTimeValue,
  phaseValue: elements.machinePhaseValue,
  forceValue: elements.machineForceValue,
  velocityValue: elements.machineVelocityValue,
  scenarioValue: elements.machineScenarioValue,
  onTimeUpdate(timeS, trial) {
    renderTrialProgress(timeS, trial);
  }
});

function hydrateSelectors() {
  hydratePresetSelect("cart_only", "low");

  for (const mass of HANGING_MASS_STEPS_KG) {
    const option = document.createElement("option");
    option.value = String(mass);
    option.textContent = `${mass.toFixed(2)} kg`;
    elements.hangingMassSelect.append(option);
  }
}

/**
 * @param {"cart_only" | "cart_plus_pad"} scenario
 * @param {string} selectedPresetId
 */
function hydratePresetSelect(scenario, selectedPresetId) {
  elements.presetSelect.innerHTML = "";

  const options = availablePresets(scenario);
  for (const preset of options) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = scenario === "cart_only"
      ? `${preset.label} (fixed)`
      : preset.label;
    elements.presetSelect.append(option);
  }

  const validSelection = options.some((preset) => preset.id === selectedPresetId)
    ? selectedPresetId
    : options[0].id;

  elements.presetSelect.value = validSelection;
  elements.presetSelect.disabled = scenario === "cart_only";
}

/**
 * @param {number} timeS
 * @param {import("./state.js").CurrentTrial | null} trial
 */
function renderTrialProgress(timeS, trial) {
  if (!trial) {
    forceGraph.setData({
      timesS: [],
      values: [],
      motionWindow: null,
      selection: store.getState().measurement.forceWindow
    });
    velocityGraph.setData({
      timesS: [],
      values: [],
      motionWindow: null,
      selection: store.getState().measurement.velocityWindow
    });
    return;
  }

  const times = trial.signals.timesS;
  let maxIndex = 0;
  while (maxIndex < times.length - 1 && times[maxIndex + 1] <= timeS) {
    maxIndex += 1;
  }

  const visibleTimes = times.slice(0, maxIndex + 1);
  const visibleForce = trial.signals.forceN.slice(0, maxIndex + 1);
  const visibleVelocity = trial.signals.velocityMps.slice(0, maxIndex + 1);
  const motionWindow = trial.signals.motionWindow
    ? {
      startS: trial.signals.motionWindow.startS,
      endS: Math.min(timeS, trial.signals.motionWindow.endS)
    }
    : null;

  const state = store.getState();
  forceGraph.setData({
    timesS: visibleTimes,
    values: visibleForce,
    motionWindow: motionWindow && motionWindow.endS > motionWindow.startS ? motionWindow : null,
    selection: state.measurement.forceWindow
  });
  velocityGraph.setData({
    timesS: visibleTimes,
    values: visibleVelocity,
    motionWindow: motionWindow && motionWindow.endS > motionWindow.startS ? motionWindow : null,
    selection: state.measurement.velocityWindow
  });
}

function bindEvents() {
  elements.scenarioSelect.addEventListener("change", () => {
    const scenario = /** @type {"cart_only" | "cart_plus_pad"} */ (elements.scenarioSelect.value);
    const options = availablePresets(scenario);
    const state = store.getState();
    const nextPresetId = options.some((preset) => preset.id === state.presetId)
      ? state.presetId
      : options[0].id;
    const nextPreset = getPresetById(nextPresetId);

    hydratePresetSelect(scenario, nextPresetId);
    store.setState({
      scenario,
      presetId: nextPresetId,
      noiseEnabled: nextPreset.noiseDefault
    });
    renderFitView();
    renderFbd();
  });

  elements.presetSelect.addEventListener("change", () => {
    const preset = getPresetById(elements.presetSelect.value);
    store.setState({
      presetId: preset.id,
      noiseEnabled: preset.noiseDefault
    });
    renderPresetDetails();
    renderFbd();
  });

  elements.hangingMassSelect.addEventListener("change", () => {
    store.setState({
      hangingMassKg: Number(elements.hangingMassSelect.value)
    });
  });

  elements.noiseCheckbox.addEventListener("change", () => {
    store.setState({
      noiseEnabled: elements.noiseCheckbox.checked
    });
  });

  elements.showFbdCheckbox.addEventListener("change", () => {
    store.setState({
      showFbd: elements.showFbdCheckbox.checked
    });
    renderFbd();
  });

  elements.themeToggleButton.addEventListener("click", () => {
    const currentTheme = document.body.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  elements.runTrialButton.addEventListener("click", runTrial);

  elements.addTrialButton.addEventListener("click", () => {
    const state = store.getState();

    if (!state.currentTrial || !state.currentTrial.physics.moved) {
      return;
    }

    if (state.measurement.forceMeanN === null || state.measurement.accelerationMps2 === null) {
      return;
    }

    const forceWindow = normalize(state.measurement.forceWindow);
    const velocityWindow = normalize(state.measurement.velocityWindow);
    const preset = getPresetById(state.presetId);

    const record = {
      scenario: state.scenario,
      preset: preset.label,
      trial_id: state.currentTrial.id,
      hanging_mass_kg: roundTo(state.currentTrial.physics.hangingMassKg, 3),
      force_mean_N: roundTo(state.measurement.forceMeanN, 4),
      accel_mps2: roundTo(state.measurement.accelerationMps2, 4),
      moved: true,
      force_window_start_s: roundTo(forceWindow.startS, 3),
      force_window_end_s: roundTo(forceWindow.endS, 3),
      vel_window_start_s: roundTo(velocityWindow.startS, 3),
      vel_window_end_s: roundTo(velocityWindow.endS, 3),
      noise_enabled: state.noiseEnabled,
      timestamp_iso: new Date().toISOString()
    };

    store.update((previous) => ({
      ...previous,
      trialRecords: [...previous.trialRecords, record]
    }));

    setStatus("Trial added. Keep going to build your Force-of-Tension-vs-acceleration trend line.", "ok");
  });

  elements.clearTrialsButton.addEventListener("click", () => {
    store.update((state) => ({
      ...state,
      trialRecords: []
    }));

    setStatus("Cleared recorded trials.", "ok");
  });

  elements.exportCsvButton.addEventListener("click", () => {
    const { trialRecords } = store.getState();

    if (!trialRecords.length) {
      setStatus("No data yet. Add at least one trial before exporting CSV.", "warn");
      return;
    }

    exportTrialDataCsv(trialRecords);
    setStatus("CSV export complete.", "ok");
  });

  elements.exportPngButton.addEventListener("click", async () => {
    const state = store.getState();

    if (!state.currentTrial) {
      setStatus("Run a trial first so there is graph data to export.", "warn");
      return;
    }

    await exportGraphsSnapshot({
      forceCanvas: forceGraph.getCanvas(),
      velocityCanvas: velocityGraph.getCanvas(),
      fitCanvas: fitGraph.getCanvas()
    });

    setStatus("Graph snapshot export complete.", "ok");
  });

  elements.dataTableBody.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);

    if (!target.matches("button[data-trial-id]")) {
      return;
    }

    const trialId = Number(target.dataset.trialId);

    store.update((state) => ({
      ...state,
      trialRecords: state.trialRecords.filter((record) => record.trial_id !== trialId)
    }));

    setStatus(`Removed trial ${trialId}.`, "ok");
  });

  document.querySelectorAll(".nudge-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const graphId = button.dataset.graph;
      const boundary = /** @type {"start" | "end"} */ (button.dataset.boundary);
      const direction = Number(button.dataset.dir);
      const delta = Number(button.dataset.step) * direction;

      if (graphId === "force") {
        forceGraph.nudgeSelection(boundary, delta);
      } else {
        velocityGraph.nudgeSelection(boundary, delta);
      }
    });
  });
}

function runTrial() {
  const state = store.getState();

  const physics = computeTrialPhysics({
    scenario: state.scenario,
    presetId: state.presetId,
    hangingMassKg: state.hangingMassKg
  });

  const seed = Math.floor(
    state.nextTrialId * 997
      + state.hangingMassKg * 10000
      + (state.scenario === "cart_plus_pad" ? 7000 : 2000)
      + state.presetId.charCodeAt(0)
  );

  const signals = generateTrialSignals(physics, {
    noiseEnabled: state.noiseEnabled,
    seed
  });

  store.update((previous) => ({
    ...previous,
    currentTrial: {
      id: previous.nextTrialId,
      physics,
      signals
    },
    nextTrialId: previous.nextTrialId + 1,
    measurement: {
      forceWindow: null,
      velocityWindow: null,
      forceMeanN: null,
      accelerationMps2: null
    }
  }));

  machineView.setTrial(store.getState().currentTrial);
  machineView.startPlayback(true);

  if (!physics.moved) {
    setStatus(
      `Trial ${store.getState().currentTrial.id}: hanging force (${physics.pullingForceN.toFixed(2)} N) is below start threshold (${physics.config.startThresholdN.toFixed(2)} N). Do not add this trial.`,
      "warn"
    );
  } else {
    setStatus(`Trial ${store.getState().currentTrial.id} ready. Click Play to generate graphs as the cart moves, then select windows.`, "ok");
  }

  renderCurrentTrialSummary();
  updateMeasurementValues();
  renderChecklist();
  renderFbd();
}

function updateMeasurementValues() {
  const state = store.getState();

  if (!state.currentTrial) {
    store.update((previous) => ({
      ...previous,
      measurement: {
        ...previous.measurement,
        forceMeanN: null,
        accelerationMps2: null
      }
    }));

    renderMeasurementPanel();
    return;
  }

  const { timesS, forceN, velocityMps } = state.currentTrial.signals;

  let forceMeanN = null;
  if (isValidSelection(state.measurement.forceWindow)) {
    const selection = normalize(state.measurement.forceWindow);
    const selected = sliceWindow(timesS, forceN, selection.startS, selection.endS);

    if (selected.values.length >= MIN_POINTS) {
      forceMeanN = mean(selected.values);
    }
  }

  let accelerationMps2 = null;
  if (isValidSelection(state.measurement.velocityWindow)) {
    const selection = normalize(state.measurement.velocityWindow);
    const fit = linearRegressionInWindow(timesS, velocityMps, selection.startS, selection.endS);

    if (fit && fit.count >= MIN_POINTS) {
      accelerationMps2 = fit.slope;
    }
  }

  store.update((previous) => ({
    ...previous,
    measurement: {
      ...previous.measurement,
      forceMeanN,
      accelerationMps2
    }
  }));

  renderMeasurementPanel();
}

function renderMeasurementPanel() {
  const { measurement } = store.getState();

  if (measurement.forceWindow) {
    const normalized = normalize(measurement.forceWindow);
    elements.forceSelectionLabel.textContent = `${normalized.startS.toFixed(2)} s to ${normalized.endS.toFixed(2)} s`;
  } else {
    elements.forceSelectionLabel.textContent = "No window selected";
  }

  if (measurement.velocityWindow) {
    const normalized = normalize(measurement.velocityWindow);
    elements.velocitySelectionLabel.textContent = `${normalized.startS.toFixed(2)} s to ${normalized.endS.toFixed(2)} s`;
  } else {
    elements.velocitySelectionLabel.textContent = "No window selected";
  }

  elements.forceMeanValue.textContent = formatNumber(measurement.forceMeanN, 3);
  elements.accelValue.textContent = formatNumber(measurement.accelerationMps2, 3);

  renderChecklist();
  updateActionButtons();
}

function renderPresetDetails() {
  const state = store.getState();
  const config = getScenarioConfig({
    scenario: state.scenario,
    presetId: state.presetId,
    hangingMassKg: state.hangingMassKg
  });

  elements.presetDetails.innerHTML = [
    `<li><strong>Scenario:</strong> ${config.scenarioLabel}</li>`,
    `<li><strong>Preset:</strong> ${config.presetLabel}</li>`,
    `<li><strong>Cart mass:</strong> ${config.cartMassKg.toFixed(2)} kg</li>`,
    `<li><strong>Pad mass:</strong> ${config.padMassKg.toFixed(2)} kg</li>`,
    `<li><strong>System mass:</strong> ${config.systemMassKg.toFixed(2)} kg</li>`,
    `<li><strong>Moving drag:</strong> ${config.dragN.toFixed(2)} N</li>`,
    `<li><strong>Start threshold:</strong> ${config.startThresholdN.toFixed(2)} N</li>`
  ].join("");
}

function renderCurrentTrialSummary() {
  const state = store.getState();

  if (!state.currentTrial) {
    elements.currentTrialSummary.textContent = "No trial yet. Choose settings and click Run Trial.";
    return;
  }

  const { physics } = state.currentTrial;

  elements.currentTrialSummary.innerHTML = [
    `<li><strong>Trial ID:</strong> ${state.currentTrial.id}</li>`,
    `<li><strong>Hanging mass:</strong> ${physics.hangingMassKg.toFixed(2)} kg</li>`,
    `<li><strong>Pulling force:</strong> ${physics.pullingForceN.toFixed(2)} N</li>`,
    `<li><strong>Moved:</strong> ${physics.moved ? "Yes" : "No"}</li>`,
    `<li><strong>Model acceleration:</strong> ${physics.moved ? `${physics.accelerationMps2.toFixed(3)} m/s^2` : "N/A"}</li>`,
    `<li><strong>Model tension:</strong> ${physics.tensionN.toFixed(3)} N</li>`
  ].join("");
}

function renderTable() {
  const { trialRecords } = store.getState();

  if (!trialRecords.length) {
    elements.dataTableBody.innerHTML = "<tr><td colspan=\"9\">No accepted trials yet.</td></tr>";
    updateActionButtons();
    return;
  }

  elements.dataTableBody.innerHTML = trialRecords.map((record) => {
    const scenario = scenarioTitle(/** @type {"cart_only" | "cart_plus_pad"} */ (record.scenario));

    return [
      "<tr>",
      `<td>${record.trial_id}</td>`,
      `<td>${scenario}</td>`,
      `<td>${record.hanging_mass_kg.toFixed(2)}</td>`,
      `<td>${record.force_mean_N.toFixed(3)}</td>`,
      `<td>${record.accel_mps2.toFixed(3)}</td>`,
      `<td>${record.force_window_start_s.toFixed(2)} - ${record.force_window_end_s.toFixed(2)}</td>`,
      `<td>${record.vel_window_start_s.toFixed(2)} - ${record.vel_window_end_s.toFixed(2)}</td>`,
      `<td><button class=\"table-button\" data-trial-id=\"${record.trial_id}\">Remove</button></td>`,
      "</tr>"
    ].join("");
  }).join("");

  updateActionButtons();
}

function renderFitView() {
  const state = store.getState();
  const relevantRecords = state.trialRecords.filter((record) => record.scenario === state.scenario);
  const points = relevantRecords.map((record) => ({
    x: record.accel_mps2,
    y: record.force_mean_N
  }));

  const fit = points.length >= 2
    ? linearRegression(
      points.map((point) => point.x),
      points.map((point) => point.y)
    )
    : null;

  fitGraph.setData({
    points,
    fit
  });

  if (!fit) {
    elements.fitEquation.textContent = `Need at least 2 accepted ${scenarioTitle(state.scenario)} trials for a linear fit.`;
    elements.fitQuality.textContent = "R^2: --";
    elements.fitInterpretation.innerHTML = "<li>Mathematical meaning: slope = rate of change of Force of Tension with acceleration.</li><li>Physical meaning prompt: compare slope and intercept for part 1 vs part 2 after collecting enough data.</li>";
    renderChecklist();
    return;
  }

  elements.fitEquation.textContent = `Force of Tension, Fₜ = (${fit.slope.toFixed(3)} N/m/s^2)·a + (${fit.intercept.toFixed(3)} N)`;
  elements.fitQuality.textContent = `R^2 = ${fit.r2.toFixed(4)} with ${fit.count} points`;

  const scenarioPrompt = state.scenario === "cart_plus_pad"
    ? "For cart + friction pad, expect a larger positive intercept because friction resists motion."
    : "For cart only, intercept should stay near zero when friction is minimal.";

  elements.fitInterpretation.innerHTML = [
    `<li><strong>Mathematical slope:</strong> ${fit.slope.toFixed(3)} N/m/s^2</li>`,
    `<li><strong>Mathematical intercept:</strong> ${fit.intercept.toFixed(3)} N (Force of Tension at a = 0)</li>`,
    "<li><strong>Physical meaning hint:</strong> Slope approximates effective accelerated mass of the system.</li>",
    "<li><strong>Physical meaning hint:</strong> Intercept represents resistive-force offset when acceleration trends toward zero.</li>",
    `<li><strong>Scenario check:</strong> ${scenarioPrompt}</li>`
  ].join("");

  renderChecklist();
}

function renderChecklist() {
  const state = store.getState();

  const relevantRecords = state.trialRecords.filter((record) => record.scenario === state.scenario);
  const setupDone = Boolean(state.presetId && state.hangingMassKg);
  const runDone = Boolean(state.currentTrial);
  const forceDone = state.measurement.forceMeanN !== null;
  const velocityDone = state.measurement.accelerationMps2 !== null;
  const addDone = relevantRecords.length > 0;
  const fitDone = relevantRecords.length >= 2;
  const exportReady = state.trialRecords.length > 0;

  toggleChecklistItem(elements.checklistItems.setup, setupDone);
  toggleChecklistItem(elements.checklistItems.run, runDone);
  toggleChecklistItem(elements.checklistItems.forceWindow, forceDone);
  toggleChecklistItem(elements.checklistItems.velocityWindow, velocityDone);
  toggleChecklistItem(elements.checklistItems.add, addDone);
  toggleChecklistItem(elements.checklistItems.fit, fitDone);
  toggleChecklistItem(elements.checklistItems.export, exportReady);
}

/**
 * @param {HTMLElement} element
 * @param {boolean} done
 */
function toggleChecklistItem(element, done) {
  element.classList.toggle("done", done);
  element.querySelector("span").textContent = done ? "Done" : "Pending";
}

function updateActionButtons() {
  const state = store.getState();

  const canAddTrial = Boolean(
    state.currentTrial
      && state.currentTrial.physics.moved
      && state.measurement.forceMeanN !== null
      && state.measurement.accelerationMps2 !== null
      && isValidSelection(state.measurement.forceWindow)
      && isValidSelection(state.measurement.velocityWindow)
  );

  elements.addTrialButton.disabled = !canAddTrial;
  elements.exportCsvButton.disabled = state.trialRecords.length === 0;
  elements.clearTrialsButton.disabled = state.trialRecords.length === 0;
  elements.exportPngButton.disabled = state.currentTrial === null;
}

function renderFbd() {
  const state = store.getState();

  elements.fbdPanel.hidden = !state.showFbd;
  if (!state.showFbd) {
    return;
  }

  const config = state.currentTrial
    ? state.currentTrial.physics.config
    : getScenarioConfig({
      scenario: state.scenario,
      presetId: state.presetId,
      hangingMassKg: state.hangingMassKg
    });

  const tension = state.currentTrial?.physics.tensionN ?? state.hangingMassKg * 9.81;
  const friction = config.dragN;
  const weight = config.systemMassKg * 9.81;

  const isPadScenario = state.scenario === "cart_plus_pad";
  const objectLabel = isPadScenario ? "Cart + Pad" : "Cart";
  const darkTheme = document.body.dataset.theme === "dark";
  const vectorColor = darkTheme ? "#d8b767" : "#124d62";
  const textColor = darkTheme ? "#eef2f9" : "#0b3342";
  const bodyFill = darkTheme ? "#2a3446" : "#e6f4f8";
  const bodyStroke = darkTheme ? "#d8b767" : "#124d62";
  const padFill = darkTheme ? "#9a7c35" : "#cf8f2f";

  elements.fbdFigure.innerHTML = `
    <svg viewBox="0 0 520 220" role="img" aria-label="Free-body diagram for ${objectLabel}">
      <defs>
        <marker id="arrowHead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="${vectorColor}"></polygon>
        </marker>
      </defs>
      <rect x="180" y="90" width="140" height="70" rx="8" fill="${bodyFill}" stroke="${bodyStroke}" stroke-width="2"></rect>
      ${isPadScenario ? `<rect x="190" y="165" width="120" height="10" rx="2" fill="${padFill}"></rect>` : ""}
      <line x1="250" y1="125" x2="430" y2="125" stroke="${vectorColor}" stroke-width="3" marker-end="url(#arrowHead)"></line>
      <line x1="250" y1="125" x2="70" y2="125" stroke="${vectorColor}" stroke-width="3" marker-end="url(#arrowHead)"></line>
      <line x1="250" y1="125" x2="250" y2="25" stroke="${vectorColor}" stroke-width="3" marker-end="url(#arrowHead)"></line>
      <line x1="250" y1="125" x2="250" y2="210" stroke="${vectorColor}" stroke-width="3" marker-end="url(#arrowHead)"></line>
      <line x1="244" y1="74" x2="256" y2="84" stroke="${vectorColor}" stroke-width="2"></line>
      <line x1="244" y1="176" x2="256" y2="186" stroke="${vectorColor}" stroke-width="2"></line>
      <circle cx="250" cy="125" r="3.5" fill="${vectorColor}"></circle>
      <text x="12" y="34" fill="${textColor}" font-size="11">
        <tspan>F<tspan baseline-shift="sub" font-size="8">N</tspan> on ${objectLabel} by Track</tspan>
        <tspan x="12" dy="14">≈ ${weight.toFixed(2)} N</tspan>
      </text>
      <text x="302" y="34" fill="${textColor}" font-size="11">
        <tspan>Force of Tension: F<tspan baseline-shift="sub" font-size="8">t</tspan> on ${objectLabel} by String</tspan>
        <tspan x="302" dy="14">≈ ${tension.toFixed(2)} N</tspan>
      </text>
      <text x="12" y="180" fill="${textColor}" font-size="11">
        <tspan>F<tspan baseline-shift="sub" font-size="8">f</tspan> on ${objectLabel} by Track</tspan>
        <tspan x="12" dy="14">≈ ${friction.toFixed(2)} N</tspan>
      </text>
      <text x="302" y="180" fill="${textColor}" font-size="11">
        <tspan>F<tspan baseline-shift="sub" font-size="8">g</tspan> on ${objectLabel} by Earth</tspan>
        <tspan x="302" dy="14">≈ ${weight.toFixed(2)} N</tspan>
      </text>
      <text x="225" y="118" fill="${textColor}" font-size="14">${objectLabel}</text>
      <text x="263" y="146" fill="${textColor}" font-size="11">center of mass</text>
    </svg>
  `;
}

/**
 * @param {"light"|"dark"} theme
 */
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  elements.themeToggleButton.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  elements.themeToggleButton.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  renderFbd();
}

function initTheme() {
  applyTheme("light");
}

/**
 * @param {string} message
 * @param {"ok" | "warn"} tone
 */
function setStatus(message, tone) {
  elements.statusText.textContent = message;
  elements.statusText.dataset.tone = tone;
}

function syncControlsFromState() {
  const state = store.getState();
  const expectedOptions = availablePresets(state.scenario).map((preset) => preset.id);
  const currentOptions = Array.from(elements.presetSelect.options).map((option) => option.value);
  if (expectedOptions.join(",") !== currentOptions.join(",")) {
    hydratePresetSelect(state.scenario, state.presetId);
  }
  elements.presetSelect.disabled = state.scenario === "cart_only";
  elements.scenarioSelect.value = state.scenario;
  elements.presetSelect.value = state.presetId;
  elements.hangingMassSelect.value = String(state.hangingMassKg);
  elements.noiseCheckbox.checked = state.noiseEnabled;
  elements.showFbdCheckbox.checked = state.showFbd;
}

function renderAll() {
  syncControlsFromState();
  renderPresetDetails();
  renderCurrentTrialSummary();
  renderMeasurementPanel();
  renderTable();
  renderFitView();
  renderChecklist();
  renderFbd();
  updateActionButtons();
}

function init() {
  hydrateSelectors();
  bindEvents();
  initTheme();

  const defaultPreset = getPresetById(store.getState().presetId);
  store.setState({ noiseEnabled: defaultPreset.noiseDefault });

  forceGraph.setData({
    timesS: [],
    values: [],
    motionWindow: null,
    selection: null
  });

  velocityGraph.setData({
    timesS: [],
    values: [],
    motionWindow: null,
    selection: null
  });

  fitGraph.setData({
    points: [],
    fit: null
  });
  machineView.setTrial(null);

  store.subscribe(() => {
    renderAll();
  });

  renderAll();
  setStatus("Set a scenario and click Run Trial.", "ok");
}

init();
