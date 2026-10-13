// Builds film.html: the B300 figure inside a 1920×1080 showcase timeline, in the style of
// the anatomy skill's own launch film. `node record.mjs` turns it into an MP4.
//   node build-film.mjs            write film.html (reads ../b300-light.html)
//   node build-film.mjs --chars    print the non-ASCII characters the film uses (for font subsets)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Everything the film says. Edit here, then rebuild.
export const TEXT = {
  introA: "说一个想法",
  introB: "它就变成一台机器",
  youType: "你输入",
  tool: "Claude Code",
  prompt: "/anatomy 用一台真实的机器讲清楚：大模型在 B300 上逐字生成，为什么被 HBM 带宽卡住，可交互",
  promptChip: "/anatomy",
  pills: ["SVG", "WebGL", "3D"],
  number: "No. 1",
  title: "B300",
  subtitle: "token by token",
  drawing: "绘制",
  partsOf: "/ {n}",
  lines: "代码 {n} / {total} 行",
  ceiling: "上限",
  noFit: "装不下",
  memory: "显存 {n} / 288 GB",
  over: "比 288 GB 多出 {n} GB",
  model: "模型",
  weights: "精度",
  open: "打开冷板",
  apart: "拆开",
  pieces: { stand: "工作台", board: "主板", substrate: "封装基板", interposer: "中介层", dies: "两颗 GPU 裸片", hbm: "HBM3e 堆栈", fan: "HBM3e 堆栈", lid: "液冷冷板" },
  partSay: {
    hbm: "8 个 HBM3e 堆栈 · 288 GB · 8 TB/s",
    fan: "1 个堆栈 = 基底 die + 12 层 × 3 GB",
    dies: "两颗接近光罩极限的裸片 · 软件里是一颗 GPU",
    interposer: "CoWoS-L 中介层 · 硅桥连接裸片和 HBM",
    substrate: "封装基板 · 加强框和去耦电容",
    lid: "液冷冷板 · 压在裸片和 8 个堆栈上",
  },
  steps: [
    ["01", "你只输入一句话。", "大白话，在 Claude Code 里。"],
    ["02", "Claude 把机器画出来。", "一个零件一个零件，共 247 个。"],
    ["03", "权重装进显存。", "读取带扫完一遍，就吐出一个 token。"],
    ["04", "你换模型、换精度。", "带宽不变，上限只看权重有多大。"],
    ["05", "拆开看。", "8 个 HBM3e 堆栈，每个 12 层 × 3 GB。"],
  ],
  outroTitle: "Anatomy",
  outroLine: "说出一个想法，Claude 造出解释它的那台机器。",
  install: "npx skills add wheresryan22/anatomy",
  credit: "B300 示例由 Claude Code 和 anatomy skill 生成 · 数字见 model.mjs",
};

const strings = () => JSON.stringify(TEXT);
if (process.argv.includes("--chars")) {
  const chars = [...new Set(strings().replace(/[\x00-\x7f]/g, ""))].join("");
  process.stdout.write(chars);
  process.exit(0);
}

const page = readFileSync(join(HERE, "..", "b300-light.html"), "utf8");
const between = (text, a, b) => {
  const from = text.indexOf(a);
  const to = text.indexOf(b, from + a.length);
  if (from < 0 || to < 0) throw new Error(`can't find ${a}`);
  return text.slice(from + a.length, to);
};
const kitCss = between(page, "<style>", "</style></head>");
const figure = between(page, '<main class="iso-page">', "</main>");
const figureScript = between(page, '<script type="module">', "</script></body>");

const fontFaces = [];
const fontDir = join(HERE, "fonts");
for (const file of existsSync(fontDir) ? readdirSync(fontDir) : []) {
  const match = file.match(/^(.+?)-(normal|italic)-(\d+)\.woff2$/);
  if (!match) continue;
  const [, family, style, weight] = match;
  const data = readFileSync(join(fontDir, file)).toString("base64");
  fontFaces.push(`@font-face{font-family:"${family.replace(/_/g, " ")}";font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2")}`);
}
const thumbs = readdirSync(join(HERE, "thumbs"))
  .filter((file) => file.endsWith(".jpg"))
  .map((file) => ({ name: file.replace(/\.jpg$/, ""), src: `data:image/jpeg;base64,${readFileSync(join(HERE, "thumbs", file)).toString("base64")}` }));

const CSS = `
${fontFaces.join("\n")}
:root{--ink:#18181a;--muted:#8c8c90;--soft:#b4b4b8;--line:#e6e6e3;--page:#f7f7f6;--serif:"EB Garamond","Noto Serif SC",Georgia,serif;--sans:Inter,"Noto Sans SC","WenQuanYi Zen Hei",sans-serif;--mono:ui-monospace,"SF Mono",Menlo,monospace;--blue:#2f6fe4;--red:#e5484d}
html,body{margin:0;background:var(--page)!important;overflow:hidden}
.film{position:fixed;inset:0;width:1920px;height:1080px;background:var(--page);font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased}
.film *{box-sizing:border-box}
.intro{position:absolute;inset:0;pointer-events:none}
.thumb{position:absolute;width:190px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px #0000000d,0 6px 16px -8px #0000002a;overflow:hidden}
.thumb img{display:block;width:100%}
.intro-line{position:absolute;left:0;right:0;top:470px;text-align:center;font-family:var(--serif);font-size:84px;letter-spacing:-.01em;line-height:1.1}
.card{position:absolute;left:230px;top:128px;width:1460px;height:822px;background:#fff;box-shadow:0 0 0 1px #0000000f,0 30px 60px -30px #0000002e,0 12px 24px -14px #00000012}
.ask{position:absolute;inset:0;padding:56px 68px}
.ask-head{display:flex;justify-content:space-between;color:var(--muted);font-size:21px;padding-bottom:20px;border-bottom:2px solid var(--line)}
.ask-text{position:absolute;left:68px;right:160px;top:300px;font-size:40px;line-height:1.45;letter-spacing:-.005em}
.ask-text .cmd{font-weight:600}
.ask-text .caret{display:inline-block;width:3px;height:1.05em;background:var(--ink);vertical-align:-0.15em;margin-left:3px}
.ask-gt{position:absolute;left:68px;top:300px;font-size:40px;color:var(--soft);transform:translateX(-46px)}
.ask-send{position:absolute;right:68px;bottom:62px;width:68px;height:68px;background:#f0f0ee;display:grid;place-items:center;color:var(--muted);font-size:30px}
.view{position:absolute;inset:0}
.chip-prompt{position:absolute;left:44px;top:44px;max-width:1040px;padding:15px 24px;background:#f2f2f0;color:#55555a;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip-prompt b{color:var(--ink);font-weight:600}
.pills{position:absolute;right:54px;top:60px;display:flex;gap:26px;font-size:19px;color:var(--soft)}
.pills span{display:inline-flex;align-items:center;gap:9px}
.pills i{width:11px;height:11px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--soft)}
.pills .on{color:var(--ink)}
.pills .on i{background:var(--ink);box-shadow:none}
.slot{position:absolute;left:150px;top:96px;width:760px}
.slot .iso-page{width:auto}
.slot .iso-figure{margin:0}
.slot .iso-plate{padding:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}
.slot .iso-plate-corners,.slot .b3-controls,.slot figcaption{display:none!important}
.slot .b3-stage:focus,.slot .b3-stage:focus-visible{outline:none!important}
.iso[data-theme="light"]{--anatomy-card:#ffffff;--anatomy-paper:#ffffff}
.panel{position:absolute;left:970px;top:146px;width:440px}
.no{font-size:21px;color:var(--muted)}
.title{font-family:var(--serif);font-size:84px;line-height:.98;margin-top:6px;letter-spacing:-.01em}
.subtitle{font-family:var(--serif);font-style:italic;font-size:66px;line-height:1;color:#8a8a8f}
.status{margin-top:40px;font-size:23px;color:var(--muted);white-space:nowrap;height:30px}
.status b{color:var(--ink);font-weight:500}
.big{display:flex;align-items:baseline;gap:18px;height:146px;margin-top:4px}
.big .n{font-family:var(--serif);font-size:156px;line-height:1;letter-spacing:-.02em;font-variant-numeric:lining-nums}
.big .u{font-family:var(--serif);font-style:italic;font-size:44px;color:#8a8a8f;white-space:nowrap}
.big .u.sans{font-family:var(--sans);font-style:normal;font-size:23px}
.big.red .n{color:var(--red)}
.bar{position:relative;display:flex;gap:6px;height:7px;margin-top:22px}
.bar .seg{position:relative;height:100%;background:#eeeeec;overflow:hidden}
.bar .seg i{position:absolute;inset:0;background:var(--ink);transform-origin:left;transform:scaleX(0)}
.bar .seg.red i{background:var(--red)}
.under{margin-top:16px;font-size:22px;color:#55555a;height:28px;white-space:nowrap}
.controls{margin-top:30px;display:grid;gap:10px}
.row{display:flex;align-items:center;gap:10px}
.row .k{width:62px;font-size:17px;color:var(--muted)}
.fc{padding:6px 14px;border-radius:999px;font-family:var(--mono);font-size:16px;color:var(--muted);box-shadow:inset 0 0 0 1px #00000017;background:#fff}
.fc.on{color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--ink)}
.fc.act{font-family:var(--sans);font-size:15px;color:var(--ink)}
.fc.press{background:#ececea}
.caption{position:absolute;left:236px;top:986px;display:flex;align-items:baseline;gap:16px;font-size:26px;white-space:nowrap}
.caption .num{font-family:var(--mono);font-size:15px;color:var(--muted);padding:3px 7px;box-shadow:inset 0 0 0 1px #0000001a;transform:translateY(-3px)}
.caption .b{color:var(--ink);font-weight:500}
.caption .g{color:var(--soft)}
.cursor{position:absolute;left:0;top:0;width:34px;height:34px;pointer-events:none;filter:drop-shadow(0 2px 3px #0003)}
.outro{position:absolute;inset:0;text-align:center;pointer-events:none}
.outro h1{position:absolute;left:0;right:0;top:300px;margin:0;font-family:var(--serif);font-weight:400;font-size:196px;letter-spacing:-.015em}
.outro p{position:absolute;left:0;right:0;top:618px;margin:0;font-size:31px;color:var(--muted)}
.outro p b{color:var(--ink);font-weight:500}
.outro .install{position:absolute;left:50%;top:700px;transform:translateX(-50%);padding:22px 34px;background:#fff;font-family:var(--mono);font-size:30px;color:var(--ink);box-shadow:0 0 0 1px #0000000f,0 14px 30px -18px #00000033}
.outro .install span{color:var(--muted)}
.outro small{position:absolute;left:0;right:0;top:822px;font-size:18px;color:var(--soft)}
`;

const THUMB_SPOTS = [
  [120, 110, -2], [420, 70, 1.5], [1350, 90, -1], [1650, 150, 2], [210, 640, 1], [560, 760, -2], [1270, 700, 1.5], [1600, 660, -1.5], [880, 120, 0.5], [920, 780, -0.5],
];

const BODY = `
<div class="film" id="film">
  <div class="intro" id="intro">
    ${THUMB_SPOTS.map(([x, y, r], i) => `<div class="thumb" data-thumb="${i}" style="left:${x}px;top:${y}px;transform:rotate(${r}deg)"><img alt="" src="${thumbs[i % thumbs.length].src}"></div>`).join("")}
    <div class="intro-line" id="introA">${TEXT.introA}</div>
    <div class="intro-line" id="introB">${TEXT.introB}</div>
  </div>
  <div class="card" id="card">
    <div class="ask" id="ask">
      <div class="ask-head"><span>${TEXT.youType}</span><span>${TEXT.tool}</span></div>
      <div class="ask-gt">&gt;</div>
      <div class="ask-text" id="askText"></div>
      <div class="ask-send" id="askSend">↑</div>
    </div>
    <div class="view" id="view">
      <div class="chip-prompt"><b>${TEXT.promptChip}</b> ${TEXT.prompt.replace(TEXT.promptChip, "").trim()}</div>
      <div class="pills" id="pills">${TEXT.pills.map((p, i) => `<span data-pill="${i}"><i></i>${p}</span>`).join("")}</div>
      <div class="slot" id="slot">${figure}</div>
      <div class="panel">
        <div class="no">${TEXT.number}</div>
        <div class="title">${TEXT.title}</div>
        <div class="subtitle">${TEXT.subtitle}</div>
        <div class="status" id="status"></div>
        <div class="big" id="big"><span class="n" id="bigN">0</span><span class="u" id="bigU"></span></div>
        <div class="bar" id="bar"></div>
        <div class="under" id="under"></div>
        <div class="controls" id="controls">
          <div class="row"><span class="k">${TEXT.model}</span><span class="fc" data-fm="0">8B</span><span class="fc" data-fm="1">70B</span><span class="fc" data-fm="2">405B</span></div>
          <div class="row"><span class="k">${TEXT.weights}</span><span class="fc" data-fp="0">FP16</span><span class="fc" data-fp="1">FP8</span><span class="fc" data-fp="2">FP4</span></div>
          <div class="row"><span class="k"></span><span class="fc act" data-fa="open">${TEXT.open}</span><span class="fc act" data-fa="apart">${TEXT.apart}</span></div>
        </div>
      </div>
    </div>
  </div>
  <div class="caption" id="caption"><span class="num" id="capN"></span><span class="b" id="capB"></span><span class="g" id="capG"></span></div>
  <div class="outro" id="outro"><h1>${TEXT.outroTitle}</h1><p><b>${TEXT.outroLine.split("，")[0]}，</b>${TEXT.outroLine.split("，").slice(1).join("，")}</p><div class="install"><span>npx skills add </span>${TEXT.install.replace("npx skills add ", "")}</div><small>${TEXT.credit}</small></div>
  <svg class="cursor" id="cursor" viewBox="0 0 34 34"><path d="M6 3 L6 27 L12.2 21.4 L16.4 30.6 L20.4 28.8 L16.3 19.8 L24.6 19.4 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
</div>`;

// A virtual clock: the recorder advances time one frame at a time, so the film and the
// figure's own springs and sweeps land on exactly the same frame every run.
const CLOCK = `(() => {
  let now = 0, id = 0, tid = 0;
  const frames = new Map();
  const timers = [];
  const start = Date.now();
  performance.now = () => now;
  Date.now = () => start + now;
  window.requestAnimationFrame = (cb) => (frames.set(++id, cb), id);
  window.cancelAnimationFrame = (n) => frames.delete(n);
  window.setTimeout = (fn, delay = 0, ...args) => (delay >= 9000 ? 0 : (timers.push({ id: ++tid, at: now + delay, fn, args }), tid));
  window.clearTimeout = (n) => { const i = timers.findIndex((t) => t.id === n); if (i >= 0) timers.splice(i, 1); };
  window.__advance = (ms) => {
    now += ms;
    for (const t of timers.filter((t) => t.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn(...t.args); }
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) cb(now);
    return now;
  };
  window.__clock = () => now;
})();`;

const LINES = ["build.mjs", "live.js", "b300.css", "model.mjs"].reduce((sum, file) => sum + readFileSync(join(HERE, "..", file), "utf8").split("\n").length, 0);
const FILM = readFileSync(join(HERE, "film.js"), "utf8").replace("__TEXT__", strings()).replace("__LINES__", String(LINES));

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=1920"><title>B300 · film</title><style>${kitCss}</style><style>${CSS}</style><script>${CLOCK}</script></head><body class="iso" data-theme="light">${BODY}<script type="module">${figureScript}</script><script type="module">${FILM}</script></body></html>`;
writeFileSync(join(HERE, "film.html"), html);
console.log("wrote film.html", `${(html.length / 1024).toFixed(0)} KB`, `${fontFaces.length} font faces`, `${thumbs.length} thumbs`);
