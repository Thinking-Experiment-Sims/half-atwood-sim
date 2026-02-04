/**
 * @typedef {import("./state.js").TrialRecord} TrialRecord
 */

/**
 * @param {string} value
 * @returns {string}
 */
function quoteCsv(value) {
  const escaped = String(value).replaceAll('"', '""');
  return `"${escaped}"`;
}

/**
 * @param {string} filename
 * @param {Blob} blob
 */
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {TrialRecord[]} records
 */
export function exportTrialDataCsv(records) {
  const header = [
    "scenario",
    "preset",
    "trial_id",
    "hanging_mass_kg",
    "force_mean_N",
    "accel_mps2",
    "moved",
    "force_window_start_s",
    "force_window_end_s",
    "vel_window_start_s",
    "vel_window_end_s",
    "noise_enabled",
    "timestamp_iso"
  ];

  const lines = [header.join(",")];

  for (const record of records) {
    lines.push([
      quoteCsv(record.scenario),
      quoteCsv(record.preset),
      record.trial_id,
      record.hanging_mass_kg,
      record.force_mean_N,
      record.accel_mps2,
      record.moved,
      record.force_window_start_s,
      record.force_window_end_s,
      record.vel_window_start_s,
      record.vel_window_end_s,
      record.noise_enabled,
      quoteCsv(record.timestamp_iso)
    ].join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob("trial_data.csv", blob);
}

/**
 * @param {{forceCanvas: HTMLCanvasElement, velocityCanvas: HTMLCanvasElement, fitCanvas: HTMLCanvasElement}} canvases
 * @returns {Promise<void>}
 */
export async function exportGraphsSnapshot(canvases) {
  const deviceScale = window.devicePixelRatio || 1;
  const width = Math.max(canvases.forceCanvas.width, canvases.velocityCanvas.width, canvases.fitCanvas.width);
  const padding = 20 * deviceScale;
  const headingSpace = 36 * deviceScale;
  const chartGap = 14 * deviceScale;

  const height = headingSpace
    + canvases.forceCanvas.height
    + chartGap
    + canvases.velocityCanvas.height
    + chartGap
    + canvases.fitCanvas.height
    + padding;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width + padding * 2;
  outCanvas.height = height;

  const context = outCanvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outCanvas.width, outCanvas.height);

  context.fillStyle = "#0a2f3e";
  context.font = `${16 * deviceScale}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
  context.fillText("Newton's 2nd Law Simulation - Graph Snapshot", padding, 24 * deviceScale);

  let y = headingSpace;
  context.drawImage(canvases.forceCanvas, padding, y);
  y += canvases.forceCanvas.height + chartGap;

  context.drawImage(canvases.velocityCanvas, padding, y);
  y += canvases.velocityCanvas.height + chartGap;

  context.drawImage(canvases.fitCanvas, padding, y);

  await new Promise((resolve) => {
    outCanvas.toBlob((blob) => {
      if (blob) {
        downloadBlob("graphs_snapshot.png", blob);
      }
      resolve();
    }, "image/png");
  });
}
