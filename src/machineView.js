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

/**
 * Draws a clean directional vector arrow with arrowhead
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {string} color
 * @param {number} lineWidth
 */
function drawArrow(ctx, fromX, fromY, toX, toY, color, lineWidth = 2.5) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length < 2) return;

  const headLength = Math.min(8, length * 0.4);
  const angle = Math.atan2(dy, dx);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
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

    // Pure white canvas background with faint engineering grid
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(15, 126, 155, 0.04)";
    ctx.lineWidth = 1;
    for (let gx = 20 * ratio; gx < width; gx += 25 * ratio) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 20 * ratio; gy < height; gy += 25 * ratio) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    const trackLeft = 55 * ratio;
    const trackRight = width - 170 * ratio;
    const trackSurfaceY = 96 * ratio;
    const trackH = 12 * ratio;
    const tableTopY = trackSurfaceY - trackH;
    const floorY = height - 20 * ratio;
    const tableThickness = 16 * ratio;

    // Floor Line
    ctx.strokeStyle = "#c8dbe3";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(width, floorY);
    ctx.stroke();

    // Table Support Legs
    const legLeftX = trackLeft + 25 * ratio;
    const legRightX = trackRight - 45 * ratio;
    const legW = 14 * ratio;
    ctx.fillStyle = "#e2edf2";
    ctx.strokeStyle = "#b0c9d4";
    ctx.lineWidth = 1.5 * ratio;
    ctx.fillRect(legLeftX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));
    ctx.strokeRect(legLeftX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));
    ctx.fillRect(legRightX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));
    ctx.strokeRect(legRightX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));

    // Tabletop slab
    const tableGrad = ctx.createLinearGradient(0, trackSurfaceY, 0, trackSurfaceY + tableThickness);
    tableGrad.addColorStop(0, "#f4f9fb");
    tableGrad.addColorStop(1, "#dceaf0");
    ctx.fillStyle = tableGrad;
    ctx.beginPath();
    ctx.roundRect(trackLeft - 20 * ratio, trackSurfaceY, trackRight - trackLeft + 30 * ratio, tableThickness, [0, 4 * ratio, 4 * ratio, 0]);
    ctx.fill();
    ctx.strokeStyle = "#9bbecb";
    ctx.lineWidth = 1.8 * ratio;
    ctx.stroke();

    // Dynamics Track
    const trackGrad = ctx.createLinearGradient(0, tableTopY, 0, trackSurfaceY);
    trackGrad.addColorStop(0, "#e9f2f6");
    trackGrad.addColorStop(0.5, "#d5e4ec");
    trackGrad.addColorStop(1, "#b5ccd7");
    ctx.fillStyle = trackGrad;
    ctx.fillRect(trackLeft, tableTopY, trackRight - trackLeft, trackH);
    ctx.strokeStyle = "#658595";
    ctx.lineWidth = 1.6 * ratio;
    ctx.strokeRect(trackLeft, tableTopY, trackRight - trackLeft, trackH);

    // End-stop bumpers
    ctx.fillStyle = "#2d434e";
    ctx.fillRect(trackLeft, tableTopY - 12 * ratio, 8 * ratio, trackH + 12 * ratio);
    ctx.fillRect(trackRight - 8 * ratio, tableTopY - 12 * ratio, 8 * ratio, trackH + 12 * ratio);
    ctx.fillStyle = "#d67b19";
    ctx.fillRect(trackLeft + 2 * ratio, tableTopY - 8 * ratio, 4 * ratio, 6 * ratio);
    ctx.fillRect(trackRight - 6 * ratio, tableTopY - 8 * ratio, 4 * ratio, 6 * ratio);

    // Track Metric Ruler Ticks
    ctx.fillStyle = "#2d4e5c";
    ctx.font = `600 ${9 * ratio}px 'IBM Plex Sans', sans-serif`;
    const trackSpan = trackRight - trackLeft - 30 * ratio;
    for (let i = 0; i <= 3; i += 1) {
      const mx = trackLeft + 15 * ratio + (i / 3) * trackSpan;
      ctx.strokeStyle = "#416575";
      ctx.lineWidth = 1.2 * ratio;
      ctx.beginPath();
      ctx.moveTo(mx, tableTopY);
      ctx.lineTo(mx, tableTopY + 5 * ratio);
      ctx.stroke();
      ctx.fillText(`${(i * 0.5).toFixed(1)}m`, mx - 8 * ratio, tableTopY + 18 * ratio);
    }

    // Pulley Bracket and Wheel
    const pulleyRadius = 15 * ratio;
    const pulleyX = trackRight + pulleyRadius + 2 * ratio;
    const pulleyY = trackSurfaceY - 4 * ratio;

    // Bracket
    ctx.fillStyle = "#435d6a";
    ctx.fillRect(trackRight, trackSurfaceY - 4 * ratio, 8 * ratio, tableThickness + 8 * ratio);
    ctx.strokeStyle = "#253b45";
    ctx.lineWidth = 1.2 * ratio;
    ctx.strokeRect(trackRight, trackSurfaceY - 4 * ratio, 8 * ratio, tableThickness + 8 * ratio);

    // Pulley Arm
    ctx.strokeStyle = "#5b7785";
    ctx.lineWidth = 3 * ratio;
    ctx.beginPath();
    ctx.moveTo(trackRight + 8 * ratio, trackSurfaceY);
    ctx.lineTo(pulleyX, pulleyY);
    ctx.stroke();

    // Pulley Wheel
    ctx.fillStyle = "#edf3f6";
    ctx.beginPath();
    ctx.arc(pulleyX, pulleyY, pulleyRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f7e9b";
    ctx.lineWidth = 2 * ratio;
    ctx.stroke();

    // Spokes
    for (let i = 0; i < 6; i += 1) {
      const angle = (i * Math.PI) / 3;
      ctx.strokeStyle = "#658290";
      ctx.lineWidth = 1.2 * ratio;
      ctx.beginPath();
      ctx.moveTo(pulleyX, pulleyY);
      ctx.lineTo(pulleyX + (pulleyRadius - 2 * ratio) * Math.cos(angle), pulleyY + (pulleyRadius - 2 * ratio) * Math.sin(angle));
      ctx.stroke();
    }
    ctx.fillStyle = "#123140";
    ctx.beginPath();
    ctx.arc(pulleyX, pulleyY, 3.5 * ratio, 0, Math.PI * 2);
    ctx.fill();

    // Cart (at start position)
    const cartX = trackLeft + 18 * ratio;
    const cartW = 80 * ratio;
    const cartH = 38 * ratio;
    const wheelR = 7.5 * ratio;
    const cartBodyH = cartH - wheelR;
    const cartBodyY = trackSurfaceY - cartH;

    // Wheels
    for (const wx of [cartX + 16 * ratio, cartX + cartW - 16 * ratio]) {
      ctx.fillStyle = "#253b47";
      ctx.beginPath();
      ctx.arc(wx, trackSurfaceY - wheelR, wheelR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f7e9b";
      ctx.lineWidth = 1.5 * ratio;
      ctx.stroke();
      ctx.fillStyle = "#dce7eb";
      ctx.beginPath();
      ctx.arc(wx, trackSurfaceY - wheelR, 2.5 * ratio, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cart Body (Signature Teal)
    const cartGrad = ctx.createLinearGradient(cartX, cartBodyY, cartX, cartBodyY + cartBodyH);
    cartGrad.addColorStop(0, "#1495b5");
    cartGrad.addColorStop(0.4, "#0f7e9b");
    cartGrad.addColorStop(1, "#095a6f");
    ctx.fillStyle = cartGrad;
    ctx.strokeStyle = "#084959";
    ctx.lineWidth = 1.8 * ratio;
    ctx.beginPath();
    ctx.roundRect(cartX, cartBodyY, cartW, cartBodyH, 4 * ratio);
    ctx.fill();
    ctx.stroke();

    // Mass tray & Force Sensor Box
    ctx.fillStyle = "rgba(18, 49, 64, 0.25)";
    ctx.beginPath();
    ctx.roundRect(cartX + 6 * ratio, cartBodyY + 3 * ratio, cartW - 12 * ratio, 12 * ratio, 2 * ratio);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${9.5 * ratio}px 'IBM Plex Sans', sans-serif`;
    ctx.fillText("Cart + Sensor", cartX + 8 * ratio, cartBodyY + cartBodyH - 6 * ratio);

    // Tie hook
    const hookX = cartX + cartW;
    const hookY = trackSurfaceY - 18 * ratio;
    ctx.fillStyle = "#2d4e5c";
    ctx.beginPath();
    ctx.arc(hookX, hookY, 3 * ratio, 0, Math.PI * 2);
    ctx.fill();

    // Hanging Mass
    const hangX = pulleyX + pulleyRadius;
    const hangStartY = pulleyY + pulleyRadius + 14 * ratio;
    const massW = 38 * ratio;
    const massH = 44 * ratio;

    // String
    ctx.strokeStyle = "#1b3846";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(hookX, hookY);
    ctx.lineTo(pulleyX, pulleyY - pulleyRadius);
    ctx.arc(pulleyX, pulleyY, pulleyRadius, -Math.PI / 2, 0, false);
    ctx.lineTo(hangX, hangStartY);
    ctx.stroke();

    // Slotted Mass Hanger (Amber accent)
    const massGrad = ctx.createLinearGradient(hangX - massW / 2, hangStartY, hangX - massW / 2, hangStartY + massH);
    massGrad.addColorStop(0, "#d67b19");
    massGrad.addColorStop(0.4, "#e5933a");
    massGrad.addColorStop(1, "#b5620b");
    ctx.fillStyle = massGrad;
    ctx.strokeStyle = "#7a3f05";
    ctx.lineWidth = 1.5 * ratio;
    ctx.beginPath();
    ctx.roundRect(hangX - massW / 2, hangStartY + 8 * ratio, massW, massH - 8 * ratio, 4 * ratio);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${10 * ratio}px 'IBM Plex Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("mₕ", hangX, hangStartY + 24 * ratio);
    ctx.textAlign = "left";

    // Cushion
    ctx.fillStyle = "#edf5f8";
    ctx.strokeStyle = "#a9c5d1";
    ctx.lineWidth = 1.2 * ratio;
    ctx.beginPath();
    ctx.roundRect(hangX - 25 * ratio, floorY - 10 * ratio, 50 * ratio, 10 * ratio, 3 * ratio);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 ${13 * ratio}px 'Inter', sans-serif`;
    ctx.fillStyle = "#0a5d74";
    ctx.fillText("Run a trial to simulate the Half Atwood apparatus.", 24 * ratio, 34 * ratio);

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

    // Pure white canvas background with faint engineering grid
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(15, 126, 155, 0.04)";
    ctx.lineWidth = 1;
    for (let gx = 20 * ratio; gx < width; gx += 25 * ratio) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 20 * ratio; gy < height; gy += 25 * ratio) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    const trackLeft = 55 * ratio;
    const trackRight = width - 170 * ratio;
    const trackSurfaceY = 96 * ratio;
    const trackH = 12 * ratio;
    const tableTopY = trackSurfaceY - trackH;
    const floorY = height - 20 * ratio;
    const tableThickness = 16 * ratio;

    // Floor Line
    ctx.strokeStyle = "#c8dbe3";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(width, floorY);
    ctx.stroke();

    // Table Support Legs
    const legLeftX = trackLeft + 25 * ratio;
    const legRightX = trackRight - 45 * ratio;
    const legW = 14 * ratio;
    ctx.fillStyle = "#e2edf2";
    ctx.strokeStyle = "#b0c9d4";
    ctx.lineWidth = 1.5 * ratio;
    ctx.fillRect(legLeftX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));
    ctx.strokeRect(legLeftX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));
    ctx.fillRect(legRightX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));
    ctx.strokeRect(legRightX, trackSurfaceY + tableThickness, legW, floorY - (trackSurfaceY + tableThickness));

    // Tabletop slab
    const tableGrad = ctx.createLinearGradient(0, trackSurfaceY, 0, trackSurfaceY + tableThickness);
    tableGrad.addColorStop(0, "#f4f9fb");
    tableGrad.addColorStop(1, "#dceaf0");
    ctx.fillStyle = tableGrad;
    ctx.beginPath();
    ctx.roundRect(trackLeft - 20 * ratio, trackSurfaceY, trackRight - trackLeft + 30 * ratio, tableThickness, [0, 4 * ratio, 4 * ratio, 0]);
    ctx.fill();
    ctx.strokeStyle = "#9bbecb";
    ctx.lineWidth = 1.8 * ratio;
    ctx.stroke();

    // Dynamics Track
    const trackGrad = ctx.createLinearGradient(0, tableTopY, 0, trackSurfaceY);
    trackGrad.addColorStop(0, "#e9f2f6");
    trackGrad.addColorStop(0.5, "#d5e4ec");
    trackGrad.addColorStop(1, "#b5ccd7");
    ctx.fillStyle = trackGrad;
    ctx.fillRect(trackLeft, tableTopY, trackRight - trackLeft, trackH);
    ctx.strokeStyle = "#658595";
    ctx.lineWidth = 1.6 * ratio;
    ctx.strokeRect(trackLeft, tableTopY, trackRight - trackLeft, trackH);

    // End-stop bumpers
    ctx.fillStyle = "#2d434e";
    ctx.fillRect(trackLeft, tableTopY - 12 * ratio, 8 * ratio, trackH + 12 * ratio);
    ctx.fillRect(trackRight - 8 * ratio, tableTopY - 12 * ratio, 8 * ratio, trackH + 12 * ratio);
    ctx.fillStyle = "#d67b19";
    ctx.fillRect(trackLeft + 2 * ratio, tableTopY - 8 * ratio, 4 * ratio, 6 * ratio);
    ctx.fillRect(trackRight - 6 * ratio, tableTopY - 8 * ratio, 4 * ratio, 6 * ratio);

    // Track Metric Ruler Ticks
    ctx.fillStyle = "#2d4e5c";
    ctx.font = `600 ${9 * ratio}px 'IBM Plex Sans', sans-serif`;
    const trackSpan = trackRight - trackLeft - 30 * ratio;
    for (let i = 0; i <= 3; i += 1) {
      const mx = trackLeft + 15 * ratio + (i / 3) * trackSpan;
      ctx.strokeStyle = "#416575";
      ctx.lineWidth = 1.2 * ratio;
      ctx.beginPath();
      ctx.moveTo(mx, tableTopY);
      ctx.lineTo(mx, tableTopY + 5 * ratio);
      ctx.stroke();
      ctx.fillText(`${(i * 0.5).toFixed(1)}m`, mx - 8 * ratio, tableTopY + 18 * ratio);
    }

    // Motion kinematics
    const cartBaseX = trackLeft + 18 * ratio;
    const cartW = 74 * ratio;
    const cartH = 38 * ratio;
    const wheelR = 7.5 * ratio;
    const cartBodyH = cartH - wheelR;
    const cartBodyY = trackSurfaceY - cartH;
    const maxTravelPx = trackRight - cartBaseX - cartW - 14 * ratio;

    const displacement = cartDisplacementM(this.trial, this.currentTimeS);
    const maxExpectedDistance = 1.2;
    const normalizedMove = clamp(displacement / maxExpectedDistance, 0, 1);
    const cartX = cartBaseX + normalizedMove * maxTravelPx;

    // Pulley
    const pulleyRadius = 15 * ratio;
    const pulleyX = trackRight + pulleyRadius + 2 * ratio;
    const pulleyY = trackSurfaceY - 4 * ratio;

    // Bracket
    ctx.fillStyle = "#435d6a";
    ctx.fillRect(trackRight, trackSurfaceY - 4 * ratio, 8 * ratio, tableThickness + 8 * ratio);
    ctx.strokeStyle = "#253b45";
    ctx.lineWidth = 1.2 * ratio;
    ctx.strokeRect(trackRight, trackSurfaceY - 4 * ratio, 8 * ratio, tableThickness + 8 * ratio);

    // Pulley Arm
    ctx.strokeStyle = "#5b7785";
    ctx.lineWidth = 3 * ratio;
    ctx.beginPath();
    ctx.moveTo(trackRight + 8 * ratio, trackSurfaceY);
    ctx.lineTo(pulleyX, pulleyY);
    ctx.stroke();

    // Pulley Spoked Wheel (Rotating)
    ctx.save();
    ctx.translate(pulleyX, pulleyY);
    const pulleyRotation = (normalizedMove * maxTravelPx) / pulleyRadius;
    ctx.rotate(pulleyRotation);

    ctx.fillStyle = "#edf3f6";
    ctx.beginPath();
    ctx.arc(0, 0, pulleyRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f7e9b";
    ctx.lineWidth = 2 * ratio;
    ctx.stroke();

    for (let i = 0; i < 6; i += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.strokeStyle = "#658290";
      ctx.lineWidth = 1.2 * ratio;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(pulleyRadius - 2 * ratio, 0);
      ctx.stroke();
    }
    ctx.fillStyle = "#123140";
    ctx.beginPath();
    ctx.arc(0, 0, 3.5 * ratio, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tie hook
    const hookX = cartX + cartW;
    const hookY = trackSurfaceY - 18 * ratio;
    ctx.fillStyle = "#2d4e5c";
    ctx.beginPath();
    ctx.arc(hookX, hookY, 3 * ratio, 0, Math.PI * 2);
    ctx.fill();

    // Hanging Mass
    const hangX = pulleyX + pulleyRadius;
    const hangStartY = pulleyY + pulleyRadius + 14 * ratio;
    const maxDropPx = floorY - 14 * ratio - 44 * ratio - hangStartY;
    const hangY = hangStartY + normalizedMove * maxDropPx;
    const massW = 38 * ratio;
    const massH = 44 * ratio;

    // Braided String
    ctx.strokeStyle = "#1b3846";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(hookX, hookY);
    ctx.lineTo(pulleyX, pulleyY - pulleyRadius);
    ctx.arc(pulleyX, pulleyY, pulleyRadius, -Math.PI / 2, 0, false);
    ctx.lineTo(hangX, hangY);
    ctx.stroke();

    // Slotted Mass Hanger
    const massGrad = ctx.createLinearGradient(hangX - massW / 2, hangY, hangX - massW / 2, hangY + massH);
    massGrad.addColorStop(0, "#d67b19");
    massGrad.addColorStop(0.4, "#e5933a");
    massGrad.addColorStop(1, "#b5620b");
    ctx.fillStyle = massGrad;
    ctx.strokeStyle = "#7a3f05";
    ctx.lineWidth = 1.5 * ratio;
    ctx.beginPath();
    ctx.roundRect(hangX - massW / 2, hangY + 8 * ratio, massW, massH - 8 * ratio, 4 * ratio);
    ctx.fill();
    ctx.stroke();

    // Weight lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1 * ratio;
    for (let sy = hangY + 16 * ratio; sy < hangY + massH - 4 * ratio; sy += 7 * ratio) {
      ctx.beginPath();
      ctx.moveTo(hangX - massW / 2 + 3 * ratio, sy);
      ctx.lineTo(hangX + massW / 2 - 3 * ratio, sy);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${10 * ratio}px 'IBM Plex Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("mₕ", hangX, hangY + 22 * ratio);
    ctx.font = `600 ${9 * ratio}px 'IBM Plex Sans', sans-serif`;
    const hangingKg = this.trial.physics.config.hangingMassKg ?? 0.2;
    ctx.fillText(`${hangingKg.toFixed(1)}kg`, hangX, hangY + 33 * ratio);
    ctx.textAlign = "left";

    // Landing cushion
    ctx.fillStyle = "#edf5f8";
    ctx.strokeStyle = "#a9c5d1";
    ctx.lineWidth = 1.2 * ratio;
    ctx.beginPath();
    ctx.roundRect(hangX - 25 * ratio, floorY - 10 * ratio, 50 * ratio, 10 * ratio, 3 * ratio);
    ctx.fill();
    ctx.stroke();

    // Wheels
    for (const wx of [cartX + 14 * ratio, cartX + cartW - 14 * ratio]) {
      ctx.fillStyle = "#253b47";
      ctx.beginPath();
      ctx.arc(wx, trackSurfaceY - wheelR, wheelR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f7e9b";
      ctx.lineWidth = 1.5 * ratio;
      ctx.stroke();
      ctx.fillStyle = "#dce7eb";
      ctx.beginPath();
      ctx.arc(wx, trackSurfaceY - wheelR, 2.5 * ratio, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cart Body (Signature Teal)
    const cartGrad = ctx.createLinearGradient(cartX, cartBodyY, cartX, cartBodyY + cartBodyH);
    cartGrad.addColorStop(0, "#1495b5");
    cartGrad.addColorStop(0.4, "#0f7e9b");
    cartGrad.addColorStop(1, "#095a6f");
    ctx.fillStyle = cartGrad;
    ctx.strokeStyle = "#084959";
    ctx.lineWidth = 1.8 * ratio;
    ctx.beginPath();
    ctx.roundRect(cartX, cartBodyY, cartW, cartBodyH, 4 * ratio);
    ctx.fill();
    ctx.stroke();

    // Optional Friction Pad underneath cart
    if (this.trial.physics.config.scenario === "cart_plus_pad") {
      ctx.fillStyle = "#a86c2e";
      ctx.strokeStyle = "#6d4111";
      ctx.lineWidth = 1.2 * ratio;
      const padW = 44 * ratio;
      const padH = 5 * ratio;
      const padX = cartX + (cartW - padW) / 2;
      const padY = trackSurfaceY - padH;
      ctx.fillRect(padX, padY, padW, padH);
      ctx.strokeRect(padX, padY, padW, padH);

      ctx.fillStyle = "#e59f42";
      ctx.fillRect(padX + 2 * ratio, padY + 1 * ratio, padW - 4 * ratio, padH - 2 * ratio);
    }

    // Mass tray & Force Sensor Box
    ctx.fillStyle = "rgba(18, 49, 64, 0.25)";
    ctx.beginPath();
    ctx.roundRect(cartX + 6 * ratio, cartBodyY + 3 * ratio, cartW - 12 * ratio, 12 * ratio, 2 * ratio);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${10 * ratio}px 'IBM Plex Sans', sans-serif`;
    ctx.fillText("Force Sensor", cartX + 8 * ratio, cartBodyY + cartBodyH - 6 * ratio);

    // Live Kinematic Vectors
    const liveForce = interpolate(this.trial.signals.timesS, this.trial.signals.forceN, this.currentTimeS);
    const liveVelocity = interpolate(this.trial.signals.timesS, this.trial.signals.velocityMps, this.currentTimeS);
    const cartCenter = cartX + cartW / 2;

    if (Math.abs(liveVelocity) > 0.05) {
      const vLen = clamp(liveVelocity * 28 * ratio, -70 * ratio, 70 * ratio);
      drawArrow(ctx, cartCenter, cartBodyY - 14 * ratio, cartCenter + vLen, cartBodyY - 14 * ratio, "#0284c7", 2.5 * ratio);
      ctx.fillStyle = "#0284c7";
      ctx.font = `700 ${10 * ratio}px 'IBM Plex Sans', sans-serif`;
      ctx.fillText(`v = ${liveVelocity.toFixed(2)} m/s`, cartCenter + vLen + 4 * ratio, cartBodyY - 10 * ratio);
    }

    if (liveForce > 0.05) {
      const tLen = clamp(liveForce * 18 * ratio, 15 * ratio, 60 * ratio);
      drawArrow(ctx, hookX, hookY, hookX + tLen, hookY, "#0f7e9b", 2.2 * ratio);
    }

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
