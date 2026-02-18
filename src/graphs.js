const MARGIN = {
  left: 74,
  right: 20,
  top: 30,
  bottom: 38
};

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
 * @param {HTMLCanvasElement} canvas
 */
function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/**
 * @param {number[]} values
 * @returns {{min: number, max: number}}
 */
function getRange(values) {
  if (!values.length) {
    return { min: -1, max: 1 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }
  }

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const padding = (max - min) * 0.15;
  return {
    min: min - padding,
    max: max + padding
  };
}

/**
 * @param {{startS: number, endS: number}|null} selection
 * @returns {{startS: number, endS: number}|null}
 */
function normalizeSelection(selection) {
  if (!selection) {
    return null;
  }

  return {
    startS: Math.min(selection.startS, selection.endS),
    endS: Math.max(selection.startS, selection.endS)
  };
}

/**
 * @typedef {Object} TimeSeriesGraphOptions
 * @property {HTMLCanvasElement} canvas
 * @property {string} title
 * @property {string} yLabel
 * @property {(selection: {startS: number, endS: number}|null) => void} onSelectionChange
 */

export class TimeSeriesGraph {
  /**
   * @param {TimeSeriesGraphOptions} options
   */
  constructor(options) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.title = options.title;
    this.yLabel = options.yLabel;
    this.onSelectionChange = options.onSelectionChange;

    this.times = [];
    this.values = [];
    this.motionWindow = null;
    this.selection = null;
    this.dragMode = null;
    this.draggingPointerId = null;

    this.bounds = {
      xMin: 0,
      xMax: 4.5,
      yMin: -1,
      yMax: 1,
      plotLeft: 0,
      plotRight: 0,
      plotTop: 0,
      plotBottom: 0
    };

    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      `${this.title}. Drag to select a time window. Use Shift + Arrow keys for the start handle and Arrow keys for the end handle.`
    );

    this.canvas.addEventListener("pointerdown", this.handlePointerDown.bind(this));
    this.canvas.addEventListener("pointermove", this.handlePointerMove.bind(this));
    this.canvas.addEventListener("pointerup", this.handlePointerUp.bind(this));
    this.canvas.addEventListener("pointercancel", this.handlePointerUp.bind(this));
    this.canvas.addEventListener("keydown", this.handleKeyDown.bind(this));
    window.addEventListener("resize", () => this.render());
  }

  /**
   * @param {{timesS: number[], values: number[], motionWindow: {startS: number, endS: number}|null, selection: {startS: number, endS: number}|null}} payload
   */
  setData(payload) {
    this.times = payload.timesS;
    this.values = payload.values;
    this.motionWindow = payload.motionWindow;
    this.selection = normalizeSelection(payload.selection);
    this.render();
  }

  clearSelection() {
    this.selection = null;
    this.onSelectionChange(null);
    this.render();
  }

  /**
   * @param {"start" | "end"} boundary
   * @param {number} deltaS
   */
  nudgeSelection(boundary, deltaS) {
    if (!this.times.length) {
      return;
    }

    const xMin = this.times[0];
    const xMax = this.times[this.times.length - 1];

    if (!this.selection) {
      if (this.motionWindow) {
        const span = this.motionWindow.endS - this.motionWindow.startS;
        this.selection = {
          startS: this.motionWindow.startS + span * 0.2,
          endS: this.motionWindow.endS - span * 0.2
        };
      } else {
        const width = (xMax - xMin) * 0.2;
        this.selection = {
          startS: xMin + width,
          endS: xMin + 2 * width
        };
      }
    }

    if (boundary === "start") {
      this.selection.startS = clamp(this.selection.startS + deltaS, xMin, xMax);
    } else {
      this.selection.endS = clamp(this.selection.endS + deltaS, xMin, xMax);
    }

    this.selection = normalizeSelection(this.selection);
    this.onSelectionChange(this.selection);
    this.render();
  }

  getCanvas() {
    return this.canvas;
  }

  render() {
    resizeCanvas(this.canvas);

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#f9fcfe";
    ctx.fillRect(0, 0, width, height);

    const plotLeft = MARGIN.left * (window.devicePixelRatio || 1);
    const plotRight = width - MARGIN.right * (window.devicePixelRatio || 1);
    const plotTop = MARGIN.top * (window.devicePixelRatio || 1);
    const plotBottom = height - MARGIN.bottom * (window.devicePixelRatio || 1);

    const xMin = this.times.length ? this.times[0] : 0;
    const xMax = this.times.length ? this.times[this.times.length - 1] : 4.5;
    const yRange = getRange(this.values);

    this.bounds = {
      xMin,
      xMax,
      yMin: yRange.min,
      yMax: yRange.max,
      plotLeft,
      plotRight,
      plotTop,
      plotBottom
    };

    this.drawGrid();

    if (this.motionWindow) {
      this.drawMotionWindow();
    }

    this.drawAxes();
    this.drawSignal();

    if (this.selection) {
      this.drawSelection();
    }
  }

  drawGrid() {
    const ctx = this.ctx;
    const ratio = window.devicePixelRatio || 1;

    ctx.save();
    ctx.strokeStyle = "#d5e4ea";
    ctx.lineWidth = 1 * ratio;

    for (let index = 0; index <= 5; index += 1) {
      const x = this.bounds.plotLeft + (index / 5) * (this.bounds.plotRight - this.bounds.plotLeft);
      ctx.beginPath();
      ctx.moveTo(x, this.bounds.plotTop);
      ctx.lineTo(x, this.bounds.plotBottom);
      ctx.stroke();
    }

    for (let index = 0; index <= 4; index += 1) {
      const y = this.bounds.plotTop + (index / 4) * (this.bounds.plotBottom - this.bounds.plotTop);
      ctx.beginPath();
      ctx.moveTo(this.bounds.plotLeft, y);
      ctx.lineTo(this.bounds.plotRight, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawAxes() {
    const ctx = this.ctx;
    const ratio = window.devicePixelRatio || 1;

    ctx.save();
    ctx.strokeStyle = "#0c3644";
    ctx.lineWidth = 1.5 * ratio;
    ctx.beginPath();
    ctx.moveTo(this.bounds.plotLeft, this.bounds.plotTop);
    ctx.lineTo(this.bounds.plotLeft, this.bounds.plotBottom);
    ctx.lineTo(this.bounds.plotRight, this.bounds.plotBottom);
    ctx.stroke();

    ctx.fillStyle = "#1b4f62";
    ctx.font = `${11 * ratio}px 'Trebuchet MS', 'Segoe UI', sans-serif`;

    for (let index = 0; index <= 5; index += 1) {
      const t = this.bounds.xMin + (index / 5) * (this.bounds.xMax - this.bounds.xMin);
      const x = this.xToPx(t);
      ctx.fillText(t.toFixed(1), x - 8 * ratio, this.bounds.plotBottom + 16 * ratio);
    }

    for (let index = 0; index <= 4; index += 1) {
      const value = this.bounds.yMax - (index / 4) * (this.bounds.yMax - this.bounds.yMin);
      const y = this.yToPx(value);
      ctx.fillText(value.toFixed(2), this.bounds.plotLeft - 48 * ratio, y + 3 * ratio);
    }

    ctx.fillText("Time (s)", this.bounds.plotRight - 42 * ratio, this.bounds.plotBottom + 30 * ratio);
    ctx.save();
    ctx.translate(20 * ratio, this.bounds.plotTop + (this.bounds.plotBottom - this.bounds.plotTop) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(this.yLabel, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  drawSignal() {
    if (!this.times.length) {
      return;
    }

    const ctx = this.ctx;
    const ratio = window.devicePixelRatio || 1;

    ctx.save();
    ctx.strokeStyle = "#10748f";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();

    for (let index = 0; index < this.times.length; index += 1) {
      const x = this.xToPx(this.times[index]);
      const y = this.yToPx(this.values[index]);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  drawMotionWindow() {
    if (!this.motionWindow) {
      return;
    }

    const ctx = this.ctx;
    const ratio = window.devicePixelRatio || 1;
    const x1 = this.xToPx(this.motionWindow.startS);
    const x2 = this.xToPx(this.motionWindow.endS);

    ctx.save();
    ctx.fillStyle = "rgba(18, 148, 84, 0.10)";
    ctx.fillRect(
      Math.min(x1, x2),
      this.bounds.plotTop,
      Math.abs(x2 - x1),
      this.bounds.plotBottom - this.bounds.plotTop
    );

    ctx.fillStyle = "#1a7f4e";
    ctx.font = `${10 * ratio}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
    ctx.fillText("Likely acceleration region", Math.min(x1, x2) + 4 * ratio, this.bounds.plotTop + 12 * ratio);
    ctx.restore();
  }

  drawSelection() {
    const ctx = this.ctx;
    const ratio = window.devicePixelRatio || 1;

    const selection = normalizeSelection(this.selection);
    const x1 = this.xToPx(selection.startS);
    const x2 = this.xToPx(selection.endS);

    ctx.save();
    ctx.fillStyle = "rgba(240, 157, 0, 0.22)";
    ctx.fillRect(
      x1,
      this.bounds.plotTop,
      x2 - x1,
      this.bounds.plotBottom - this.bounds.plotTop
    );

    ctx.strokeStyle = "#c27100";
    ctx.lineWidth = 2 * ratio;
    ctx.strokeRect(
      x1,
      this.bounds.plotTop,
      x2 - x1,
      this.bounds.plotBottom - this.bounds.plotTop
    );

    this.drawHandle(x1);
    this.drawHandle(x2);

    ctx.fillStyle = "#854400";
    ctx.font = `${10 * ratio}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
    ctx.fillText(`${selection.startS.toFixed(2)}s`, x1 + 3 * ratio, this.bounds.plotBottom - 8 * ratio);
    ctx.fillText(`${selection.endS.toFixed(2)}s`, x2 - 34 * ratio, this.bounds.plotBottom - 8 * ratio);
    ctx.restore();
  }

  /**
   * @param {number} x
   */
  drawHandle(x) {
    const ctx = this.ctx;
    const ratio = window.devicePixelRatio || 1;

    ctx.save();
    ctx.strokeStyle = "#c27100";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(x, this.bounds.plotTop);
    ctx.lineTo(x, this.bounds.plotBottom);
    ctx.stroke();

    ctx.fillStyle = "#ffb451";
    ctx.fillRect(x - 3 * ratio, this.bounds.plotTop + 2 * ratio, 6 * ratio, 14 * ratio);
    ctx.restore();
  }

  /**
   * @param {number} timeS
   * @returns {number}
   */
  xToPx(timeS) {
    const span = this.bounds.xMax - this.bounds.xMin || 1;
    const ratio = (timeS - this.bounds.xMin) / span;
    return this.bounds.plotLeft + ratio * (this.bounds.plotRight - this.bounds.plotLeft);
  }

  /**
   * @param {number} value
   * @returns {number}
   */
  yToPx(value) {
    const span = this.bounds.yMax - this.bounds.yMin || 1;
    const ratio = (value - this.bounds.yMin) / span;
    return this.bounds.plotBottom - ratio * (this.bounds.plotBottom - this.bounds.plotTop);
  }

  /**
   * @param {number} px
   * @returns {number}
   */
  pxToX(px) {
    const width = this.bounds.plotRight - this.bounds.plotLeft || 1;
    const ratio = (px - this.bounds.plotLeft) / width;
    return this.bounds.xMin + ratio * (this.bounds.xMax - this.bounds.xMin);
  }

  /**
   * @param {PointerEvent} event
   */
  handlePointerDown(event) {
    if (!this.times.length) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const xPx = (event.clientX - rect.left) * ratio;
    const timeS = clamp(this.pxToX(xPx), this.bounds.xMin, this.bounds.xMax);

    const handle = this.detectHandle(xPx);

    if (handle) {
      this.dragMode = handle;
    } else {
      this.dragMode = "new";
      this.selection = {
        startS: timeS,
        endS: timeS
      };
      this.onSelectionChange(this.selection);
    }

    this.draggingPointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.render();
  }

  /**
   * @param {PointerEvent} event
   */
  handlePointerMove(event) {
    if (this.draggingPointerId !== event.pointerId || !this.times.length) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const xPx = (event.clientX - rect.left) * ratio;
    const timeS = clamp(this.pxToX(xPx), this.bounds.xMin, this.bounds.xMax);

    if (!this.selection) {
      this.selection = {
        startS: timeS,
        endS: timeS
      };
    }

    if (this.dragMode === "start") {
      this.selection.startS = timeS;
    } else if (this.dragMode === "end") {
      this.selection.endS = timeS;
    } else {
      this.selection.endS = timeS;
    }

    this.selection = normalizeSelection(this.selection);
    this.onSelectionChange(this.selection);
    this.render();
  }

  /**
   * @param {PointerEvent} event
   */
  handlePointerUp(event) {
    if (this.draggingPointerId !== event.pointerId) {
      return;
    }

    this.draggingPointerId = null;
    this.dragMode = null;
    this.canvas.releasePointerCapture(event.pointerId);
  }

  /**
   * @param {number} pointerX
   * @returns {"start"|"end"|null}
   */
  detectHandle(pointerX) {
    if (!this.selection) {
      return null;
    }

    const ratio = window.devicePixelRatio || 1;
    const startPx = this.xToPx(this.selection.startS);
    const endPx = this.xToPx(this.selection.endS);
    const threshold = 9 * ratio;

    const distanceStart = Math.abs(pointerX - startPx);
    const distanceEnd = Math.abs(pointerX - endPx);

    if (distanceStart < threshold && distanceStart <= distanceEnd) {
      return "start";
    }

    if (distanceEnd < threshold) {
      return "end";
    }

    return null;
  }

  /**
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const step = event.altKey ? 0.01 : 0.02;
    const boundary = event.shiftKey ? "start" : "end";

    this.nudgeSelection(boundary, direction * step);
  }
}

/**
 * @typedef {{x: number, y: number}} ScatterPoint
 */

export class ScatterFitGraph {
  /**
   * @param {{canvas: HTMLCanvasElement, title: string}} options
   */
  constructor(options) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.title = options.title;
    this.points = [];
    this.fit = null;

    window.addEventListener("resize", () => this.render());
  }

  /**
   * @param {{points: ScatterPoint[], fit: import("./regression.js").FitResult|null}} data
   */
  setData(data) {
    this.points = data.points;
    this.fit = data.fit;
    this.render();
  }

  getCanvas() {
    return this.canvas;
  }

  render() {
    resizeCanvas(this.canvas);

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ratio = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f9fcfe";
    ctx.fillRect(0, 0, width, height);

    const plotLeft = MARGIN.left * ratio;
    const plotRight = width - MARGIN.right * ratio;
    const plotTop = MARGIN.top * ratio;
    const plotBottom = height - MARGIN.bottom * ratio;

    let xRange = { min: 0, max: 10 };
    let yRange = { min: 0, max: 20 };

    if (this.points.length) {
      xRange = getRange(this.points.map((point) => point.x));
      yRange = getRange(this.points.map((point) => point.y));
    }

    const xToPx = (x) => {
      const span = xRange.max - xRange.min || 1;
      return plotLeft + ((x - xRange.min) / span) * (plotRight - plotLeft);
    };

    const yToPx = (y) => {
      const span = yRange.max - yRange.min || 1;
      return plotBottom - ((y - yRange.min) / span) * (plotBottom - plotTop);
    };

    ctx.strokeStyle = "#d5e4ea";
    ctx.lineWidth = 1 * ratio;
    for (let index = 0; index <= 5; index += 1) {
      const x = plotLeft + (index / 5) * (plotRight - plotLeft);
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
    }

    for (let index = 0; index <= 4; index += 1) {
      const y = plotTop + (index / 4) * (plotBottom - plotTop);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#0c3644";
    ctx.lineWidth = 1.5 * ratio;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    ctx.fillStyle = "#1b4f62";
    ctx.font = `${11 * ratio}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
    ctx.fillText("Acceleration (m/s^2)", plotRight - 124 * ratio, plotBottom + 30 * ratio);
    ctx.fillText("Force of Tension, Fₜ (N)", plotLeft + 4 * ratio, plotTop - 10 * ratio);

    if (!this.points.length) {
      ctx.fillStyle = "#536f7a";
      ctx.font = `${12 * ratio}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
      ctx.fillText("Add trials to populate this graph.", plotLeft + 10 * ratio, plotTop + 20 * ratio);
      return;
    }

    ctx.fillStyle = "#0e8ba8";
    for (const point of this.points) {
      ctx.beginPath();
      ctx.arc(xToPx(point.x), yToPx(point.y), 4 * ratio, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!this.fit) {
      return;
    }

    const x1 = xRange.min;
    const x2 = xRange.max;
    const y1 = this.fit.slope * x1 + this.fit.intercept;
    const y2 = this.fit.slope * x2 + this.fit.intercept;

    ctx.strokeStyle = "#cd5b00";
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(xToPx(x1), yToPx(y1));
    ctx.lineTo(xToPx(x2), yToPx(y2));
    ctx.stroke();
  }
}
