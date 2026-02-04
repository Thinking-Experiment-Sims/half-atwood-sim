/**
 * @typedef {import("./state.js").CurrentTrial} CurrentTrial
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
 * @param {number[]} xs
 * @param {number[]} ys
 * @param {number} x
 * @returns {number}
 */
function interpolate(xs, ys, x) {
  if (!xs.length) {
    return 0;
  }

  if (x <= xs[0]) {
    return ys[0];
  }

  const lastIndex = xs.length - 1;
  if (x >= xs[lastIndex]) {
    return ys[lastIndex];
  }

  let index = 0;
  while (index < lastIndex && xs[index + 1] < x) {
    index += 1;
  }

  const x1 = xs[index];
  const x2 = xs[index + 1];
  const y1 = ys[index];
  const y2 = ys[index + 1];

  const ratio = (x - x1) / (x2 - x1 || 1);
  return y1 + ratio * (y2 - y1);
}

/**
 * @param {CurrentTrial} trial
 * @param {number} timeS
 * @returns {number}
 */
function cartDisplacementM(trial, timeS) {
  const { phases } = trial.signals;
  const a = trial.physics.accelerationMps2;

  if (!trial.physics.moved) {
    return 0;
  }

  if (timeS <= phases.accelStartS) {
    return 0;
  }

  if (timeS <= phases.accelEndS) {
    const dt = timeS - phases.accelStartS;
    return 0.5 * a * dt * dt;
  }

  const accelDt = phases.accelEndS - phases.accelStartS;
  const accelDistance = 0.5 * a * accelDt * accelDt;
  const peakVelocity = a * accelDt;

  if (timeS <= phases.stopEndS) {
    const stopDt = timeS - phases.accelEndS;
    const stopDuration = phases.stopEndS - phases.accelEndS || 0.001;
    const decel = peakVelocity / stopDuration;
    return accelDistance + peakVelocity * stopDt - 0.5 * decel * stopDt * stopDt;
  }

  const stopDuration = phases.stopEndS - phases.accelEndS || 0.001;
  return accelDistance + 0.5 * peakVelocity * stopDuration;
}

export class HalfAtwoodView {
  /**
   * @param {{
   * canvas: HTMLCanvasElement,
   * playButton: HTMLButtonElement,
   * timeSlider: HTMLInputElement,
   * timeValue: HTMLElement,
   * phaseValue: HTMLElement,
   * forceValue: HTMLElement,
   * velocityValue: HTMLElement,
   * scenarioValue: HTMLElement
   * onTimeUpdate?: (timeS: number, trial: CurrentTrial|null) => void
   * }} options
   */
  constructor(options) {
    this.canvas = options.canvas;
    this.context = this.canvas.getContext("2d");
    this.playButton = options.playButton;
    this.timeSlider = options.timeSlider;
    this.timeValue = options.timeValue;
    this.phaseValue = options.phaseValue;
    this.forceValue = options.forceValue;
    this.velocityValue = options.velocityValue;
    this.scenarioValue = options.scenarioValue;
    this.onTimeUpdate = options.onTimeUpdate ?? (() => {});

    this.trial = null;
    this.currentTimeS = 0;
    this.playing = false;
    this.lastFrame = null;

    this.playButton.addEventListener("click", () => {
      if (!this.trial) {
        return;
      }

      if (this.playing) {
        this.pause();
      } else {
        this.startPlayback(false);
      }
    });

    this.timeSlider.addEventListener("input", () => {
      this.playing = false;
      this.playButton.textContent = "Play";
      this.currentTimeS = Number(this.timeSlider.value);
      this.render();
      this.onTimeUpdate(this.currentTimeS, this.trial);
    });

    window.addEventListener("resize", () => this.render());
    this.renderEmpty();
  }

  /**
   * @param {CurrentTrial|null} trial
   */
  setTrial(trial) {
    this.trial = trial;
    this.playing = false;
    this.playButton.textContent = "Play";

    if (!trial) {
      this.renderEmpty();
      this.onTimeUpdate(0, null);
      return;
    }

    const maxTime = trial.signals.timesS[trial.signals.timesS.length - 1] ?? 4.5;
    this.timeSlider.max = String(maxTime);
    this.currentTimeS = 0;
    this.timeSlider.value = "0";
    this.render();
    this.onTimeUpdate(this.currentTimeS, this.trial);
  }

  /**
   * @param {boolean} restart
   */
  startPlayback(restart = true) {
    if (!this.trial) {
      return;
    }

    if (restart) {
      this.currentTimeS = 0;
      this.timeSlider.value = "0";
      this.onTimeUpdate(this.currentTimeS, this.trial);
    }

    this.playing = true;
    this.playButton.textContent = "Pause";
    this.lastFrame = null;
    window.requestAnimationFrame(this.animate.bind(this));
  }

  pause() {
    this.playing = false;
    this.playButton.textContent = "Play";
  }

  animate(timestamp) {
    if (!this.playing || !this.trial) {
      return;
    }

    if (this.lastFrame === null) {
      this.lastFrame = timestamp;
    }

    const dt = (timestamp - this.lastFrame) / 1000;
    this.lastFrame = timestamp;

    const maxTime = Number(this.timeSlider.max);
    this.currentTimeS = clamp(this.currentTimeS + dt, 0, maxTime);
    this.timeSlider.value = this.currentTimeS.toFixed(2);
    this.render();
    this.onTimeUpdate(this.currentTimeS, this.trial);

    if (this.currentTimeS >= maxTime) {
      this.pause();
      return;
    }

    window.requestAnimationFrame(this.animate.bind(this));
  }

  renderEmpty() {
    this.resizeCanvas();
    const ratio = window.devicePixelRatio || 1;
    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f6fbfd";
    ctx.fillRect(0, 0, width, height);

    const trackLeft = 55 * ratio;
    const trackRight = width - 185 * ratio;
    const trackY = 125 * ratio;
    const pulleyX = trackRight + 58 * ratio;
    const pulleyY = trackY;
    const cartX = trackLeft + 20 * ratio;
    const massTopY = pulleyY + 26 * ratio;

    ctx.strokeStyle = "#2d5865";
    ctx.lineWidth = 3 * ratio;
    ctx.beginPath();
    ctx.moveTo(trackLeft, trackY + 28 * ratio);
    ctx.lineTo(trackRight, trackY + 28 * ratio);
    ctx.stroke();

    ctx.strokeStyle = "#507885";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(trackRight, trackY + 28 * ratio);
    ctx.lineTo(pulleyX, pulleyY);
    ctx.lineTo(pulleyX, massTopY);
    ctx.stroke();

    ctx.fillStyle = "#dceff4";
    ctx.strokeStyle = "#2d5865";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.arc(pulleyX, pulleyY, 16 * ratio, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#76b7cb";
    ctx.strokeStyle = "#1b5568";
    ctx.fillRect(cartX, trackY - 5 * ratio, 76 * ratio, 34 * ratio);
    ctx.strokeRect(cartX, trackY - 5 * ratio, 76 * ratio, 34 * ratio);

    ctx.fillStyle = "#8ab1bf";
    ctx.fillRect(pulleyX - 16 * ratio, massTopY, 32 * ratio, 36 * ratio);
    ctx.strokeRect(pulleyX - 16 * ratio, massTopY, 32 * ratio, 36 * ratio);

    ctx.fillStyle = "#203f4a";
    ctx.font = `${12 * ratio}px 'Trebuchet MS', sans-serif`;
    ctx.fillText("Track", trackLeft, trackY + 56 * ratio);
    ctx.fillText("Pulley", pulleyX - 20 * ratio, pulleyY - 24 * ratio);
    ctx.fillText("Cart + Force Sensor", cartX - 2 * ratio, trackY - 16 * ratio);
    ctx.font = `${14 * ratio}px 'Trebuchet MS', sans-serif`;
    ctx.fillStyle = "#2f5c69";
    ctx.fillText("Run a trial to animate this Half Atwood setup.", 24 * ratio, 42 * ratio);

    this.timeValue.textContent = "0.00 s";
    this.phaseValue.textContent = "--";
    this.forceValue.textContent = "-- N";
    this.velocityValue.textContent = "-- m/s";
    this.scenarioValue.textContent = "--";
  }

  render() {
    if (!this.trial) {
      this.renderEmpty();
      return;
    }

    this.resizeCanvas();

    const ratio = window.devicePixelRatio || 1;
    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f6fbfd";
    ctx.fillRect(0, 0, width, height);

    const trackLeft = 55 * ratio;
    const trackRight = width - 185 * ratio;
    const trackY = 125 * ratio;
    const pulleyX = trackRight + 58 * ratio;
    const pulleyY = trackY;
    const cartBaseX = trackLeft + 20 * ratio;

    const displacement = cartDisplacementM(this.trial, this.currentTimeS);
    const normalizedMove = clamp(displacement / 1.2, 0, 1);
    const cartX = cartBaseX + normalizedMove * (trackRight - cartBaseX - 80 * ratio);

    const massTopY = pulleyY + 26 * ratio + normalizedMove * 80 * ratio;

    ctx.strokeStyle = "#2d5865";
    ctx.lineWidth = 3 * ratio;
    ctx.beginPath();
    ctx.moveTo(trackLeft, trackY + 28 * ratio);
    ctx.lineTo(trackRight, trackY + 28 * ratio);
    ctx.stroke();

    ctx.strokeStyle = "#507885";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(trackRight, trackY + 28 * ratio);
    ctx.lineTo(pulleyX, pulleyY);
    ctx.lineTo(pulleyX, massTopY);
    ctx.stroke();

    ctx.fillStyle = "#dceff4";
    ctx.strokeStyle = "#2d5865";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.arc(pulleyX, pulleyY, 16 * ratio, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#76b7cb";
    ctx.strokeStyle = "#1b5568";
    ctx.fillRect(cartX, trackY - 5 * ratio, 76 * ratio, 34 * ratio);
    ctx.strokeRect(cartX, trackY - 5 * ratio, 76 * ratio, 34 * ratio);

    if (this.trial.physics.config.scenario === "cart_plus_pad") {
      ctx.fillStyle = "#be8c36";
      ctx.fillRect(cartX + 7 * ratio, trackY + 31 * ratio, 62 * ratio, 8 * ratio);
    }

    ctx.fillStyle = "#8ab1bf";
    ctx.fillRect(pulleyX - 16 * ratio, massTopY, 32 * ratio, 36 * ratio);
    ctx.strokeRect(pulleyX - 16 * ratio, massTopY, 32 * ratio, 36 * ratio);

    const liveForce = interpolate(this.trial.signals.timesS, this.trial.signals.forceN, this.currentTimeS);
    const liveVelocity = interpolate(this.trial.signals.timesS, this.trial.signals.velocityMps, this.currentTimeS);

    ctx.fillStyle = "#203f4a";
    ctx.font = `${12 * ratio}px 'Trebuchet MS', sans-serif`;
    ctx.fillText("Track", trackLeft, trackY + 56 * ratio);
    ctx.fillText("Pulley", pulleyX - 20 * ratio, pulleyY - 24 * ratio);
    ctx.fillText("Force Sensor", cartX + 4 * ratio, trackY - 16 * ratio);

    this.timeValue.textContent = `${this.currentTimeS.toFixed(2)} s`;
    this.forceValue.textContent = `${liveForce.toFixed(3)} N`;
    this.velocityValue.textContent = `${liveVelocity.toFixed(3)} m/s`;
    this.scenarioValue.textContent = this.trial.physics.config.scenarioLabel;
    this.phaseValue.textContent = this.currentPhaseLabel(this.currentTimeS);
  }

  /**
   * @param {number} t
   * @returns {string}
   */
  currentPhaseLabel(t) {
    if (!this.trial || !this.trial.physics.moved) {
      return "No sustained motion";
    }

    const { phases } = this.trial.signals;

    if (t < phases.accelStartS) {
      return "Initial setup phase";
    }

    if (t <= phases.accelEndS) {
      return "Steady acceleration phase";
    }

    if (t <= phases.stopEndS) {
      return "Stop/deceleration phase";
    }

    return "Post-stop phase";
  }

  resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * ratio);
    const height = Math.floor(this.canvas.clientHeight * ratio);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}
