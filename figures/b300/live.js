const D = __DATA__;
const root = document.querySelector(".b3");
const stage = root.querySelector(".b3-stage");
const svg = stage.querySelector("svg");
const layerRoot = svg.querySelector(".b3-items");
const canvas = stage.querySelector(".b3-glow");
const live = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const openButton = root.querySelector("[data-open]");
const openLabel = root.querySelector("[data-open-label]");
const apartButton = root.querySelector("[data-apart]");
const apartLabel = root.querySelector("[data-apart-label]");
const modelChips = [...root.querySelectorAll("[data-model]")];
const precisionChips = [...root.querySelectorAll("[data-precision]")];
const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...layerRoot.querySelectorAll(".it")].map((el) => ({
  el,
  piece: el.dataset.piece,
  ride: el.dataset.ride || el.dataset.piece,
  key: Number(el.dataset.k),
  m: el.dataset.m.split(",").map(Number),
  shown: "",
}));
for (const node of nodes) node.lift = node.m[0] * D.V[0] + node.m[1] * D.V[1] + node.m[2] * D.V[2];
let order = nodes.map((_, index) => index);

const layers = [];
for (const node of nodes) {
  if (node.el.dataset.stack === undefined) continue;
  const layer = Number(node.el.dataset.layer);
  if (layer > 0) layers.push({ el: node.el, layer, f: -1, s: -1 });
}
const dies = nodes.filter((node) => node.el.dataset.die !== undefined).map((node) => node.el);

const IDS = Object.keys(D.pieces);
const SPRING = D.spring;
const piece = Object.fromEntries(IDS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));
const PACKAGE = ["fan", "hbm", "dies", "interposer", "substrate"];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

let clock = 0;
let open = false;
let apart = false;
let selected = null;
let modelIndex = 1;
let precisionIndex = 1;
let touring = !still.matches;
let tourClock = -1;
let idleTimer = 0;
let leaveTimer = 0;
let visible = false;
let frame = 0;
let last = 0;
let inside = false;

const fill = { x: 0, v: 0 };
let scanAt = 0;
let flashAt = -99;
let tokens = 0;
let lastFlash = -1;

const current = () => D.decode[`${D.models[modelIndex].id}.${D.precisions[precisionIndex].id}`];

function say(text) {
  if (readout.textContent !== text) readout.textContent = text;
}

function announce(text) {
  if (document.activeElement === stage || root.contains(document.activeElement)) live.textContent = text;
}

function describe() {
  const text = selected ? D.pieces[selected].say : `${current().readout}${apart ? " · apart" : open ? " · open" : " · closed"}`;
  if (stage.getAttribute("aria-description") !== text) stage.setAttribute("aria-description", text);
}

// Each assembly has a spring; a change of target is staggered, outside parts first.
function retarget(goals) {
  const rising = [];
  const falling = [];
  for (const id of D.stagger) {
    const goal = goals[id];
    if (goal === undefined) continue;
    const state = piece[id];
    const wanted = state.pending ? state.pending.value : state.target;
    if (wanted === goal) continue;
    state.pending = null;
    (goal > state.target ? rising : falling).push(id);
  }
  rising.forEach((id, index) => (piece[id].pending = { value: 1, at: clock + (still.matches ? 0 : index * SPRING.stagger) }));
  [...falling].reverse().forEach((id, index) => (piece[id].pending = { value: 0, at: clock + (still.matches ? 0 : index * SPRING.stagger) }));
  run();
}

function setOpen(on) {
  open = on;
  if (!on) apart = false;
  const goals = { lid: on ? 1 : 0 };
  if (!on) for (const id of PACKAGE) goals[id] = 0;
  retarget(goals);
  sync();
}

function setApart(on) {
  apart = on;
  if (on) open = true;
  const goals = Object.fromEntries(PACKAGE.map((id) => [id, on ? 1 : 0]));
  if (on) goals.lid = 1;
  retarget(goals);
  sync();
}

function sync() {
  openButton.dataset.state = open ? "on" : "off";
  openLabel.textContent = open ? "Close" : "Open";
  apartLabel.textContent = apart ? "Put together" : "Take apart";
  modelChips.forEach((chip, index) => (index === modelIndex ? chip.setAttribute("data-on", "") : chip.removeAttribute("data-on")));
  precisionChips.forEach((chip, index) => (index === precisionIndex ? chip.setAttribute("data-on", "") : chip.removeAttribute("data-on")));
  if (current().fits) stage.removeAttribute("data-over");
  else stage.setAttribute("data-over", "");
  describe();
}

function choose(model, precision) {
  const changed = model !== modelIndex || precision !== precisionIndex;
  modelIndex = clamp(model, 0, D.models.length - 1);
  precisionIndex = clamp(precision, 0, D.precisions.length - 1);
  if (changed) {
    scanAt = 0;
    tokens = 0;
    announce(current().readout);
  }
  sync();
  run();
}

function select(id) {
  if (id === "stand") id = null;
  if (selected === id) return;
  selected = id;
  const same = id === "fan" ? ["fan", "hbm"] : id === "hbm" ? ["hbm", "fan"] : [id];
  for (const node of nodes) {
    if (id !== null && same.includes(node.piece)) node.el.setAttribute("data-on", "");
    else node.el.removeAttribute("data-on");
  }
  if (id) stage.setAttribute("data-focus", "");
  else stage.removeAttribute("data-focus");
  describe();
}

function steerSpring(state, dt, calm) {
  if (state.pending && clock >= state.pending.at) {
    state.target = state.pending.value;
    state.pending = null;
  }
  if (calm) {
    state.x = state.target;
    state.v = 0;
    return state.pending !== null;
  }
  for (let index = 0; index < SPRING.substeps; index++) {
    const h = dt / SPRING.substeps;
    state.v += ((state.target - state.x) * SPRING.stiffness - state.v * SPRING.damping) * h;
    state.x += state.v * h;
  }
  if (Math.abs(state.target - state.x) < 2e-4 && Math.abs(state.v) < 2e-4) {
    state.x = state.target;
    state.v = 0;
    return state.pending !== null;
  }
  return true;
}

function place() {
  for (const node of nodes) {
    const share = piece[node.ride].x;
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    const text = share === 0 ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }
  const next = nodes.map((_, index) => index).sort((a, b) => nodes[a].key + nodes[a].lift * piece[nodes[a].ride].x - (nodes[b].key + nodes[b].lift * piece[nodes[b].ride].x));
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    layerRoot.appendChild(fragment);
    order = next;
  }
}

// The read band: the filled layers of every stack are read at one constant rate, and each
// full sweep of them is one token. Fuller stacks take longer, so give fewer tokens a second.
function stepMemory(dt, calm) {
  const d = current();
  const goal = d.layers;
  const moving = settle(fill, goal, dt, 0.45, calm);
  const reading = d.fits && fill.x > 1e-3 && !calm;
  if (reading) {
    scanAt += D.scan * dt;
    if (scanAt >= fill.x) {
      scanAt -= fill.x;
      if (scanAt >= fill.x) scanAt = 0;
      tokens += 1;
      flashAt = clock;
    }
  } else scanAt = 0;
  for (const entry of layers) {
    const f = clamp(fill.x - (entry.layer - 1), 0, 1);
    let s = 0;
    if (reading) {
      const lo = entry.layer - 1;
      const hi = Math.min(entry.layer, fill.x);
      const gap = scanAt < lo ? lo - scanAt : scanAt > hi ? scanAt - hi : 0;
      s = f > 0 ? clamp(1 - gap / 0.35, 0, 1) * Math.min(1, f * 4) : 0;
    }
    const fq = Math.round(f * 100) / 100;
    const sq = Math.round(s * 100) / 100;
    if (fq !== entry.f) {
      entry.f = fq;
      entry.el.style.setProperty("--f", String(fq));
    }
    if (sq !== entry.s) {
      entry.s = sq;
      entry.el.style.setProperty("--s", String(sq));
    }
  }
  const flash = calm ? 0 : burst(clock - flashAt, 0.06, 0.32);
  const fq = Math.round(flash * 100) / 100;
  if (fq !== lastFlash) {
    lastFlash = fq;
    for (const die of dies) die.style.setProperty("--flash", String(fq));
  }
  return { moving: moving || reading || flash > 1e-3, flash };
}

// ---------------------------------------------------------------- the glow on the dies
const FRAGMENT = `
uniform float uFlash;
uniform float uShow;
uniform float uLight;
uniform vec4 uDie0;
uniform vec4 uDie1;
uniform float uTop;
float sdBox(vec2 p, vec4 r){vec2 c=r.xy+r.zw*.5;vec2 q=abs(p-c)-r.zw*.5;return length(max(q,0.))+min(max(q.x,q.y),0.);}
vec4 inkFor(vec3 seen,float cover){vec3 absorbed=1.-seen;float a=max(max(absorbed.r,max(absorbed.g,absorbed.b)),cover);return vec4(vec3(a)-absorbed,a);}
void main(){
  if(uShow*uFlash<.002){gl_FragColor=vec4(0.);return;}
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf()/uCam.z;
  vec3 p=onFloor(vb,uTop);
  float d=min(sdBox(p.xy,uDie0),sdBox(p.xy,uDie1));
  float inside=1.-smoothstep(-.3-.7*px,-.3+.7*px,d);
  float core=inside*(.55+.45*exp(-pow(max(-d,0.)/7.,2.)));
  float e=uFlash*uShow*core;
  e=1.-exp(-1.6*e);
  vec3 dark=vec3(.30,.62,1.)*e*1.25+vec3(.75,.88,1.)*e*e*.6;
  dark=tonemap(dark,1.1);
  float m=max(dark.r,max(dark.g,dark.b));
  vec4 darkInk=vec4(dark,m);
  vec3 seen=mix(vec3(1.),mix(vec3(.30,.55,.98),vec3(.82,.92,1.),smoothstep(.55,.95,e)),smoothstep(0.,.5,e));
  vec4 lightInk=inkFor(seen,.5*smoothstep(.6,.95,e))*smoothstep(0.,.08,e);
  vec4 ink=mix(darkInk,lightInk,uLight);
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  ink=max(ink+vec4(n)*smoothstep(0.,1.5/255.,ink.a),0.);
  ink.rgb=min(ink.rgb,vec3(ink.a));
  gl_FragColor=ink;
}`;
const LIGHT = (root.closest("[data-theme]")?.getAttribute("data-theme") ?? "dark") === "light" ? 1 : 0;
const rect = (r) => [r.x, r.y, r.w, r.d];
const glow = glLayer({ canvas, fragment: FRAGMENT, view: [D.W, D.H], camera: D.camera, uniforms: ["uFlash", "uShow"], fixed: { uLight: LIGHT, uDie0: rect(D.dies[0]), uDie1: rect(D.dies[1]), uTop: D.pkgTop } });
if (glow) stage.setAttribute("data-gl", "");
let drawn = false;
function paintGlow(flash) {
  if (!glow) return;
  const home = PACKAGE.every((id) => piece[id].x < 1e-3 && piece[id].target === 0);
  const show = home ? smooth(0.82, 1, piece.lid.x) : 0;
  if (flash * show > 2e-3) {
    glow.draw({ uFlash: flash, uShow: show }, clock);
    drawn = true;
  } else if (drawn) {
    glow.clear();
    drawn = false;
  }
}

// ---------------------------------------------------------------- tour
const TOUR = [
  { at: 0, open: false, model: 1, precision: 1 },
  { at: 1.6, open: true, model: 1, precision: 0 },
  { at: 8.5, open: true, model: 1, precision: 1 },
  { at: 13.5, open: true, model: 1, precision: 2 },
  { at: 18, open: true, model: 2, precision: 1 },
  { at: 22, open: true, model: 2, precision: 2 },
  { at: 33, open: true, model: 0, precision: 0 },
  { at: 37, apart: true, model: 0, precision: 0 },
  { at: 40, apart: true, part: "fan", model: 0, precision: 0 },
  { at: 43.5, apart: true, part: "dies", model: 0, precision: 0 },
  { at: 46.5, apart: true, part: "interposer", model: 0, precision: 0 },
  { at: 49.5, apart: false, open: true, model: 1, precision: 1 },
  { at: 53, open: false, model: 1, precision: 1 },
];
const TOUR_LENGTH = 56;
let tourStep = -1;
function stepTour(dt) {
  tourClock += dt;
  if (tourClock >= TOUR_LENGTH) {
    tourClock -= TOUR_LENGTH;
    tourStep = -1;
  }
  let index = -1;
  for (let i = 0; i < TOUR.length; i++) if (tourClock >= TOUR[i].at) index = i;
  if (index === tourStep || index < 0) return;
  tourStep = index;
  const step = TOUR[index];
  choose(step.model, step.precision);
  if (step.apart !== undefined) setApart(step.apart);
  if (step.open !== undefined && (step.apart === undefined || step.apart === false)) setOpen(step.open);
  select(step.part ?? null);
}

function quietTour() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (inside) return quietTour();
    touring = !still.matches;
    tourClock = -0.6;
    tourStep = -1;
    run();
  }, 9000);
}

function idleText() {
  if (selected) return D.pieces[selected].say;
  const moving = IDS.some((id) => Math.abs(piece[id].x - piece[id].target) > 0.002 || piece[id].pending);
  if (moving) {
    if (apart) return "taking apart";
    const back = PACKAGE.some((id) => piece[id].x > 0.002 || piece[id].pending);
    return back ? "putting together" : piece.lid.target ? "opening" : "closing";
  }
  return current().readout;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  const calm = still.matches;
  if (touring) stepTour(dt);
  let moving = false;
  for (const id of IDS) if (steerSpring(piece[id], dt, calm)) moving = true;
  const memory = stepMemory(dt, calm);
  place();
  paintGlow(memory.flash);
  say(idleText());
  frame = visible && (moving || memory.moving || touring) ? requestAnimationFrame(tick) : 0;
}

function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
  },
  { rootMargin: "120px 0px" },
).observe(stage);

// ---------------------------------------------------------------- input
function pieceAt(event) {
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const item = hit && hit.closest ? hit.closest(".it") : null;
  return item ? item.dataset.piece : null;
}

stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  inside = true;
  clearTimeout(leaveTimer);
  quietTour();
  select(pieceAt(event));
  run();
});

stage.addEventListener("pointerleave", () => {
  inside = false;
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => !inside && select(null), 260);
});

stage.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch") return;
  quietTour();
  const id = pieceAt(event);
  select(id && id !== selected ? id : null);
  run();
});

openButton.addEventListener("click", () => {
  quietTour();
  setOpen(!open);
  announce(open ? "opening" : "closing");
});

apartButton.addEventListener("click", () => {
  quietTour();
  setApart(!apart);
  announce(apart ? "taking apart" : "putting together");
});

modelChips.forEach((chip, index) =>
  chip.addEventListener("click", () => {
    quietTour();
    if (!open) setOpen(true);
    choose(index, precisionIndex);
  }),
);
precisionChips.forEach((chip, index) =>
  chip.addEventListener("click", () => {
    quietTour();
    if (!open) setOpen(true);
    choose(modelIndex, index);
  }),
);

stage.addEventListener("keydown", (event) => {
  let handled = true;
  if (event.key === "ArrowRight") choose(modelIndex + 1, precisionIndex);
  else if (event.key === "ArrowLeft") choose(modelIndex - 1, precisionIndex);
  else if (event.key === "ArrowUp") choose(modelIndex, precisionIndex + 1);
  else if (event.key === "ArrowDown") choose(modelIndex, precisionIndex - 1);
  else if (event.key === "Home") choose(0, precisionIndex);
  else if (event.key === "End") choose(D.models.length - 1, precisionIndex);
  else if (event.key === "o" || event.key === "O") setOpen(!open);
  else if (event.key === " ") setApart(!apart);
  else if (event.key === "Escape") {
    select(null);
    setOpen(false);
  } else handled = false;
  if (!handled) return;
  event.preventDefault();
  quietTour();
  run();
});

stage.addEventListener("focus", () => (live.textContent = current().readout));
if (still.matches) {
  touring = false;
  setOpen(true);
}
window.addEventListener("resize", run);
sync();
place();
say(idleText());
