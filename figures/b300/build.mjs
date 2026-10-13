import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import * as A from "../../.claude/skills/anatomy/kit/audit.mjs";
import { glCamera } from "../../.claude/skills/anatomy/kit/gl.mjs";
import { kitScript, glScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { HBM, CAPACITY_GB, STACK_GB, STACK_TBPS, MODELS, PRECISIONS, SCAN_LAYERS_PER_S, SLOW, decode, readoutOf } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 940;
const H = 860;
const AZIMUTH = 38;
const ELEVATION = 32;

// World units are about 1 mm across the floor. Heights inside the package (substrate up)
// are drawn about 10× taller than real so the 12 core dies of each stack can be seen.
const PLATE = { x: -104, y: -88, w: 208, d: 176, r: 8 };
const PLATE_H = 12;
const FOOT_H = 6;
const NEST = { x: -84, y: -68, w: 168, d: 136, r: 4 };
const NEST_H = 4;
const BOARD = { x: -78, y: -62, w: 156, d: 124, r: 3 };
const BOARD_Z = 12;
const BOARD_TOP = BOARD_Z + 2.4;
const SUB = { x: -44, y: -40, w: 88, d: 80, r: 2 };
const SUB_TOP = BOARD_TOP + 3;
const INT = { x: -30, y: -29, w: 60, d: 58, r: 0.8 };
const INT_TOP = SUB_TOP + 1.4;
const BASE_DIE = 1.2;
const CORE = 0.55;
const PKG_TOP = INT_TOP + BASE_DIE + HBM.layers * CORE;
const DIES = [
  { x: -27.5, y: -16.5, w: 26.5, d: 33, r: 0.5 },
  { x: 1, y: -16.5, w: 26.5, d: 33, r: 0.5 },
];
const STACK_XS = [-26.5, -13, 2, 15.5];
const STACK_YS = [-28.5, 17.5];
const STACK_W = 11;
const STACKS = STACK_YS.flatMap((y) => STACK_XS.map((x) => ({ x, y, w: STACK_W, d: STACK_W, r: 0.4 })));
const FAN = STACKS.findIndex((s) => s.x === 15.5 && s.y === 17.5);

const CP = { x: -42, y: -52, w: 84, d: 104, r: 4 };
const CP_H = 8;
const CP_TOP = PKG_TOP + CP_H;
const MANIFOLD = { x: -32, y: -30, w: 64, d: 62, r: 3 };
const MANIFOLD_TOP = CP_TOP + 4;
const SCREWS = k.corners(CP, 6);

const PIECES = {
  lid: { name: "Cold plate", say: "cold plate · liquid cooled · pressed onto both dies and all 8 stacks", move: [-46, -40, 96] },
  fan: { name: "One HBM3e stack, fanned", say: `HBM3e stack · base die + 12 × 24 Gb dies · ${STACK_GB} GB · ${STACK_TBPS} TB/s`, move: [64, 0, 40] },
  hbm: { name: "HBM3e stacks", say: `8 HBM3e stacks · ${CAPACITY_GB} GB · ${HBM.tbps} TB/s together`, move: [0, 0, 56] },
  dies: { name: "Two GPU dies", say: "2 near-reticle dies · joined by a die-to-die bridge · one GPU", move: [0, 0, 56] },
  interposer: { name: "CoWoS-L interposer", say: "CoWoS-L interposer · silicon bridges carry die-to-HBM wiring", move: [0, 0, 30] },
  substrate: { name: "Package substrate", say: "package substrate · stiffener and decoupling capacitors", move: [0, 0, 10] },
  board: { name: "Module board", say: "module board · power stages and inductors feed the package", move: [0, 0, 0] },
  stand: { name: "Bench plate", say: "bench plate", move: [0, 0, 0] },
};
const STAGGER = ["lid", "fan", "hbm", "dies", "interposer", "substrate", "board", "stand"];
const SPRING = { stagger: 0.06, stiffness: 64, damping: 14.2, substeps: 4 };

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...k.boxCorners({ ...CP, x: CP.x - 46, y: CP.y - 40 }, PKG_TOP + 96, MANIFOLD_TOP + 96 + 14),
    [90.5, 28.5, PKG_TOP + 40 + 12 * 4.6 + 2],
  ],
  W,
  H,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const { items, nameFor } = R;
const record = R.solid;

function put(piece, ref, svg, { bias = 0, move, ride, shapes = [], name, attrs } = {}) {
  return R.put({ piece, ride: ride ?? piece, at: ref, bias, svg, move: move ?? PIECES[piece].move, shapes, name: name ?? nameFor(`${piece}.item`), attrs });
}

function box(piece, plan, z, h, style = {}, { extra = "", inner = "", bias = 0, move, ride, bevel = 0.5, steps = 3, name, attrs } = {}) {
  const id = nameFor(name ?? `${piece}.box`);
  const centre = [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2];
  const svg = S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "hi", ...style, inner }) + extra;
  return put(piece, centre, svg, { bias, move, ride, name: id, attrs, shapes: [record(A.slab(plan, z, h, { name: id }, steps))] });
}

function cyl(piece, cx, cy, r, z, h, style = {}, { extra = "", inner = "", bias = 0, move, steps = 28, bevel = 0, name } = {}) {
  const id = nameFor(name ?? `${piece}.cylinder`);
  const svg = S(k.cylinder(cx, cy, r, z, h, P, steps, bevel), { tone: "hi", ...style, inner }) + extra;
  return put(piece, [cx, cy, z + h / 2], svg, { bias, move, name: id, shapes: [record(A.cylinder(cx, cy, r, z, h, { name: id }))] });
}

function screw(x, y, z, r = 2) {
  return Ln(k.ring(x, y, r, z, P, 16), { tone: "lo" }) + Dots([at([x, y, z])], { size: 0.5 });
}

// ---------------------------------------------------------------- fixture
const halo = `<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`;
for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
  cyl("stand", x, y, 8, -PLATE_H - FOOT_H, 1.8, { tone: "lo" }, { name: "stand.foot-pad" });
  cyl("stand", x, y, 6, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, { tone: "mid" }, { name: "stand.foot" });
}
const STRIP = { x: PLATE.x + 14, y: PLATE.y + PLATE.d - 11, w: 116, d: 4.6, r: 0.8 };
const TICKS = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 4, 5, STRIP.y, 0.6, [2.2, 4.6], P);
const LABEL = { x: PLATE.x + PLATE.w - 62, y: PLATE.y + PLATE.d - 16, w: 48, d: 10, r: 1.5 };
// A breadboard plate: tapped holes on a 12 mm grid, wherever nothing stands on them.
const HOLES = [];
for (let x = PLATE.x + 14; x <= PLATE.x + PLATE.w - 14; x += 12)
  for (let y = PLATE.y + 14; y <= PLATE.y + PLATE.d - 14; y += 12) {
    const under = (plan, pad) => x > plan.x - pad && x < plan.x + plan.w + pad && y > plan.y - pad && y < plan.y + plan.d + pad;
    if (!under(NEST, 3) && !under(STRIP, 3) && !under(LABEL, 3)) HOLES.push([x, y]);
  }
const plateExtra = [
  Ln(HOLES.map(([x, y]) => k.ring(x, y, 1.3, 0, P, 12)).join(""), { tone: "faint" }),
  Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }),
  ...k.corners(PLATE, 9).map(([x, y]) => screw(x, y, 0, 2.2)),
].join("");
box("stand", PLATE, -PLATE_H, PLATE_H, { tone: "mid" }, { name: "stand.plate", steps: 8, bevel: 1.6, extra: plateExtra, bias: -400 });
box("stand", STRIP, 0, 0.6, { tone: "lo" }, { name: "stand.ruler", bevel: 0, extra: Ln(TICKS.minor, { tone: "lo" }) + Ln(TICKS.major, { tone: "mid" }) + Dots([at([STRIP.x + 1.8, STRIP.y + 2.3, 0.6]), at([STRIP.x + STRIP.w - 1.8, STRIP.y + 2.3, 0.6])], { size: 0.45 }) });
const labelRules = [
  [7, 38],
  [7, 27],
  [7, 33],
].map(([from, to], index) => Ln(k.lineOnTop([LABEL.x + from, LABEL.y + 3 + index * 2.6], [LABEL.x + to, LABEL.y + 3 + index * 2.6], 0.8, P), { tone: "lo", free: true }));
box("stand", LABEL, 0, 0.8, { tone: "lo" }, { name: "stand.label", bevel: 0, extra: Ln(k.planOutline(k.insetPlan(LABEL, 1.4), 0.8, P), { tone: "faint" }) + labelRules.join("") + Dots([at([LABEL.x + 2.6, LABEL.y + LABEL.d / 2, 0.8]), at([LABEL.x + LABEL.w - 2.6, LABEL.y + LABEL.d / 2, 0.8])], { size: 0.45 }) });

const nestExtra = Ln(k.planOutline(k.insetPlan(NEST, 3), NEST_H, P), { tone: "faint" }) + k.corners(NEST, 6).map(([x, y]) => Dots([at([x, y, NEST_H])], { size: 0.45 })).join("");
box("stand", NEST, 0, NEST_H, { tone: "mid" }, { name: "stand.nest", steps: 4, bevel: 0.8, extra: nestExtra });
for (const [x, y] of k.corners(BOARD, 6)) cyl("stand", x, y, 3.4, NEST_H, BOARD_Z - NEST_H, { tone: "mid" }, { name: "stand.standoff", extra: Ln(k.sideArc(x, y, 3.4, NEST_H + 4, P, 16), { tone: "faint" }) });

// ---------------------------------------------------------------- board
const boardInner = Ln(k.sideSeam(BOARD, BOARD_Z + 1.2, P, 3), { tone: "faint" });
const FIDUCIALS = [[-73, -22], [73, 22], [73, -40]];
const boardExtra = k.corners(BOARD, 6).map(([x, y]) => screw(x, y, BOARD_TOP, 2.6)).join("") + Ln(FIDUCIALS.map(([x, y]) => k.ring(x, y, 1.6, BOARD_TOP, P, 16)).join(""), { tone: "lo" }) + Dots(FIDUCIALS.map(([x, y]) => at([x, y, BOARD_TOP])), { size: 0.7, tone: "mid" });
box("board", BOARD, BOARD_Z, BOARD_TOP - BOARD_Z, { tone: "mid" }, { name: "board.pcb", inner: boardInner, extra: boardExtra, bevel: 0.6 });
const VRM_YS = [-48, -33, -18, -3, 12, 27, 42];
for (const side of [-1, 1]) {
  for (const y of VRM_YS) {
    const ix = side < 0 ? -68 : 58;
    const coil = { x: ix, y: y - 1, w: 10, d: 10, r: 1.2 };
    box("board", coil, BOARD_TOP, 6, { tone: "mid" }, { name: "board.inductor", bevel: 0.5, extra: Ln(k.planOutline(k.insetPlan(coil, 2.2), BOARD_TOP + 6, P, 3), { tone: "faint" }) });
    const sx = side < 0 ? -54 : 47;
    const stage = { x: sx, y: y + 0.5, w: 7, d: 7, r: 0.5 };
    box("board", stage, BOARD_TOP, 1.4, { tone: "lo" }, { name: "board.power-stage", bevel: 0, extra: Dots([at([sx + 1.6, y + 2.1, BOARD_TOP + 1.4])], { size: 0.4, tone: "lo" }) });
  }
}
for (const side of [-1, 1]) {
  for (let x = -27; x <= 27; x += 6.75) {
    const y = side < 0 ? -50.5 : 52;
    box("board", { x: x - 1.6, y, w: 3.2, d: 5, r: 0.6 }, BOARD_TOP, 2.2, { tone: "lo" }, { name: "board.capacitor", bevel: 0 });
  }
}
for (const side of [-1, 1]) {
  for (let i = 0; i < 6; i++) {
    const x = side < 0 ? -31.6 + i * 4.2 : 8 + i * 4.2;
    box("board", { x, y: 44, w: 2.6, d: 1.6, r: 0.2 }, BOARD_TOP, 0.6, { tone: "lo", crease: "none" }, { name: "board.resistor", bevel: 0, steps: 2 });
    box("board", { x, y: -43.8, w: 2.6, d: 1.6, r: 0.2 }, BOARD_TOP, 0.6, { tone: "lo", crease: "none" }, { name: "board.resistor", bevel: 0, steps: 2 });
  }
}
const CONN = { x: -24, y: BOARD.y + 2.5, w: 48, d: 7, r: 0.8 };
box("board", CONN, BOARD_TOP, 5, { tone: "mid" }, { name: "board.connector", bevel: 0.4, extra: Ln(k.planOutline(k.insetPlan(CONN, 1.6), BOARD_TOP + 5, P, 2), { tone: "faint" }) });
const CHIP = { x: 50, y: -60, w: 11, d: 8, r: 0.6 };
box("board", CHIP, BOARD_TOP, 1.6, { tone: "lo" }, { name: "board.controller", bevel: 0, extra: Dots([at([CHIP.x + 2, CHIP.y + 2, BOARD_TOP + 1.6])], { size: 0.4, tone: "lo" }) });

// ---------------------------------------------------------------- package
const subExtra = Ln(k.planOutline(k.insetPlan(SUB, 1.4), SUB_TOP, P, 3), { tone: "faint" });
box("substrate", SUB, BOARD_TOP, SUB_TOP - BOARD_TOP, { tone: "mid" }, { name: "substrate.body", extra: subExtra, bevel: 0.4 });
const STIFF = k.insetPlan(SUB, 2);
const STIFF_W = 5;
const STIFF_H = 2;
const bars = [
  { x: STIFF.x, y: STIFF.y, w: STIFF.w, d: STIFF_W },
  { x: STIFF.x, y: STIFF.y + STIFF.d - STIFF_W, w: STIFF.w, d: STIFF_W },
  { x: STIFF.x, y: STIFF.y + STIFF_W, w: STIFF_W, d: STIFF.d - 2 * STIFF_W },
  { x: STIFF.x + STIFF.w - STIFF_W, y: STIFF.y + STIFF_W, w: STIFF_W, d: STIFF.d - 2 * STIFF_W },
];
for (const bar of bars) box("substrate", { ...bar, r: 0.4 }, SUB_TOP, STIFF_H, { tone: "mid" }, { name: "substrate.stiffener", bevel: 0.3 });
for (const side of [-1, 1]) {
  for (let y = -26; y <= 26; y += 6.5) {
    const x = side < 0 ? INT.x - 4.6 : INT.x + INT.w + 1.6;
    box("substrate", { x, y: y - 1.2, w: 3, d: 2.4, r: 0.3 }, SUB_TOP, 0.9, { tone: "lo" }, { name: "substrate.capacitor", bevel: 0 });
  }
}

const BRIDGES = [...STACKS.map((s) => ({ x: s.x + 2, y: s.y > 0 ? 14 : -19, w: 7, d: 5, r: 0.3 })), { x: -3.5, y: -12, w: 7, d: 24, r: 0.3 }];
const intExtra = [
  ...BRIDGES.map((b) => Ln(k.planOutline(b, INT_TOP, P, 2), { tone: "lo" })),
  Ln(k.planOutline(k.insetPlan(INT, 1.2), INT_TOP, P, 2), { tone: "faint" }),
].join("");
box("interposer", INT, SUB_TOP, INT_TOP - SUB_TOP, { tone: "mid" }, { name: "interposer.body", extra: intExtra, bevel: 0.3, steps: 2 });

DIES.forEach((die, index) => {
  const top = Ln(k.planOutline(k.insetPlan(die, 1.6), PKG_TOP, P, 2), { tone: "faint" });
  box("dies", die, INT_TOP, PKG_TOP - INT_TOP, { tone: "hi" }, { name: `dies.die${index}`, extra: top, bevel: 0.4, steps: 2, attrs: { "data-die": index } });
});

const layerZ = (layer) => (layer === 0 ? INT_TOP : INT_TOP + BASE_DIE + (layer - 1) * CORE);
const layerH = (layer) => (layer === 0 ? BASE_DIE : CORE);
const FAN_GAP = 4.6;
const FAN_MOVES = Array.from({ length: HBM.layers + 1 }, (_, layer) => [PIECES.fan.move[0], PIECES.fan.move[1], PIECES.fan.move[2] + layer * FAN_GAP]);
STACKS.forEach((stack, index) => {
  const fan = index === FAN;
  for (let layer = 0; layer <= HBM.layers; layer++) {
    const z = layerZ(layer);
    const h = layerH(layer);
    const top = layer === HBM.layers ? Ln(k.planOutline(k.insetPlan(stack, 1.4), z + h, P, 2), { tone: "faint" }) : "";
    box(fan ? "fan" : "hbm", stack, z, h, { tone: layer === HBM.layers ? "hi" : "mid", crease: "none" }, {
      name: `${fan ? "fan" : "hbm"}.s${index}.l${layer}`,
      bevel: 0,
      steps: 2,
      extra: top,
      move: fan ? FAN_MOVES[layer] : undefined,
      ride: fan ? "fan" : undefined,
      attrs: { "data-stack": index, "data-layer": layer },
    });
  }
});

// ---------------------------------------------------------------- cold plate
// Four spring screws hold the cold plate down onto standoffs on the board; open, it lifts away.
for (const [x, y] of SCREWS) {
  cyl("board", x, y, 3.6, BOARD_TOP, PKG_TOP - BOARD_TOP, { tone: "mid" }, { name: "board.cold-plate-standoff", inner: Ln(k.sideArc(x, y, 3.6, BOARD_TOP + 3, P, 16), { tone: "faint" }), extra: Ln(k.ring(x, y, 1.7, PKG_TOP, P, 16), { tone: "lo" }) });
}
const cpEdgeScrews = [];
for (let i = 1; i <= 5; i++) for (const x of [CP.x + 2, CP.x + CP.w - 2]) cpEdgeScrews.push(at([x, CP.y + 14 + (i * (CP.d - 28)) / 6, CP_TOP]));
for (let i = 1; i <= 4; i++) for (const y of [CP.y + 2, CP.y + CP.d - 2]) cpEdgeScrews.push(at([CP.x + 14 + (i * (CP.w - 28)) / 5, y, CP_TOP]));
box("lid", CP, PKG_TOP, CP_H, { tone: "hi" }, { name: "lid.cold-plate", steps: 4, bevel: 1, inner: Ln(k.sideSeam(CP, PKG_TOP + 2.6, P, 4), { tone: "faint" }), extra: Ln(k.planOutline(k.insetPlan(CP, 3.4), CP_TOP, P, 4), { tone: "faint" }) + Dots(cpEdgeScrews, { size: 0.42 }) });
const manifoldTop = Ln(k.planOutline(k.insetPlan(MANIFOLD, 2.2), MANIFOLD_TOP, P, 3), { tone: "faint" });
const manifoldBolts = k.corners(MANIFOLD, 3.2).map(([x, y]) => at([x, y, MANIFOLD_TOP]));
box("lid", MANIFOLD, CP_TOP, MANIFOLD_TOP - CP_TOP, { tone: "mid" }, { name: "lid.manifold", bevel: 0.6, extra: manifoldTop + Dots(manifoldBolts, { size: 0.45 }) });
for (const x of [-14, 14]) {
  const y = 20;
  cyl("lid", x, y, 3.8, MANIFOLD_TOP, 3, { tone: "mid" }, { name: "lid.fitting", steps: 24 });
  cyl("lid", x, y, 4.4, MANIFOLD_TOP + 3, 7, { tone: "hi" }, { name: "lid.coupling", steps: 28, extra: Ln(k.knurl(x, y, 4.4, MANIFOLD_TOP + 4.2, MANIFOLD_TOP + 8.8, 26, P), { tone: "lo" }), inner: Ln(k.sideArc(x, y, 4.4, MANIFOLD_TOP + 4.2, P, 20) + k.sideArc(x, y, 4.4, MANIFOLD_TOP + 8.8, P, 20), { tone: "faint" }) });
  cyl("lid", x, y, 3.4, MANIFOLD_TOP + 10, 2.4, { tone: "mid" }, { name: "lid.cap", steps: 24, extra: Ln(k.ring(x, y, 1.6, MANIFOLD_TOP + 12.4, P, 16), { tone: "lo" }) });
}
for (const [x, y] of SCREWS) {
  for (let i = 0; i < 3; i++) cyl("lid", x, y, 4.2 - (i % 2) * 0.5, CP_TOP + i * 0.8, 0.8, { tone: "mid", crease: "none" }, { name: "lid.spring-washer", steps: 22 });
  cyl("lid", x, y, 3, CP_TOP + 2.4, 2.6, { tone: "hi" }, { name: "lid.screw-head", steps: 22, extra: Ln(k.ring(x, y, 1.3, CP_TOP + 5, P, 6), { tone: "lo" }) });
}

// ---------------------------------------------------------------- page
const QUICK = process.argv.includes("--quick");
A.settle(R, P, QUICK ? { states: [...A.uniformStates(4), ...A.prefixStates(STAGGER, { shares: [0.5, 1] })] } : undefined);
items.sort((a, b) => a.key - b.key);
const attr = (attrs) => (attrs ? Object.entries(attrs).map(([key, value]) => ` ${key}="${value}"`).join("") : "");
const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}"${attr(item.attrs)}>${item.svg}</g>`;
});

const unit = (vector) => {
  const o = at([0, 0, 0]);
  const p = at(vector);
  return [p[0] - o[0], p[1] - o[1]];
};
const DATA = {
  W,
  H,
  V,
  EX: unit([1, 0, 0]),
  EY: unit([0, 1, 0]),
  EZ: unit([0, 0, 1]),
  camera: glCamera(P),
  dies: DIES,
  stacks: STACKS,
  pkgTop: PKG_TOP,
  layers: HBM.layers,
  fan: FAN,
  scan: SCAN_LAYERS_PER_S,
  slow: SLOW,
  models: MODELS,
  precisions: PRECISIONS,
  decode: Object.fromEntries(MODELS.flatMap((m) => PRECISIONS.map((p) => [`${m.id}.${p.id}`, { ...decode(m, p), readout: readoutOf(m, p) }]))),
  pieces: Object.fromEntries(Object.entries(PIECES).map(([id, piece]) => [id, { name: piece.name, say: piece.say }])),
  stagger: STAGGER,
  spring: SPRING,
};

const LABEL_TEXT =
  "A B300 GPU module on a bench plate. A liquid cold plate is held down on four standoffs by spring screws; lifted away, it shows the package: two GPU dies on a CoWoS-L interposer with four HBM3e stacks above them and four below, each stack a base die under 12 memory dies, on a substrate with a stiffener ring, on a board ringed with power stages and inductors. The lit memory layers show how much of the 288 GB a model's weights fill; a read band sweeps them at constant bandwidth and each sweep is one decoded token.";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg b3-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LABEL_TEXT}">${halo}<g class="b3-items">${groups.join("")}</g></svg>`;

const chip = (kind, entry, on) => `<button type="button" class="b3-chip" data-${kind}="${entry.id}"${on ? " data-on" : ""}>${entry.label}</button>`;
const controls = `<div class="b3-controls"><button type="button" class="b3-act" data-open><span class="b3-lamp" aria-hidden="true"></span><span data-open-label>Open</span></button><button type="button" class="b3-act" data-apart><span data-apart-label>Take apart</span></button><span class="b3-hint">Hover a part to name it</span><span class="b3-live" aria-live="polite" data-live></span></div>`;
const choose = `<div class="b3-choose"><span class="b3-group" role="group" aria-label="Model size"><span class="b3-label">Model</span>${MODELS.map((m, i) => chip("model", m, i === 1)).join("")}</span><span class="b3-group" role="group" aria-label="Weight precision"><span class="b3-label">Weights</span>${PRECISIONS.map((p, i) => chip("precision", p, i === 1)).join("")}</span></div>`;
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">B300 · module on the bench</span><span class="iso-plate-corner" data-corner="readout" data-readout>${readoutOf(MODELS[1], PRECISIONS[1])}</span></div>`;
const stage = `<div class="b3-stage" tabindex="0" role="group" aria-label="B300 module on a bench. Left and right arrows choose the model, up and down the weight precision; O lifts the cold plate, Space takes the package apart, Escape closes it.">${svg}<canvas class="b3-glow" aria-hidden="true"></canvas></div>`;
const caption = `Decoding one token at batch 1 reads every weight once, so the ceiling is HBM bandwidth over weight bytes: ${HBM.tbps} TB/s across ${HBM.stacks} stacks of ${HBM.layers} × ${HBM.gbPerLayer} GB dies, ${CAPACITY_GB} GB in all. The lit layers are the weights spread evenly over the stacks; the read band sweeps them ${Math.round(SLOW)}× slower than real, and each sweep flashes the dies once. FP4 here is NVFP4, 4.5 bits a weight with its block scales. Ceilings leave out the KV cache and kernel overheads. Package heights are drawn about 10× taller than real, and plan sizes are representative.`;
const body = `<figure class="iso-figure b3"><div class="iso-plate">${corners}${stage}${controls}</div><figcaption class="iso-legend">${choose}<span class="iso-caption">${caption}</span></figcaption></figure>`;

const CSS = readFileSync(join(HERE, "b300.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const page = k.pageHtml({ title: "B300 · decode", theme: THEME, body: `<style>${CSS}</style>${body}`, script: kitScript() + glScript() + LIVE, width: 980 });
const name = THEME === "light" ? "b300-light.html" : "b300.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);

A.auditOrExit(R, P);
