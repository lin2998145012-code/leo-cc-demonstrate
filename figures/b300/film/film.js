// The film's timeline. render(t) draws the whole frame for time t (seconds); the figure runs
// on the same virtual clock, so its springs, sweeps and flashes stay in step with the cuts.
const TEXT = __TEXT__;
const LINES = __LINES__;
const DURATION = 45;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const span = (t, a, b) => clamp((t - a) / (b - a));
const window_ = (t, a, b, c, d) => Math.min(ease(span(t, a, b)), 1 - ease(span(t, c, d)));
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const set = (el, key, value) => {
  if (el.__last?.[key] === value) return;
  (el.__last ??= {})[key] = value;
  if (key === "html") el.innerHTML = value;
  else if (key === "text") el.textContent = value;
  else el.style.setProperty(key, value);
};

// ---------------------------------------------------------------- the figure
const stage = $(".b3-stage");
const readout = $("[data-readout]");
const figModel = $$("[data-model]");
const figPrecision = $$("[data-precision]");
const figOpen = $("[data-open]");
const figApart = $("[data-apart]");
const ORDER = ["stand", "board", "substrate", "interposer", "dies", "hbm", "fan", "lid"];
const nodes = $$(".b3-items .it").sort((a, b) => ORDER.indexOf(a.dataset.piece) - ORDER.indexOf(b.dataset.piece) || Number(a.dataset.i) - Number(b.dataset.i));
const halo = $(".b3-svg > .iso-halo");
const counts = ORDER.map((id) => nodes.filter((node) => node.dataset.piece === id).length);
const TOTAL = nodes.length;

const key = (k) => stage.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const hover = (x, y) => stage.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, pointerType: "mouse", bubbles: true }));
hover(1, 1);
key("ArrowDown");
stage.style.setProperty("--b3-w", "0");

// ---------------------------------------------------------------- the frame
const askText = $("#askText");
const bigN = $("#bigN");
const bigU = $("#bigU");
const big = $("#big");
const bar = $("#bar");
const under = $("#under");
const status = $("#status");
const cursor = $("#cursor");
const filmChip = (kind, index) => $(`[data-${kind}="${index}"]`);

let barMode = "";
function barFor(mode) {
  if (barMode === mode) return;
  barMode = mode;
  bar.innerHTML = mode === "build" ? counts.map((c) => `<span class="seg" style="flex:${c}"><i></i></span>`).join("") : `<span class="seg" style="flex:1"><i></i></span>`;
}

// What the figure reports: the decode ceiling of the chosen model and precision.
let decode = { model: "70B", precision: "FP16", gb: 140, tok: 57, fits: true, over: 0 };
function readDecode() {
  const text = readout.textContent;
  const m = text.match(/^(\d+B) · (FP\d+) · ([\d.,]+) GB · (?:≤ ([\d,]+) tok\/s|([\d,]+) GB over 288)/);
  if (!m) return;
  const num = (s) => Number(s.replace(/,/g, ""));
  decode = { model: m[1], precision: m[2], gb: num(m[3]), tok: m[4] ? num(m[4]) : 0, fits: !!m[4], over: m[5] ? num(m[5]) : 0 };
}

// The cursor's script: where it goes, and what it presses when it gets there.
const CLICKS = [
  { at: 17.7, el: () => filmChip("fa", "open"), act: () => figOpen.click() },
  { at: 25.4, el: () => filmChip("fp", 1), act: () => figPrecision[1].click() },
  { at: 27.4, el: () => filmChip("fp", 2), act: () => figPrecision[2].click() },
  { at: 29.8, el: () => filmChip("fm", 2), act: () => figModel[2].click() },
  { at: 31.8, el: () => filmChip("fp", 1), act: () => figPrecision[1].click() },
  { at: 33.4, el: () => filmChip("fp", 2), act: () => figPrecision[2].click() },
  { at: 34.9, el: () => filmChip("fa", "apart"), act: () => figApart.click() },
];
const HOVER_FROM = 36.6;
const HOVER_TO = 39.6;
const centreOf = (el) => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
function fanCentre() {
  const boxes = $$('.it[data-piece="fan"]').map((el) => el.getBoundingClientRect());
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return [left + (right - left) * 0.55, top + (bottom - top) * 0.45];
}
let fired = 0;
let pos = [1500, 1000];
let shown = { n: 0 };
let lastT = 0;

function cursorAt(t) {
  const keys = [{ at: 16.6, p: [1320, 980] }, ...CLICKS.map((c) => ({ at: c.at, p: centreOf(c.el()) })), { at: HOVER_FROM, p: fanCentre() }, { at: HOVER_TO, p: fanCentre() }, { at: 40.4, p: [1500, 1040] }];
  if (t <= keys[0].at) return keys[0].p;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.at) {
      const travel = Math.min(0.75, b.at - a.at);
      const u = ease(span(t, b.at - travel, b.at));
      return [a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u];
    }
  }
  return keys[keys.length - 1].p;
}

function render(t) {
  const dt = Math.max(0, t - lastT);
  lastT = t;

  // Intro: a scatter of machines, then the idea.
  set($("#intro"), "opacity", String(window_(t, 0, 0.5, 3.2, 3.7)));
  $$("[data-thumb]").forEach((el, i) => {
    set(el, "opacity", String(0.8 * ease(span(t, 0.1 + i * 0.12, 0.7 + i * 0.12))));
    set(el, "translate", `0 ${(-12 * Math.sin(t * 0.6 + i)).toFixed(2)}px`);
  });
  set($("#introA"), "opacity", String(window_(t, 0.3, 0.8, 1.7, 2.1)));
  set($("#introB"), "opacity", String(window_(t, 2.0, 2.4, 3.1, 3.5)));

  // The card, with the prompt being typed.
  const cardIn = window_(t, 3.4, 3.9, 40.1, 40.7);
  set($("#card"), "opacity", String(cardIn));
  set($("#card"), "transform", `translateY(${((1 - cardIn) * 18).toFixed(1)}px)`);
  set($("#ask"), "opacity", String(1 - ease(span(t, 8.3, 8.8))));
  const typed = Math.floor(TEXT.prompt.length * span(t, 4.3, 7.4));
  const shownText = TEXT.prompt.slice(0, typed);
  const cmd = shownText.startsWith(TEXT.promptChip) ? `<span class="cmd">${TEXT.promptChip}</span>${shownText.slice(TEXT.promptChip.length)}` : `<span class="cmd">${shownText}</span>`;
  const caret = Math.floor(t * 1.8) % 2 === 0 || (t > 4.3 && t < 7.4) ? '<span class="caret"></span>' : "";
  set(askText, "html", cmd + caret);
  set($("#askSend"), "background", t > 7.8 && t < 8.1 ? "#dcdcd9" : t > 7.4 ? "#18181a" : "#f0f0ee");
  set($("#askSend"), "color", t > 7.4 && !(t > 7.8 && t < 8.1) ? "#fff" : "#8c8c90");
  set($("#view"), "opacity", String(ease(span(t, 8.5, 9.1))));

  // Build: the parts appear in the order the machine goes together.
  const built = TOTAL * ease(span(t, 9.3, 16.3));
  nodes.forEach((node, i) => set(node, "opacity", String(clamp((built - i) / 4))));
  set(halo, "opacity", String(clamp(built / 12)));
  const last = nodes[Math.max(0, Math.min(TOTAL - 1, Math.floor(built) - 1))];

  const pills = $$("[data-pill]");
  pills[0].classList.toggle("on", true);
  pills[1].classList.toggle("on", t > 17.9);

  // The weights load once the cold plate is off.
  stage.style.setProperty("--b3-w", String(ease(span(t, 18.6, 19.9))));

  readDecode();
  const decoding = t >= 18.9;
  const swap = 1 - Math.max(0, 1 - Math.abs(t - 18.9) / 0.18);
  set(big, "opacity", String(swap));
  if (!decoding) {
    barFor("build");
    let seen = 0;
    $$("#bar .seg i").forEach((seg, i) => {
      const done = clamp((built - seen) / counts[i]);
      seen += counts[i];
      set(seg, "transform", `scaleX(${done.toFixed(3)})`);
    });
    set(status, "html", `${TEXT.drawing} · <b>${TEXT.pieces[last.dataset.piece]}</b>`);
    set(bigN, "text", fmt(built));
    set(bigU, "text", fill(TEXT.partsOf, { n: TOTAL }));
    bigU.classList.add("sans");
    set(under, "text", fill(TEXT.lines, { n: fmt((LINES * built) / TOTAL), total: fmt(LINES) }));
    big.classList.remove("red");
  } else {
    barFor("memory");
    const target = decode.fits ? decode.tok : decode.gb;
    shown.n = shown.n === 0 || shown.unit !== decode.fits ? target : shown.n + (target - shown.n) * (1 - Math.exp(-dt / 0.16));
    if (Math.abs(target - shown.n) < 0.5) shown.n = target;
    shown.unit = decode.fits;
    bigU.classList.remove("sans");
    set(bigN, "text", fmt(shown.n));
    set(bigU, "text", decode.fits ? "tok/s" : "GB");
    big.classList.toggle("red", !decode.fits);
    const seg = $("#bar .seg");
    seg.classList.toggle("red", !decode.fits);
    set($("#bar .seg i"), "transform", `scaleX(${Math.min(1, decode.gb / 288).toFixed(3)})`);
    const picked = $('.it[data-on][data-piece="fan"]') ? "fan" : $(".it[data-on]")?.dataset.piece;
    if (picked && TEXT.partSay[picked]) {
      set(status, "html", `<b>${TEXT.pieces[picked]}</b>`);
      set(under, "text", TEXT.partSay[picked]);
    } else {
      set(status, "html", `${decode.fits ? TEXT.ceiling : TEXT.noFit} · <b>${decode.model} · ${decode.precision}</b> · ${fmt(decode.gb)} GB`);
      set(under, "text", decode.fits ? fill(TEXT.memory, { n: fmt(decode.gb) }) : fill(TEXT.over, { n: fmt(decode.over) }));
    }
  }

  // The panel's own copies of the controls mirror the figure's.
  set($("#controls"), "opacity", String(ease(span(t, 16.9, 17.5))));
  ["8B", "70B", "405B"].forEach((m, i) => filmChip("fm", i).classList.toggle("on", decode.model === m));
  ["FP16", "FP8", "FP4"].forEach((p, i) => filmChip("fp", i).classList.toggle("on", decode.precision === p));
  filmChip("fa", "open").classList.toggle("on", t > 17.7);
  filmChip("fa", "apart").classList.toggle("on", t > 34.9);

  // Clicks, then the hover over the fanned stack.
  while (fired < CLICKS.length && t >= CLICKS[fired].at) CLICKS[fired++].act();
  $$(".fc").forEach((el) => el.classList.remove("press"));
  const pressing = CLICKS.find((c) => t >= c.at - 0.08 && t < c.at + 0.1);
  if (pressing) pressing.el().classList.add("press");
  pos = cursorAt(t);
  const down = pressing ? 0.86 : 1;
  set(cursor, "opacity", String(window_(t, 16.6, 17.0, 40.0, 40.4)));
  set(cursor, "transform", `translate(${pos[0].toFixed(1)}px, ${pos[1].toFixed(1)}px) scale(${down})`);
  if (t >= HOVER_FROM - 0.3 && t <= HOVER_TO) hover(pos[0], pos[1]);

  // Step captions under the card.
  const STEPS = [[4.0, 8.4], [8.8, 17.3], [17.6, 24.4], [24.6, 34.4], [34.6, 40.0]];
  const at = STEPS.findIndex(([a, b]) => t >= a - 0.3 && t <= b + 0.3);
  if (at >= 0) {
    const [a, b] = STEPS[at];
    const [n, bold, grey] = TEXT.steps[at];
    set($("#capN"), "text", n);
    set($("#capB"), "text", bold);
    set($("#capG"), "text", grey);
    set($("#caption"), "opacity", String(window_(t, a - 0.3, a, b, b + 0.3)));
  } else set($("#caption"), "opacity", "0");

  // Outro.
  set($("#outro"), "opacity", String(ease(span(t, 40.7, 41.5))));
}

window.__film = { render, duration: DURATION };
render(0);
