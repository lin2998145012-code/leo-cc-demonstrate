// The truth behind the figure. Every number the page shows comes from here.
//
// B300 memory: 8 HBM3e stacks, each a base logic die under 12 core dies of 24 Gb (3 GB),
// so 36 GB a stack and 288 GB in all, read at 8 TB/s in total (1 TB/s a stack).
// Decode at batch 1 reads every weight once per token, so the ceiling is
// bandwidth / weight bytes. KV cache, activations and kernel efficiency are left out,
// so these are upper bounds.

export const HBM = { stacks: 8, layers: 12, gbPerLayer: 3, tbps: 8 };
export const CAPACITY_GB = HBM.stacks * HBM.layers * HBM.gbPerLayer;
export const STACK_GB = HBM.layers * HBM.gbPerLayer;
export const STACK_TBPS = HBM.tbps / HBM.stacks;

export const MODELS = [
  { id: "8b", label: "8B", params: 8e9 },
  { id: "70b", label: "70B", params: 70e9 },
  { id: "405b", label: "405B", params: 405e9 },
];

// NVFP4 stores 4-bit values with one 8-bit scale per block of 16, so 4.5 bits a weight.
export const PRECISIONS = [
  { id: "fp16", label: "FP16", bits: 16 },
  { id: "fp8", label: "FP8", bits: 8 },
  { id: "fp4", label: "FP4", bits: 4.5 },
];

// The figure scans a stack's layers at this many layers a second. Real HBM reads one
// 3 GB layer of a stack in 3 ms (333 layers a second), so the scan runs SLOW times slower.
export const SCAN_LAYERS_PER_S = 2;
export const SLOW = (STACK_TBPS * 1000) / HBM.gbPerLayer / SCAN_LAYERS_PER_S;

export function decode(model, precision) {
  const gb = (model.params * precision.bits) / 8 / 1e9;
  const fits = gb <= CAPACITY_GB;
  const perStack = gb / HBM.stacks;
  const layers = Math.min(HBM.layers, perStack / HBM.gbPerLayer);
  const tokPerS = fits ? (HBM.tbps * 1000) / gb : 0;
  return { gb, fits, perStack, layers, tokPerS, msPerToken: fits ? 1000 / tokPerS : Infinity, over: Math.max(0, gb - CAPACITY_GB) };
}

const round = (value) => (value >= 100 ? Math.round(value).toLocaleString("en-US") : value >= 10 ? value.toFixed(0) : value.toFixed(1));

export function readoutOf(model, precision) {
  const d = decode(model, precision);
  const head = `${model.label} · ${precision.label} · ${round(d.gb)} GB`;
  return d.fits ? `${head} · ≤ ${round(d.tokPerS)} tok/s` : `${head} · ${round(d.over)} GB over 288`;
}

export function table() {
  return MODELS.flatMap((model) => PRECISIONS.map((precision) => ({ model: model.id, precision: precision.id, readout: readoutOf(model, precision), ...decode(model, precision) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`capacity ${CAPACITY_GB} GB · ${STACK_GB} GB a stack · ${STACK_TBPS} TB/s a stack · scan ${SLOW.toFixed(1)}× slower`);
  for (const row of table()) console.log(row.readout.padEnd(44), `layers ${row.layers.toFixed(2)}`);
}
