// Generates the original low-poly prop models (GLB) + their manifest entries. No dependencies.
//   node scripts/models/generate-props.mjs
// Models are authored directly in world units (1 unit ~ 1 tile) so manifest `size` == model bounding box.
// Palette: natural greens, warm clay/yellow, blue brand accent (see CAMPUS addendum, section 4).
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "apps/web/public/assets/props");
const zonesDir = join(root, "packages/domain/src/world-data/zones");
const manifestPath = join(root, "packages/domain/src/world-data/assets.json");

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

class Mesh {
  constructor() { this.p = []; this.n = []; this.c = []; }
  /** Add triangles (flat-shaded). `xf` maps a local point to world. */
  tri(a, b, c, col) {
    if (typeof col === "string") col = hex(col);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    for (const q of [a, b, c]) { this.p.push(...q); this.n.push(...n); this.c.push(...col); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  get tris() { return this.p.length / 9; }
}
const rotY = (a) => (p) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rotX = (a) => (p) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const rotZ = (a) => (p) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
const chain = (...fs) => (p) => fs.reduce((q, f) => f(q), p);
const move = (x, y, z) => (p) => [p[0] + x, p[1] + y, p[2] + z];
const id = (p) => p;

/** Box centred at (x,y,z) with optional local transform applied about its centre then placed. */
function box(m, x, y, z, w, h, d, color, xf = id) {
  const col = hex(color), hw = w / 2, hh = h / 2, hd = d / 2;
  const P = (i, j, k) => { const q = xf([i * hw, j * hh, k * hd]); return [q[0] + x, q[1] + y, q[2] + z]; };
  m.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col);
  m.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), col);
  m.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col);
  m.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), col);
  m.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), col);
  m.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col);
}
/** Frustum (cylinder when rTop==rBot, cone when rTop==0), base at y, `seg` sides. */
function frustum(m, x, y, z, rBot, rTop, h, seg, color, xf = id, color2) {
  const c1 = hex(color), c2 = color2 ? hex(color2) : c1;
  const P = (r, yy, a) => { const q = xf([Math.cos(a) * r, yy, Math.sin(a) * r]); return [q[0] + x, q[1] + y, q[2] + z]; };
  const top = (() => { const q = xf([0, h, 0]); return [q[0] + x, q[1] + y, q[2] + z]; })(), bot = (() => { const q = xf([0, 0, 0]); return [q[0] + x, q[1] + y, q[2] + z]; })();
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, col = i % 2 ? c1 : c2;
    m.quad(P(rBot, 0, a1), P(rBot, 0, a0), P(rTop, h, a0), P(rTop, h, a1), col);
    if (rTop > 0) m.tri(top, P(rTop, h, a1), P(rTop, h, a0), c1);
    m.tri(bot, P(rBot, 0, a0), P(rBot, 0, a1), c1);
  }
}
/** Low-poly sphere (2 rings) — coconuts, finials, bushes. */
function ball(m, x, y, z, r, color, rings = 3, seg = 6, sy = 1) {
  const col = hex(color), P = (la, lo) => [x + r * Math.cos(la) * Math.cos(lo), y + r * sy * Math.sin(la), z + r * Math.cos(la) * Math.sin(lo)];
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const la0 = -Math.PI / 2 + (i / rings) * Math.PI, la1 = -Math.PI / 2 + ((i + 1) / rings) * Math.PI, lo0 = (j / seg) * Math.PI * 2, lo1 = ((j + 1) / seg) * Math.PI * 2;
    m.quad(P(la0, lo1), P(la0, lo0), P(la1, lo0), P(la1, lo1), col);
  }
}

// ---------------- models ----------------
const models = {};

models.palm_tree = { slot: "prop:tree", build() {
  const m = new Mesh();
  // Curved trunk: five tapered segments leaning slightly, with ring accents.
  let x = 0, z = 0, y = 0;
  const lean = [0.05, 0.09, 0.12, 0.1, 0.06];
  for (let i = 0; i < 5; i++) {
    const h = 0.95, r0 = 0.24 - i * 0.025, r1 = r0 - 0.025;
    frustum(m, x, y, z, r0, r1, h, 6, i % 2 ? "#8a5a3b" : "#a06a45", id, "#80543a");
    x += lean[i]; z += lean[i] * 0.4; y += h * 0.97;
  }
  // Crown: 9 drooping fronds (two-tone blades) + coconuts.
  const greens = ["#2a8653", "#3a9a5f", "#2f8f58", "#46a96a"];
  for (let i = 0; i < 9; i++) {
    const yaw = (i / 9) * Math.PI * 2 + 0.2, len = 2.0 + (i % 3) * 0.25, pitch = 0.55 + (i % 2) * 0.25;
    const xf = chain(rotZ(-pitch), rotY(-yaw), move(x, y, z));
    const col = greens[i % 4], dark = "#1f6f45";
    const seg = 3;
    for (let s = 0; s < seg; s++) {
      const a = s / seg, b = (s + 1) / seg, droop = (t) => -t * t * 0.9;
      const w = (t) => 0.5 * (1 - t) + 0.08;
      const P = (t, side, up = 0) => xf([t * len, droop(t) + up, side * w(t)]);
      m.quad(P(a, -1), P(b, -1), P(b, 1), P(a, 1), s % 2 ? col : dark);
      m.quad(P(a, 1, -0.05), P(b, 1, -0.05), P(b, -1, -0.05), P(a, -1, -0.05), dark);
    }
  }
  for (let i = 0; i < 3; i++) ball(m, x + Math.cos(i * 2.1) * 0.22, y - 0.18, z + Math.sin(i * 2.1) * 0.22, 0.15, "#6b4a2b", 2, 5);
  return m;
} };

models.bench = { slot: "prop:bench", build() {
  const m = new Mesh();
  for (let i = 0; i < 3; i++) box(m, 0, 0.5, -0.3 + i * 0.3, 3, 0.1, 0.24, i % 2 ? "#b9763f" : "#c98a4d");
  for (let i = 0; i < 2; i++) box(m, 0, 0.95 + i * 0.28, -0.45, 3, 0.2, 0.08, "#b9763f", rotX(-0.12));
  for (const sx of [-1.35, 1.35]) {
    box(m, sx, 0.25, 0, 0.1, 0.5, 0.9, "#2b3550");
    box(m, sx, 0.9, -0.42, 0.1, 0.8, 0.08, "#2b3550");
    box(m, sx, 0.62, 0, 0.14, 0.06, 0.95, "#2f6bff"); // brand-blue armrest cap
  }
  return m;
} };

models.library_shelf = { slot: "prop:shelf", build() {
  const m = new Mesh(), W = 6, H = 2.2, D = 1.2, wood = "#7a5236", dark = "#5d3d27";
  box(m, 0, H / 2, -D / 2 + 0.04, W, H, 0.08, dark); // back
  for (const sx of [-W / 2 + 0.06, W / 2 - 0.06]) box(m, sx, H / 2, 0, 0.12, H, D, wood);
  for (let r = 0; r <= 4; r++) box(m, 0, 0.06 + r * 0.52, 0, W, 0.1, D, wood);
  const bookCols = ["#8b6fd6", "#2f6bff", "#e8644a", "#e8a24a", "#4fb286", "#d65fa0", "#1fb7c9", "#f1d3b5"];
  for (let r = 0; r < 4; r++) {
    let bx = -W / 2 + 0.25; const y0 = 0.11 + r * 0.52;
    while (bx < W / 2 - 0.3) {
      const w = 0.12 + rnd() * 0.12, h = 0.28 + rnd() * 0.16, lean = rnd() < 0.08 ? 0.25 : 0;
      box(m, bx + w / 2, y0 + h / 2, 0.05, w, h, D * 0.7, bookCols[Math.floor(rnd() * bookCols.length)], rotZ(lean));
      bx += w + 0.015;
    }
  }
  return m;
} };

models.market_counter = { slot: "prop:counter", build() {
  const m = new Mesh(), W = 10, D = 1.4;
  box(m, 0, 0.55, 0, W, 1.1, D, "#c9784a"); // clay base
  box(m, 0, 1.13, 0, W + 0.2, 0.12, D + 0.2, "#f3e2c4"); // top
  for (let i = 0; i < 10; i++) box(m, -W / 2 + 0.5 + i, 0.55, D / 2 + 0.02, 0.8, 0.9, 0.04, i % 2 ? "#e8a24a" : "#e8644a"); // painted panels
  for (const sx of [-W / 2 + 0.1, W / 2 - 0.1]) for (const sz of [-D / 2 + 0.1, D / 2 - 0.1]) box(m, sx, 1.9, sz, 0.1, 1.6, 0.1, "#5d3d27");
  // striped awning, sloping toward the customer
  const n = 10; for (let i = 0; i < n; i++) box(m, -W / 2 + (i + 0.5) * (W / n), 2.75, 0.1, W / n, 0.06, D + 0.9, i % 2 ? "#ffffff" : "#2f6bff", rotX(0.18));
  for (let i = 0; i < 4; i++) { frustum(m, -3.5 + i * 2.3, 1.19, 0, 0.3, 0.22, 0.4, 7, "#8b4a2b"); ball(m, -3.5 + i * 2.3, 1.62, 0, 0.2, "#e8a24a", 2, 6); } // pots
  return m;
} };

models.gate_pillar = { slot: "prop:pillar", build() {
  const m = new Mesh();
  box(m, 0, 0.2, 0, 1.6, 0.4, 1.6, "#a99a82");
  box(m, 0, 1.7, 0, 1.15, 2.6, 1.15, "#e4d4b9");
  for (const y of [0.9, 1.4, 1.9, 2.4]) box(m, 0, y, 0, 1.22, 0.05, 1.22, "#cdbb9a");
  box(m, 0, 3.1, 0, 1.45, 0.28, 1.45, "#2f6bff"); // blue band
  box(m, 0, 3.38, 0, 1.25, 0.18, 1.25, "#e4d4b9");
  frustum(m, 0, 3.47, 0, 0.5, 0.0, 0.55, 8, "#f1c24a");
  ball(m, 0, 4.12, 0, 0.14, "#f1c24a", 2, 6);
  return m;
} };

models.commons_fountain = { slot: "prop:fountain", build() {
  const m = new Mesh();
  frustum(m, 0, 0, 0, 1.8, 1.7, 0.55, 12, "#aebbd1", id, "#c3cfe0");
  frustum(m, 0, 0.5, 0, 1.55, 1.55, 0.04, 12, "#4da9e9", id, "#5cb7f2"); // water
  frustum(m, 0, 0.5, 0, 0.5, 0.4, 0.6, 8, "#aebbd1");
  frustum(m, 0, 1.05, 0, 0.9, 0.7, 0.14, 10, "#c3cfe0");
  frustum(m, 0, 1.05, 0, 0.78, 0.78, 0.18, 10, "#6fd8f0", id, "#8fe3f6");
  frustum(m, 0, 1.15, 0, 0.14, 0.1, 0.7, 6, "#aebbd1");
  ball(m, 0, 1.95, 0, 0.17, "#8fe3f6", 2, 6);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ball(m, Math.cos(a) * 1.7, 0.62, Math.sin(a) * 1.7, 0.1, "#ffffff", 2, 5); }
  return m;
} };

models.event_stage = { slot: "prop:stage", build() {
  const m = new Mesh(), W = 14, D = 4;
  box(m, 0, 0.35, 0, W, 0.7, D, "#168da0");
  box(m, 0, 0.72, 0, W, 0.06, D, "#e6f6f8"); // deck
  for (let i = 0; i < 4; i++) box(m, -1.5 + i, 0.18 - 0.0, D / 2 + 0.3 - i * 0.0, 1, 0.36 + i * 0.0, 0.5, "#0f6a79"); // steps
  box(m, 0, 2.6, -D / 2 + 0.15, W - 1, 3.4, 0.2, "#12607a"); // backdrop
  box(m, 0, 3.1, -D / 2 + 0.28, W - 3, 1.4, 0.06, "#2f6bff");
  box(m, 0, 2.3, -D / 2 + 0.28, W - 3, 0.2, 0.06, "#f1c24a");
  for (const sx of [-1, 1]) { box(m, sx * (W / 2 - 1), 1.7, -0.3, 1.1, 1.9, 1.0, "#232a3d"); ball(m, sx * (W / 2 - 1), 2.1, 0.22, 0.28, "#3b4560", 2, 6); ball(m, sx * (W / 2 - 1), 1.35, 0.22, 0.38, "#3b4560", 2, 6); }
  box(m, 0, 4.45, 0.2, W - 0.4, 0.14, 0.14, "#9aa6c4"); // lighting truss
  for (const sx of [-W / 2 + 0.2, W / 2 - 0.2]) box(m, sx, 2.5, 0.2, 0.14, 4.0, 0.14, "#9aa6c4");
  for (let i = 0; i < 7; i++) { frustum(m, -5.4 + i * 1.8, 4.2, 0.2, 0.2, 0.14, 0.24, 6, ["#e8644a", "#2f6bff", "#f1c24a"][i % 3]); }
  // bunting
  for (let i = 0; i < 14; i++) box(m, -6.5 + i, 4.1 - Math.sin((i / 14) * Math.PI) * -0.0, 2.05, 0.4, 0.3, 0.02, ["#e8644a", "#f1c24a", "#4fb286", "#2f6bff"][i % 4], rotZ(Math.PI / 4));
  return m;
} };


// ---------------- decor models (non-solid scenery) ----------------
const decorModels = {};

decorModels.lamp_post = { build() {
  const m = new Mesh();
  frustum(m, 0, 0, 0, 0.22, 0.16, 0.35, 8, "#2b3550");
  frustum(m, 0, 0.35, 0, 0.07, 0.05, 2.6, 6, "#394567");
  box(m, 0.28, 2.95, 0, 0.6, 0.06, 0.06, "#394567");
  box(m, 0.55, 2.78, 0, 0.3, 0.3, 0.3, "#ffe9a6");
  frustum(m, 0.55, 2.93, 0, 0.26, 0.0, 0.2, 4, "#2f6bff", rotY(Math.PI / 4));
  box(m, 0, 1.2, 0, 0.18, 0.08, 0.18, "#2f6bff");
  return m;
} };

decorModels.hedge_row = { build() {
  const m = new Mesh();
  box(m, 0, 0.12, 0, 4.1, 0.24, 0.9, "#a99a82"); // planter base
  for (let i = 0; i < 8; i++) ball(m, -1.75 + i * 0.5, 0.62 + (i % 2) * 0.06, 0, 0.42, i % 2 ? "#2f8f58" : "#3a9a5f", 3, 6, 0.85);
  for (let i = 0; i < 5; i++) ball(m, -1.7 + i * 0.85 + rnd() * 0.2, 1.0, (rnd() - 0.5) * 0.3, 0.07, ["#ffd24a", "#ff7a6b", "#ffffff"][i % 3], 2, 5);
  return m;
} };

decorModels.flower_bed = { build() {
  const m = new Mesh();
  box(m, 0, 0.15, 0, 2.6, 0.3, 2.6, "#c3b59a");
  box(m, 0, 0.2, 0, 2.3, 0.3, 2.3, "#5a3d2b");
  const cols = ["#ff5a7a", "#ffd24a", "#ffffff", "#9b6bff", "#ff9a3c"];
  for (let i = 0; i < 16; i++) { const a = rnd() * 6.28, r = 0.3 + rnd() * 0.85; const x = Math.cos(a) * r, z = Math.sin(a) * r; frustum(m, x, 0.35, z, 0.03, 0.03, 0.3, 4, "#2a8653"); ball(m, x, 0.72, z, 0.17, cols[i % cols.length], 2, 6); }
  for (let i = 0; i < 6; i++) ball(m, Math.cos(i) * 0.5, 0.45, Math.sin(i) * 0.5, 0.28, "#3a9a5f", 2, 6, 0.8);
  return m;
} };

decorModels.umbrella_table = { build() {
  const m = new Mesh();
  frustum(m, 0, 0, 0, 0.5, 0.5, 0.06, 8, "#2b3550");
  frustum(m, 0, 0.06, 0, 0.07, 0.07, 0.7, 6, "#394567");
  frustum(m, 0, 0.76, 0, 0.7, 0.7, 0.07, 10, "#f3e2c4");
  frustum(m, 0, 0.0, 0, 0.0, 0.0, 0.0001, 3, "#ffffff");
  frustum(m, 0.0, 0.06, 0, 0.05, 0.05, 2.1, 5, "#c9c9c9", id);
  frustum(m, 0, 2.0, 0, 1.55, 0.0, 0.55, 8, "#e8644a", id, "#ffffff");
  ball(m, 0, 2.6, 0, 0.07, "#f1c24a", 2, 5);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; frustum(m, Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, 0.2, 0.17, 0.42, 6, i % 2 ? "#2f6bff" : "#e8a24a"); }
  return m;
} };

decorModels.goal_post = { build() {
  const m = new Mesh(), W = 7.3, H = 2.4, D = 1.8;
  for (const sx of [-W / 2, W / 2]) frustum(m, sx, 0, 0, 0.08, 0.08, H, 6, "#ffffff");
  box(m, 0, H, 0, W + 0.16, 0.16, 0.16, "#ffffff");
  for (const sx of [-W / 2, W / 2]) { box(m, sx, H / 2, -D, 0.05, H, 0.05, "#ffffff"); box(m, sx, H, -D / 2, 0.05, 0.05, D, "#ffffff"); box(m, sx, 0.03, -D / 2, 0.05, 0.05, D, "#d9e2ec"); }
  box(m, 0, H, -D, W, 0.05, 0.05, "#ffffff");
  box(m, 0, H / 2, -D, W, H, 0.015, "#e9eef5"); // back net panel
  return m;
} };

decorModels.shrub = { build() {
  const m = new Mesh();
  ball(m, 0, 0.45, 0, 0.55, "#2f8f58", 3, 7, 0.85); ball(m, 0.45, 0.35, 0.15, 0.4, "#3a9a5f", 3, 6, 0.85); ball(m, -0.4, 0.35, -0.1, 0.38, "#46a96a", 3, 6, 0.85);
  for (let i = 0; i < 5; i++) ball(m, Math.cos(i * 1.3) * 0.5, 0.65 + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.45, 0.08, ["#ffd24a", "#ff7a6b", "#ffffff"][i % 3], 2, 5);
  return m;
} };

decorModels.signboard = { build() {
  const m = new Mesh();
  for (const sx of [-0.8, 0.8]) frustum(m, sx, 0, 0, 0.06, 0.06, 1.6, 6, "#5d3d27");
  box(m, 0, 1.3, 0, 1.9, 0.9, 0.1, "#2f6bff");
  box(m, 0, 1.3, 0.06, 1.75, 0.75, 0.03, "#eaf1ff");
  box(m, 0, 1.45, 0.08, 1.2, 0.14, 0.02, "#2f6bff"); box(m, 0, 1.18, 0.08, 0.9, 0.1, 0.02, "#9fb4e8");
  box(m, 0, 1.78, 0, 2.0, 0.1, 0.16, "#f1c24a");
  return m;
} };


// ---------------- landmark + paving decor ----------------
const GLYPHS = {
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"], A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"], S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
};
function pixelText(m, text, cx, cy, z, px, color, depth = 0.1) {
  const w = text.length * 5 * px + (text.length - 1) * px; let x0 = cx - w / 2;
  for (const ch of text) { const g = GLYPHS[ch]; for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === "1") box(m, x0 + c * px + px / 2, cy + (3 - r) * px, z, px, px, depth, color); x0 += 6 * px; }
}
function crown(m, x, y, z, s, color) {
  box(m, x, y + 0.1 * s, z, 0.9 * s, 0.2 * s, 0.12 * s, color);
  for (let i = -2; i <= 2; i++) { box(m, x + i * 0.2 * s, y + 0.38 * s + (i % 2 === 0 ? 0.08 * s : 0), z, 0.12 * s, 0.4 * s, 0.12 * s, color); ball(m, x + i * 0.2 * s, y + 0.62 * s + (i % 2 === 0 ? 0.08 * s : 0), z, 0.07 * s, color, 2, 5); }
}
decorModels.gate_arch = { build() {
  const m = new Mesh(), W = 13.4;
  box(m, 0, 0.02, 0, W, 0.04, 0.9, "#2f6bff"); box(m, 0, 0.045, 0, W - 1.2, 0.02, 0.5, "#f3e2c4"); // threshold mat (also anchors the bounding box)
  box(m, 0, 3.7, 0, W, 1.7, 0.4, "#1d4fd8"); // sign board
  box(m, 0, 4.6, 0, W + 0.2, 0.14, 0.5, "#f1c24a"); box(m, 0, 2.86, 0, W + 0.2, 0.14, 0.5, "#f1c24a");
  pixelText(m, "CAMPUS", 0, 3.55, 0.22, 0.17, "#ffffff", 0.1);
  box(m, 0, 3.0, 0.2, 5.8, 0.06, 0.08, "#f1c24a");
  crown(m, 0, 4.7, 0.0, 1.4, "#f1c24a");
  for (const sx of [-1, 1]) { box(m, sx * (W / 2 - 0.15), 1.8, 0, 0.2, 3.4, 0.4, "#1d4fd8"); ball(m, sx * (W / 2 - 0.15), 3.6, 0, 0.2, "#f1c24a", 2, 6); }
  return m;
} };
decorModels.banner_pole = { build() {
  const m = new Mesh();
  frustum(m, 0, 0, 0, 0.18, 0.14, 0.25, 8, "#2b3550"); frustum(m, 0, 0.25, 0, 0.05, 0.05, 3.6, 6, "#394567");
  box(m, 0.0, 3.85, 0, 0.9, 0.08, 0.08, "#f1c24a");
  box(m, 0, 2.55, 0, 0.8, 2.3, 0.05, "#1d4fd8"); box(m, 0, 3.64, 0, 0.8, 0.12, 0.07, "#f1c24a"); box(m, 0, 1.45, 0, 0.8, 0.12, 0.07, "#f1c24a");
  crown(m, 0, 2.95, 0.04, 0.8, "#ffffff"); for (let i = 0; i < 3; i++) box(m, 0, 2.5 - i * 0.28, 0.04, 0.5 - i * 0.08, 0.1, 0.03, "#ffffff");
  return m;
} };
decorModels.palm_royal = { build() { seed = 11; return models.palm_tree.build(); } };
decorModels.plaza_paving = { yOffset: 0.12, build() {
  const m = new Mesh(), W = 17.6, D = 12.8, T = 0.8, nx = Math.round(W / T), nz = Math.round(D / T);
  const sand = ["#e6d6b4", "#dccba6"], clay = "#c9784a", blue = "#2f6bff", cream = "#f5ead0";
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = -W / 2 + (i + 0.5) * T, z = -D / 2 + (j + 0.5) * T, r = Math.hypot(x, z * 1.15);
    let col = sand[(i + j) % 2];
    if (r > 3.0 && r < 3.9) col = blue; else if (r > 5.6 && r < 6.3) col = clay; else if (r < 3.0 && (i + j) % 2) col = cream;
    if (Math.abs(x) > W / 2 - 0.9 || Math.abs(z) > D / 2 - 0.9) col = (i + j) % 2 ? clay : "#e8a24a";
    const g = 0.03, y = 0.05;
    m.quad([x - T / 2 + g, y, z + T / 2 - g], [x + T / 2 - g, y, z + T / 2 - g], [x + T / 2 - g, y, z - T / 2 + g], [x - T / 2 + g, y, z - T / 2 + g], col);
  }
  box(m, 0, 0.02, 0, W, 0.04, D, "#9d8f73"); // grout base (anchors bbox, hides gaps)
  return m;
} };

// ---------------- building facades (generated from each building's data; slot building:<id>) ----------------
function facade(b) {
  const m = new Mesh(), W = b.w, D = b.h, H = b.height, stone = "#e9dfc9", trim = "#fbf7ec", glass = "#79c4ff", accent = b.color;
  const style = /library/.test(b.id) ? "library" : /lecture|science/.test(b.id) ? "glass" : /hostel/.test(b.id) ? "hostel" : /food/.test(b.id) ? "food" : "studio";
  box(m, 0, 0.06, 0, W + 0.3, 0.12, D + 0.3, "#b9ad92"); // plinth (anchors bbox)
  box(m, 0, 0.32, D / 2 + 0.03, W + 0.06, 0.34, 0.06, accent); box(m, 0, 0.32, -D / 2 - 0.03, W + 0.06, 0.34, 0.06, accent);
  for (const sx of [-1, 1]) box(m, sx * (W / 2 + 0.03), 0.32, 0, 0.06, 0.34, D + 0.06, accent);
  // cornice ring
  box(m, 0, H + 0.1, D / 2 + 0.06, W + 0.3, 0.22, 0.3, stone); box(m, 0, H + 0.1, -D / 2 - 0.06, W + 0.3, 0.22, 0.3, stone);
  for (const sx of [-1, 1]) box(m, sx * (W / 2 + 0.06), H + 0.1, 0, 0.3, 0.22, D + 0.3, stone);
  box(m, 0, H + 0.26, D / 2 + 0.06, W + 0.1, 0.1, 0.18, accent); box(m, 0, H + 0.26, -D / 2 - 0.06, W + 0.1, 0.1, 0.18, accent);
  const doorCx = b.door ? b.door.x + b.door.w / 2 - (b.x + W / 2) : null;
  const win = (x, y, z, ax, wd = 0.95, ht = 1.0) => { // ax: 'z' = on a face looking along z, 'x' = looking along x
    const fw = ax === "z" ? wd : 0.07, fd = ax === "z" ? 0.07 : wd;
    box(m, x, y, z, fw + (ax === "z" ? 0.14 : 0), ht + 0.14, fd + (ax === "x" ? 0.14 : 0), trim);
    box(m, x, y, z, ax === "z" ? wd - 0.04 : 0.1, ht - 0.06, ax === "x" ? wd - 0.04 : 0.1, glass);
    box(m, x, y, z, ax === "z" ? 0.05 : 0.12, ht, ax === "x" ? 0.05 : 0.12, trim);
  };
  const rows = style === "hostel" ? [H * 0.28 + 0.35, H * 0.72] : [H * 0.55];
  const spacing = style === "glass" ? 1.4 : 2.2;
  for (const y of rows) {
    const nz = Math.max(1, Math.floor((W - 1.6) / spacing));
    for (let i = 0; i < nz; i++) { const x = -((nz - 1) * spacing) / 2 + i * spacing; if (doorCx !== null && Math.abs(x - doorCx) < 1.6 && y < H * 0.7) continue; win(x, y, D / 2 + 0.03, "z", style === "glass" ? 1.0 : 0.95, style === "glass" ? 1.3 : 1.0); win(x, y, -D / 2 - 0.03, "z"); }
    const nx = Math.max(1, Math.floor((D - 1.6) / 2.4));
    for (let i = 0; i < nx; i++) { const z = -((nx - 1) * 2.4) / 2 + i * 2.4; win(W / 2 + 0.03, y, z, "x"); win(-W / 2 - 0.03, y, z, "x"); }
  }
  if (b.door) { // door frame + canopy + sign
    const dw = b.door.w, z = D / 2 + 0.04;
    for (const sx of [-1, 1]) box(m, doorCx + sx * (dw / 2 + 0.1), 1.0, z, 0.2, 2.0, 0.14, trim);
    box(m, doorCx, 2.05, z, dw + 0.6, 0.2, 0.14, trim);
    box(m, doorCx, H - 0.2, D / 2 + 0.08, dw + 1.2, 0.12, 0.3, accent); // canopy flush with plinth
    box(m, doorCx, H - 0.55, z + 0.04, dw + 0.2, 0.36, 0.06, "#1d4fd8"); box(m, doorCx, H - 0.55, z + 0.08, dw - 0.3, 0.1, 0.04, "#ffffff");
  } else { // closed roof for non-enterable blocks
    box(m, 0, H + 0.05, 0, W - 0.1, 0.1, D - 0.1, "#8d8a84"); box(m, 0, H + 0.12, 0, W - 0.8, 0.08, D - 0.8, "#a6a39c");
    for (let i = 0; i < 3; i++) box(m, -W / 3 + i * (W / 3), H + 0.4, -D / 4, 0.8, 0.5, 0.6, "#cfd6de");
    frustum(m, W / 2 - 1.2, H + 0.1, D / 4, 0.55, 0.55, 0.9, 8, "#4e6a8c"); frustum(m, W / 2 - 1.2, H + 1.0, D / 4, 0.6, 0.0, 0.3, 8, "#394567");
  }
  if (style === "library") { // clock tower
    const tH = 3.4; box(m, 0, H + tH / 2 + 0.2, 0, 2.6, tH, 2.6, "#efe4cc"); box(m, 0, H + tH + 0.3, 0, 3.0, 0.3, 3.0, accent);
    frustum(m, 0, H + tH + 0.45, 0, 1.7, 0.0, 2.4, 4, "#5d4a99", rotY(Math.PI / 4)); ball(m, 0, H + tH + 2.95, 0, 0.14, "#f1c24a", 2, 5);
    for (const [ax, sg] of [["z", 1], ["z", -1], ["x", 1], ["x", -1]]) { const fz = ax === "z" ? sg * 1.33 : 0, fx = ax === "x" ? sg * 1.33 : 0;
      frustum(m, fx, H + tH * 0.62, fz, 0.8, 0.8, 0.06, 14, "#ffffff", chain(rotX(ax === "z" ? Math.PI / 2 : 0), rotZ(ax === "x" ? Math.PI / 2 : 0))); // dial faces outward
      box(m, fx, H + tH * 0.62 + 0.25, fz, ax === "z" ? 0.06 : 0.1, 0.5, ax === "x" ? 0.06 : 0.1, "#1b2540"); box(m, fx + (ax === "x" ? 0 : 0.18), H + tH * 0.62, fz + (ax === "x" ? 0.18 : 0), ax === "z" ? 0.36 : 0.1, 0.06, ax === "x" ? 0.36 : 0.1, "#1b2540"); }
  }
  if (style === "glass") { // glass curtain strip + rooftop plant
    box(m, 0, H * 0.5, D / 2 + 0.07, W * 0.6, H * 0.78, 0.05, "#5aa9ec"); for (let i = -3; i <= 3; i++) box(m, i * (W * 0.6 / 6), H * 0.5, D / 2 + 0.1, 0.05, H * 0.78, 0.04, trim);
    box(m, -W / 4, H + 0.55, 0, 2.2, 0.7, 1.6, "#cfd6de"); frustum(m, W / 4, H + 0.2, 0, 0.9, 0.9, 0.2, 10, "#cfd6de"); frustum(m, W / 4, H + 0.4, 0, 0.8, 0.1, 0.6, 10, "#e9eef5");
  }
  if (style === "food") { for (let i = 0; i < 6; i++) box(m, -W / 2 + 1 + i * ((W - 2) / 5), H + 0.45, D / 2 - 0.2, 0.9, 0.7, 0.1, i % 2 ? "#f1c24a" : "#ffffff"); box(m, 0, H + 1.0, D / 2 - 0.2, 5.6, 0.7, 0.14, "#1d4fd8"); pixelText(m, "S", 0, H + 0.86, D / 2 - 0.1, 0.0001, "#fff", 0.0001); }
  if (style === "studio") { for (let i = 0; i < 4; i++) { ball(m, -W / 2 + 2 + i * ((W - 4) / 3), H + 0.5, D / 2 - 1.0, 0.45, ["#ff5a7a", "#ffd24a", "#9b6bff", "#4fb286"][i], 3, 6); } }
  return m;
}

// ---------------- GLB writer ----------------
function toGlb(m) {
  const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
  const pos = f32(m.p), nor = f32(m.n), col = f32(m.c);
  const count = m.p.length / 3; if (count > 65535) throw new Error("too many vertices for u16 indices");
  const idx = Buffer.from(new Uint16Array(Array.from({ length: count }, (_, i) => i)).buffer);
  const bin = Buffer.concat([pos, nor, col, idx]);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.p[i + k]); hi[k] = Math.max(hi[k], m.p[i + k]); }
  const json = {
    asset: { version: "2.0", generator: "campus generate-props.mjs" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: "VEC3", min: lo, max: hi },
      { bufferView: 1, componentType: 5126, count, type: "VEC3" }, { bufferView: 2, componentType: 5126, count, type: "VEC3" },
      { bufferView: 3, componentType: 5123, count, type: "SCALAR" }],
    bufferViews: [pos, nor, col, idx].map((b, i) => ({ buffer: 0, byteOffset: [0, pos.length, pos.length + nor.length, pos.length + nor.length + col.length][i], byteLength: b.length })),
    buffers: [{ byteLength: bin.length }],
  };
  const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(JSON.stringify(json)), 0x20), b = pad(bin, 0);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  return { glb: Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(b.length, 0x004e4942), b]), lo, hi };
}

// ---------------- decor placement (writes `decor` into each zone file; hand-edit the JSON afterwards) ----------------
const zoneFiles = readdirSync(zonesDir).filter((f) => f.endsWith(".json")).sort();
const zoneData = Object.fromEntries(zoneFiles.map((f) => { const z = JSON.parse(readFileSync(join(zonesDir, f), "utf8")); return [z.id, z]; }));
const allBuildings = Object.values(zoneData).flatMap((z) => z.buildings.map((b) => ({ ...b, zoneId: z.id }))), allProps = Object.values(zoneData).flatMap((z) => z.props);
const blocked = (x, y, pad) => allBuildings.some((b) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) || allProps.some((p) => x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad);
const owner = (x, y) => (Object.values(zoneData).find((z) => x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h)
  ?? Object.values(zoneData).sort((a, b) => Math.hypot(a.rect.x + a.rect.w / 2 - x, a.rect.y + a.rect.h / 2 - y) - Math.hypot(b.rect.x + b.rect.w / 2 - x, b.rect.y + b.rect.h / 2 - y))[0]).id;
const want = [];
const add = (model, x, y, rot = 0, scale = 1, pad = 0.9) => want.push({ model, x: r2(x), y: r2(y), rot: r2(rot), scale, pad });
function r2(n) { return Math.round(n * 100) / 100; }
for (let y = 8; y <= 72; y += 8) { add("lamp_post", 56.3, y, 0); add("lamp_post", 63.7, y, Math.PI); }          // main spine
for (let x = 10; x <= 110; x += 10) if (x < 52 || x > 68) { add("lamp_post", x, 34.0, 0); add("lamp_post", x, 42.0, Math.PI); } // cross path
for (const [x, y] of [[52, 46.4], [68, 46.4], [52, 63], [68, 63], [50, 76.8], [70, 76.8]]) add("hedge_row", x, y, 0);
for (const [x, y] of [[51.5, 50], [68.5, 50], [53, 67.5], [67, 67.5], [13, 23], [23, 23], [10, 67], [20, 67], [84, 53.5], [94, 53.5]]) add("flower_bed", x, y, 0);
for (const [x, y] of [[81, 54.5], [85.5, 56.5], [90, 54.5], [94.5, 56.5], [47, 51], [73, 51], [47, 56], [73, 57]]) add("umbrella_table", x, y, 0, 1, 1.3);
add("goal_post", 81.6, 70, Math.PI / 2, 1, 0.3); add("goal_post", 112.4, 70, -Math.PI / 2, 1, 0.3);
for (const b of allBuildings) {
  add("shrub", b.x - 0.9, b.y + b.h + 0.5, 0, 1, 0.1); add("shrub", b.x + b.w + 0.9, b.y + b.h + 0.5, 0, 1, 0.1);
  if (b.door) add("signboard", b.door.x + b.door.w + 1.8, b.y + b.h + 1.1, 0, 1, 0.1);
}
add("gate_arch", 60, 71.7, 0, 1, 0.3);
add("plaza_paving", 60, 54.5, 0, 1, 0);
for (let y = 14; y <= 66; y += 16) { add("banner_pole", 55.3, y, 0.35); add("banner_pole", 64.7, y, -0.35); }
for (let y = 9; y <= 70; y += 9) { add("palm_royal", 53.6, y + 2, 0, 1 + 0.12 * ((y / 9) % 3)); add("palm_royal", 66.4, y, 0, 1.1 - 0.1 * ((y / 9) % 2)); }
for (let x = 15; x <= 105; x += 15) if (x < 50 || x > 70) add("palm_royal", x, 33.4, 0, 1 + 0.1 * ((x / 15) % 3));
for (const [x, y] of [[46, 52], [74, 52], [46, 59], [74, 59], [78, 66], [112, 66], [44, 8], [76, 8], [90, 40], [28, 62], [10, 46]]) add("palm_royal", x, y, 0, 1.05);
const kept = want.filter((d) => !blocked(d.x, d.y, d.pad) && d.x > 0.5 && d.y > 0.5 && d.x < 119.5 && d.y < 79.5);
console.log(`decor: ${kept.length} placed, ${want.length - kept.length} dropped (blocked)`);
for (const z of Object.values(zoneData)) z.decor = [];
for (const d of kept) { const { pad, ...rest } = d; if (rest.scale === 1) delete rest.scale; if (!rest.rot) delete rest.rot; zoneData[owner(d.x, d.y)].decor.push(rest); }
for (const z of Object.values(zoneData)) writeFileSync(join(zonesDir, `${z.id}.json`), JSON.stringify(z, null, 2) + "\n");

// ---------------- write GLBs + manifest ----------------
const zonesByKind = {}, zonesByDecor = {};
for (const z of Object.values(zoneData)) {
  for (const p of z.props) (zonesByKind[p.kind] ??= new Set()).add(z.id);
  for (const d of z.decor) (zonesByDecor[d.model] ??= new Set()).add(z.id);
}
mkdirSync(outDir, { recursive: true });
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.assets = [];
const r = (n) => Math.round(n * 100) / 100;
const facadeDefs = allBuildings.map((b) => [`facade_${b.id}`, `building:${b.id}`, { build: () => facade(b) }, [b.zoneId]]);
const all = [...facadeDefs, ...Object.entries(models).map(([n, d]) => [n, d.slot, d, zonesByKind[d.slot.split(":")[1]]]), ...Object.entries(decorModels).map(([n, d]) => [n, `decor:${n}`, d, zonesByDecor[n]])];
for (const [name, slot, def, zset] of all) {
  seed = 7;
  const mesh = def.build(), { glb, lo, hi } = toGlb(mesh);
  writeFileSync(join(outDir, `${name}.glb`), glb);
  const zones = [...(zset ?? [])].sort();
  if (!zones.length) { console.warn(`skip manifest for ${name}: not used by any zone`); continue; }
  manifest.assets.push({
    id: name, url: `/assets/props/${name}.glb`, slot, zones, maxBytes: Math.ceil(glb.length * 1.25 / 1000) * 1000, maxTriangles: Math.ceil(mesh.tris * 1.25 / 100) * 100,
    size: { w: r(hi[0] - lo[0]), h: r(hi[1] - lo[1]), d: r(hi[2] - lo[2]) }, yOffset: def.yOffset ?? 0,
  });
  console.log(`${name.padEnd(18)} ${String(mesh.tris).padStart(5)} tris  ${String(glb.length).padStart(7)} bytes  zones=${zones.join(",")}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
{
  const total = manifest.assets.reduce((n, a) => n + readFileSync(join(outDir, `${a.id}.glb`)).length, 0);
  console.log(`total GLB bytes if everything were resident: ${total} (resident budget ${manifest.residentBudget.maxBytes})`);
  if (total > manifest.residentBudget.maxBytes) console.warn("WARNING: all models together exceed the resident budget; zone streaming will evict.");
}
