/**
 * @typedef {Object} FitResult
 * @property {number} slope
 * @property {number} intercept
 * @property {number} r2
 * @property {number} count
 */

/**
 * @param {number[]} values
 * @returns {number}
 */
export function mean(values) {
  if (!values.length) {
    return Number.NaN;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * @param {number[]} times
 * @param {number[]} values
 * @param {number} startS
 * @param {number} endS
 * @returns {{times: number[], values: number[]}}
 */
export function sliceWindow(times, values, startS, endS) {
  const start = Math.min(startS, endS);
  const end = Math.max(startS, endS);

  const selectedTimes = [];
  const selectedValues = [];

  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];

    if (time >= start && time <= end) {
      selectedTimes.push(time);
      selectedValues.push(values[index]);
    }
  }

  return {
    times: selectedTimes,
    values: selectedValues
  };
}

/**
 * @param {number[]} times
 * @param {number[]} values
 * @param {number} startS
 * @param {number} endS
 * @returns {number}
 */
export function meanInWindow(times, values, startS, endS) {
  const selected = sliceWindow(times, values, startS, endS);
  return mean(selected.values);
}

/**
 * @param {number[]} x
 * @param {number[]} y
 * @returns {FitResult|null}
 */
export function linearRegression(x, y) {
  if (x.length !== y.length || x.length < 2) {
    return null;
  }

  const xMean = mean(x);
  const yMean = mean(y);

  let ssxx = 0;
  let ssxy = 0;
  let sst = 0;

  for (let index = 0; index < x.length; index += 1) {
    const dx = x[index] - xMean;
    const dy = y[index] - yMean;

    ssxx += dx * dx;
    ssxy += dx * dy;
    sst += dy * dy;
  }

  if (ssxx === 0) {
    return null;
  }

  const slope = ssxy / ssxx;
  const intercept = yMean - slope * xMean;

  let residual = 0;

  for (let index = 0; index < x.length; index += 1) {
    const predicted = slope * x[index] + intercept;
    residual += (y[index] - predicted) ** 2;
  }

  const r2 = sst === 0 ? 1 : 1 - residual / sst;

  return {
    slope,
    intercept,
    r2,
    count: x.length
  };
}

/**
 * @param {number[]} times
 * @param {number[]} values
 * @param {number} startS
 * @param {number} endS
 * @returns {FitResult|null}
 */
export function linearRegressionInWindow(times, values, startS, endS) {
  const selected = sliceWindow(times, values, startS, endS);
  return linearRegression(selected.times, selected.values);
}
