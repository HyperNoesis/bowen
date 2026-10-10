// @ts-nocheck
/* Lightweight low-poly WebGL renderer. Created as an opt-in real 3D layer with 2D fallback. */
import * as domain_1 from "@campus/domain";
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
}
function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), o = new Float32Array(16);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[14] = 2 * far * near * nf;
    return o;
}
function lookAt(eye, center, up) {
    const norm = (v) => { const d = Math.hypot(...v) || 1; return [v[0] / d, v[1] / d, v[2] / d]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const z = norm(sub(eye, center)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1]);
}
function translate(x, y, z) { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; }
function scale(x, y, z) { const m = identity(); m[0] = x; m[5] = y; m[10] = z; return m; }
function model(x, y, z, w, h, d, rot = 0) { const s = multiply(translate(x, y, z), scale(w, h, d)); if (!rot) return s; const c = Math.cos(rot), n = Math.sin(rot), r = identity(); r[0] = c; r[2] = -n; r[8] = n; r[10] = c; return multiply(translate(x, y, z), multiply(r, scale(w, h, d))); }
function parseColor(hex) { const n = parseInt(hex.replace("#", ""), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function meshData(type) {
    const p = [], n = [];
    const tri = (a, b, c, normal) => { for (const v of [a, b, c]) {
        p.push(...v);
        n.push(...normal);
    } };
    if (type === "box") {
        const faces = [
            [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [0, 0, 1]],
            [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [0, 0, -1]],
            [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-1, 0, 0]],
            [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [1, 0, 0]],
            [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5], [0, 1, 0]],
            [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0]],
        ];
        for (const [a, b, c, d, nn] of faces) {
            tri(a, b, c, nn);
            tri(a, c, d, nn);
        }
    }
    else if (type === "sphere") {
        const lat = 8, lon = 12;
        for (let y = 0; y < lat; y++)
            for (let x = 0; x < lon; x++) {
                const point = (u, v) => { const ph = v * Math.PI, th = u * Math.PI * 2; return [Math.sin(ph) * Math.cos(th) * .5, Math.cos(ph) * .5, Math.sin(ph) * Math.sin(th) * .5]; };
                const a = point(x / lon, y / lat), b = point((x + 1) / lon, y / lat), c = point((x + 1) / lon, (y + 1) / lat), d = point(x / lon, (y + 1) / lat);
                tri(a, b, c, a);
                tri(a, c, d, a);
            }
    }
    else {
        const sides = 12, top = type === "cone" ? 0 : .5, bottom = type === "cone" ? -.5 : -.5;
        for (let i = 0; i < sides; i++) {
            const a = i / sides * Math.PI * 2, b = (i + 1) / sides * Math.PI * 2;
            const p1 = [Math.cos(a) * .5, bottom, Math.sin(a) * .5], p2 = [Math.cos(b) * .5, bottom, Math.sin(b) * .5];
            const p3 = type === "cone" ? [0, .5, 0] : [Math.cos(b) * .5, top, Math.sin(b) * .5];
            const p4 = type === "cone" ? [0, .5, 0] : [Math.cos(a) * .5, top, Math.sin(a) * .5];
            const mid = (a + b) / 2, nn = [Math.cos(mid), .45, Math.sin(mid)];
            tri(p1, p2, p3, nn);
            if (type === "cylinder")
                tri(p1, p3, p4, nn);
            tri([0, bottom, 0], p2, p1, [0, -1, 0]);
            if (type === "cylinder")
                tri([0, top, 0], p4, p3, [0, 1, 0]);
        }
    }
    return { p, n, count: p.length / 3 };
}
const VERT = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; varying vec3 vColor; uniform mat4 uMvp; uniform mat4 uModel; varying vec3 vNormal; varying vec3 vWorld; void main(){ vec4 world=uModel*vec4(aPos,1.0); vWorld=world.xyz; vNormal=mat3(uModel)*aNormal; vColor=aColor; gl_Position=uMvp*vec4(aPos,1.0); }`;
const FRAG = `precision mediump float; uniform vec3 uColor; uniform vec3 uLight; uniform float uEmissive; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vColor; void main(){ vec3 normal=normalize(vNormal); float diffuse=max(dot(normal,normalize(uLight)),0.0); float ambient=0.56; float light=ambient+diffuse*0.62; vec3 base=uColor*vColor; vec3 color=base*light+base*uEmissive; float haze=smoothstep(65.0,115.0,length(vWorld.xz-vec2(60.0,40.0))); color=mix(color,vec3(0.20,0.36,0.38),haze*0.12); gl_FragColor=vec4(color,1.0); }`;
function shader(gl, type, source) { const s = gl.createShader(type); if (!s)
    throw new Error("WebGL shader allocation failed"); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) || "WebGL shader failed"); return s; }
function createMesh(gl, type, custom) { const d = custom ?? meshData(type), pb = gl.createBuffer(), nb = gl.createBuffer(), cb = gl.createBuffer(); if (!pb || !nb || !cb)
    throw new Error("WebGL buffer allocation failed"); const up = (buf, arr) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, arr instanceof Float32Array ? arr : new Float32Array(arr), gl.STATIC_DRAW); };
    const count = custom ? custom.positions.length / 3 : d.count;
    up(pb, custom ? custom.positions : d.p); up(nb, custom ? custom.normals : d.n); up(cb, custom ? custom.colors : new Float32Array(count * 3).fill(1));
    return { p: pb, n: nb, c: cb, count }; }
export function createWorld3DRenderer(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true, depth: true, powerPreference: "low-power" });
    if (!gl)
        throw new Error("WebGL is unavailable on this browser");
    const program = gl.createProgram();
    if (!program)
        throw new Error("WebGL program allocation failed");
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
    gl.useProgram(program);
    const loc = { pos: gl.getAttribLocation(program, "aPos"), normal: gl.getAttribLocation(program, "aNormal"), vcolor: gl.getAttribLocation(program, "aColor"), mvp: gl.getUniformLocation(program, "uMvp"), model: gl.getUniformLocation(program, "uModel"), color: gl.getUniformLocation(program, "uColor"), light: gl.getUniformLocation(program, "uLight"), emissive: gl.getUniformLocation(program, "uEmissive") };
    const meshes = { box: createMesh(gl, "box"), sphere: createMesh(gl, "sphere"), cone: createMesh(gl, "cone"), cylinder: createMesh(gl, "cylinder") };
    // Streamed GLB models: slot ("prop:tree") -> loaded mesh. Missing/failed slots fall back to the code-drawn shapes.
    const slotToName = {};
    const registerMesh = (name, data, slot, entry) => { unregisterMesh(name); meshes[name] = createMesh(gl, "custom", data); slotToName[slot] = { name, entry }; };
    const unregisterMesh = (name) => { const m = meshes[name]; if (!m) return; gl.deleteBuffer(m.p); gl.deleteBuffer(m.n); gl.deleteBuffer(m.c); delete meshes[name]; for (const k of Object.keys(slotToName)) if (slotToName[k].name === name) delete slotToName[k]; };
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(.56, .80, .96, 1);
    gl.uniform3f(loc.light, -.5, 1, .65);
    let width = canvas.clientWidth || 800, height = canvas.clientHeight || 600;
    let pixelRatioCap = 1.25;
    const resize = () => { const dpr = Math.min(window.devicePixelRatio || 1, pixelRatioCap); width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); gl.viewport(0, 0, canvas.width, canvas.height); };
    resize();
    const draw = (shape, x, y, z, w, h, d, color, viewProjection, emissive = 0, rot = 0) => {
        const m = model(x, y, z, w, h, d, rot), mvp = multiply(viewProjection, m), mesh = meshes[shape];
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
        gl.enableVertexAttribArray(loc.pos);
        gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
        gl.enableVertexAttribArray(loc.normal);
        gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.c);
        gl.enableVertexAttribArray(loc.vcolor);
        gl.vertexAttribPointer(loc.vcolor, 3, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(loc.model, false, m);
        gl.uniformMatrix4fv(loc.mvp, false, mvp);
        gl.uniform3fv(loc.color, parseColor(color));
        gl.uniform1f(loc.emissive, emissive);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    };
    const box = (x, z, w, d, h, color, vp, y = 0) => draw("box", x + w / 2, y + h / 2, z + d / 2, w, h, d, color, vp);
    const floor = (x, z, w, d, color, vp, y = 0.025) => box(x, z, w, d, .05, color, vp, y);
    const overlayLabels = (ctx, input, vp) => {
        if (!ctx)
            return 0;
        ctx.clearRect(0, 0, input.width, input.height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let labels = 0;
        const project = (x, y, z) => { const a = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], b = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], c = vp[3] * x + vp[7] * y + vp[11] * z + vp[15]; if (c <= 0)
            return null; return { x: (a / c * .5 + .5) * input.width, y: (1 - (b / c * .5 + .5)) * input.height }; };
        let labelledNpcs = 0;
        const npcLimit = domain_1.QUALITY_PROFILES[input.quality]?.npcs ?? 6;
        for (const e of input.entities) {
            if (e.npc && ++labelledNpcs > npcLimit) continue;
            const p = project(e.x, e.npc ? 2.15 : 2.45, e.y);
            if (!p || p.x < 0 || p.x > input.width || p.y < 0 || p.y > input.height)
                continue;
            const text = e.emote ? `${e.emote} ${e.name}` : e.name;
            ctx.font = `700 ${Math.max(10, Math.min(13, input.width / 75))}px system-ui`;
            const w = ctx.measureText(text).width + 16;
            ctx.fillStyle = "rgba(9,18,39,.82)";
            ctx.beginPath();
            ctx.roundRect(p.x - w / 2, p.y - 10, w, 20, 6);
            ctx.fill();
            ctx.fillStyle = e.tagColor;
            ctx.fillRect(p.x - w / 2, p.y - 10, 3, 20);
            ctx.fillStyle = e.id === input.meId ? "#ffffff" : e.npc ? "#d7e2fa" : "#f6f8ff";
            ctx.fillText(text, p.x, p.y);
            labels++;
        }
        const points = domain_1.INTERACTION_POINTS.filter(p => (!p.hidden || p.id === input.activeHuntPointId) && Math.hypot(p.x - input.camX, p.y - input.camY) <= (input.quality === "low" ? 27 : input.quality === "high" ? 72 : 48));
        for (const p of points) {
            const t = project(p.x, 0.35, p.y);
            if (!t || t.x < 0 || t.x > input.width || t.y < 0 || t.y > input.height)
                continue;
            const label = p.activity === "quiz" ? "QUIZ" : p.activity === "reaction" ? "REACTION" : p.activity === "hunt" ? "HUNT" : p.activity === "shootout" ? "SHOOTOUT" : "WELCOME";
            ctx.font = "800 10px system-ui";
            const w = ctx.measureText(label).width + 12;
            ctx.fillStyle = "rgba(9,18,39,.85)";
            ctx.beginPath();
            ctx.roundRect(t.x - w / 2, t.y - 7, w, 14, 5);
            ctx.fill();
            ctx.fillStyle = p.activity === "quiz" ? "#78fff4" : p.activity === "reaction" ? "#ffe29b" : p.activity === "hunt" ? "#a7ddff" : p.activity === "shootout" ? "#d3e1ff" : "#fff";
            ctx.fillText(label, t.x, t.y);
            labels++;
        }
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        return labels;
    };
    const render = (input, overlay) => {
        const q = input.quality ?? "medium";
        pixelRatioCap = q === "low" ? 0.85 : q === "high" ? 1.5 : 1.2;
        const dpr = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
        if (canvas.width !== Math.round(input.width * dpr) || canvas.height !== Math.round(input.height * dpr))
            resize();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const target = [input.camX, 0, input.camY], eye = [input.camX + 22, 32, input.camY + 27];
        const view = lookAt(eye, target, [0, 1, 0]), proj = perspective(Math.PI / 3, Math.max(.2, input.width / input.height), .1, 170), vp = multiply(proj, view);
        gl.useProgram(program);
        floor(0, 0, domain_1.WORLD.width, domain_1.WORLD.height, "#337e58", vp, -.12);
        // Zone floors create a readable, colourful campus plan without flattening the perspective.
        for (const z of domain_1.ZONES)
            floor(z.x, z.y, z.w, z.h, z.id === "student_commons" ? "#3e986d" : z.id === "main_gate" ? "#477a60" : z.id === "sports_ground" ? "#438b53" : z.id === "food_court" ? "#8d8e54" : z.id === "event_arena" ? "#377f84" : z.id === "library" ? "#397b5a" : "#3c855c", vp, -.035);
        // Main routes and plaza, all actual shallow 3D slabs.
        box(57.5, 4, 5, 76, .12, "#89977f", vp);
        box(4, 35.5, 112, 5, .12, "#89977f", vp);
        box(58, 4, 4, 76, .15, "#dfd2b2", vp);
        box(4, 36, 112, 4, .15, "#dfd2b2", vp);
        floor(50, 47, 20, 15, "#bdae8b", vp, .05);
        floor(54, 50, 12, 8, "#c6b896", vp, .08);
        // Mark sports grounds with a real pitch and field lines.
        floor(81, 64, 32, 12, "#2f7948", vp, .035);
        for (let i = 0; i < 5; i++)
            box(82, 65 + i * 2.25, 30, .08, .015, "#a8d8a1", vp, .09);
        box(96.9, 65, .12, 10, .015, "#a8d8a1", vp, .09);
        draw("cylinder", 97, 0.16, 70, 4.3, .06, 4.3, "#a8d8a1", vp);
        // Open-roof campus architecture: visible interiors remain walkable rather than hidden below solid roofs.
        const propRadius = q === "low" ? 26 : q === "high" ? 72 : 48;
        const nearCamera = (x, z, pad = 0) => Math.hypot(x - input.camX, z - input.camY) <= propRadius + pad;
        // Initialised before culling; buildings outside the camera radius can increment `culled` below.
        let drawn = 1 + domain_1.ZONES.length + domain_1.BUILDINGS.length, culled = 0;
        for (const b of domain_1.BUILDINGS) {
            if (!nearCamera(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * .55)) {
                culled++;
                continue;
            }
            floor(b.x, b.y, b.w, b.h, "#d7c7a6", vp, .07);
            const fac = slotToName["building:" + b.id];
            if (fac && meshes[fac.name]) {
                const sz = fac.entry.size;
                draw(fac.name, b.x + b.w / 2, (fac.entry.yOffset ?? 0) + sz.h / 2, b.y + b.h / 2, sz.w, sz.h, sz.d, "#ffffff", vp);
                drawn++;
            }
            const c = b.color;
            const wallColor = shadeHex(c, -.12);
            for (const s of domain_1.SOLIDS) {
                if (s.kind !== "wall" || !inBuildingWall(s, b))
                    continue;
                box(s.x, s.y, s.w, s.h, b.height, wallColor, vp, .1);
            }
            // Bright top rails make the low-poly structures feel finished and distinct from flat blocks.
            box(b.x, b.y, b.w, .3, .16, c, vp, b.height + .08);
            box(b.x, b.y + b.h - .3, b.w, .3, .16, c, vp, b.height + .08);
            box(b.x, b.y, .3, b.h, .16, shadeHex(c, .15), vp, b.height + .08);
            box(b.x + b.w - .3, b.y, .3, b.h, .16, shadeHex(c, .15), vp, b.height + .08);
            const cols = Math.max(2, Math.floor(b.w / 3));
            for (let i = 0; i < cols; i++) {
                const wx = b.x + 1.2 + i * ((b.w - 2.4) / Math.max(1, cols - 1));
                if (b.door && wx > b.door.x - .8 && wx < b.door.x + b.door.w + .8)
                    continue;
                box(wx, b.y + b.h - .15, .75, .12, .55, "#a8e3f6", vp, Math.max(.55, b.height * .52));
            }
            // Interior guide tables/shelves echo the room geometry and help each building read as a real place.
            if (b.id === "library_hall")
                for (let i = 0; i < 3; i++)
                    box(b.x + 3 + i * 5, b.y + 3, 3, .7, .55, "#8b623d", vp, .1);
            if (b.id === "food_hall")
                box(b.x + 2, b.y + 2, b.w - 4, 1, .75, "#b98648", vp, .1);
            if (b.id === "creator_studio")
                for (let i = 0; i < 3; i++)
                    box(b.x + 2 + i * 3, b.y + 3, 2, .8, .55, "#9a649b", vp, .1);
        }
        // Decor: non-solid scenery from zone data; drawn only when its GLB has streamed in.
        for (const zd of domain_1.ZONE_DEFS) {
            for (const dc of zd.decor) {
                const hit = slotToName["decor:" + dc.model];
                if (!hit || !meshes[hit.name] || !nearCamera(dc.x, dc.y, 4))
                    continue;
                const k = dc.scale ?? 1, sz = hit.entry.size ?? { w: 1, h: 1, d: 1 };
                draw(hit.name, dc.x, (hit.entry.yOffset ?? 0) + sz.h * k / 2, dc.y, sz.w * k, sz.h * k, sz.d * k, "#ffffff", vp, 0, dc.rot ?? 0);
                drawn++;
            }
        }
        // Props are real meshes: tropical palms, benches, shelves, stalls, fountain and gate monuments.
        for (const s of domain_1.SOLIDS) {
            if (s.kind === "wall")
                continue;
            const x = s.x + s.w / 2, z = s.y + s.h / 2;
            if (!nearCamera(x, z, Math.max(s.w, s.h))) {
                culled++;
                continue;
            }
            const slotted = slotToName["prop:" + s.kind];
            if (slotted && meshes[slotted.name]) {
                const sz = slotted.entry.size ?? { w: s.w, h: Math.max(1, Math.max(s.w, s.h)), d: s.h };
                draw(slotted.name, x, (slotted.entry.yOffset ?? 0) + sz.h / 2, z, sz.w, sz.h, sz.d, "#ffffff", vp);
                drawn++;
                continue;
            }
            switch (s.kind) {
                case "tree":
                    draw("cylinder", x, .65, z, .28, 1.35, .28, "#80543a", vp);
                    draw("cone", x, 1.85, z, 2.4, 2.7, 2.4, "#2a8653", vp);
                    if (q !== "low") {
                        draw("cone", x - .15, 2.55, z - .1, 1.8, 2, 1.8, "#46a96a", vp);
                        draw("cone", x + .12, 2.95, z + .08, 1.1, 1.35, 1.1, "#62c982", vp);
                        drawn += 2;
                    }
                    drawn += 2;
                    break;
                case "fountain":
                    draw("cylinder", x, .24, z, s.w, .36, s.h, "#aebbd1", vp);
                    draw("cylinder", x, .45, z, s.w * .76, .12, s.h * .76, "#4da9e9", vp);
                    draw("cylinder", x, .82, z, .22, .7, .22, "#6fd8f0", vp);
                    drawn += 3;
                    break;
                case "pillar":
                    box(s.x, s.y, s.w, s.h, 2.5, "#e4d4b9", vp, .1);
                    box(s.x - .08, s.y - .08, s.w + .16, s.h + .16, .25, "#3675e7", vp, 2.45);
                    drawn += 2;
                    break;
                case "stage":
                    box(s.x, s.y, s.w, s.h, .7, "#168da0", vp, .1);
                    box(s.x, s.y, s.w, .3, .7, "#31c4d0", vp, .8);
                    drawn += 2;
                    break;
                case "bench":
                    box(s.x, s.y, s.w, s.h, .18, "#916239", vp, .55);
                    box(s.x + .2, s.y + .2, .18, .2, .55, "#71503b", vp, .05);
                    box(s.x + s.w - .4, s.y + .2, .18, .2, .55, "#71503b", vp, .05);
                    drawn += 3;
                    break;
                case "shelf":
                    box(s.x, s.y, s.w, s.h, .9, "#8a5c38", vp, .1);
                    for (let i = 0; i < Math.min(5, Math.floor(s.w)); i++)
                        box(s.x + .2 + i * (s.w - .4) / Math.max(1, Math.min(5, Math.floor(s.w)) - 1), s.y + .15, .18, s.h * .65, .48, ["#e8644a", "#2f6bff", "#ffd166", "#4fb286"][i % 4], vp, .5);
                    drawn += 4;
                    break;
                case "counter":
                    box(s.x, s.y, s.w, s.h, .85, "#c9a36a", vp, .1);
                    box(s.x, s.y, s.w, .2, .16, "#e5c588", vp, .95);
                    drawn += 2;
                    break;
                default:
                    box(s.x, s.y, s.w, s.h, .6, "#777777", vp, .1);
                    drawn++;
            }
        }
        for (const p of domain_1.INTERACTION_POINTS) {
            if ((p.hidden && p.id !== input.activeHuntPointId) || !nearCamera(p.x, p.y, 6))
                continue;
            const c = p.activity === "quiz" ? "#4ce4d9" : p.activity === "reaction" ? "#ffd166" : p.activity === "hunt" ? "#65c7ff" : p.activity === "shootout" ? "#8eb8ff" : "#ffffff";
            draw("cylinder", p.x, .16, p.y, 2.0, .12, 2.0, c, vp, .1);
            draw("sphere", p.x, .7 + Math.sin(input.time * 3) * .13, p.y, .62, .62, .62, c, vp, .2);
            drawn += 2;
        }
        let npcCount = 0;
        const npcLimit = domain_1.QUALITY_PROFILES[q]?.npcs ?? 6;
        for (const e of input.entities) {
            if (e.npc && ++npcCount > npcLimit) {
                culled++;
                continue;
            }
            const skin = e.avatar.skin, outfit = e.avatar.outfit, hair = e.avatar.hairColor;
            // Chibi-shaped 3D avatars: outfit/skin/hair are the player's saved customisation, not generic placeholders.
            draw("sphere", e.x, .08, e.y, .78, .16, .7, "#142d2c", vp);
            draw("box", e.x, .38, e.y, .34, .65, .31, "#1b2540", vp);
            draw("box", e.x, .98, e.y, .6, e.avatar.top === "kaftan" ? .78 : .62, .42, outfit, vp);
            draw("sphere", e.x, 1.58, e.y, .48, .48, .46, skin, vp);
            if (hair !== "#1a1210" && hair !== "#3b2415")
                draw("sphere", e.x, 1.81, e.y, .54, .23, .5, hair, vp);
            else if (hair !== "#000000" && e.avatar.hair !== "bald")
                draw("sphere", e.x, 1.79, e.y, .53, .2, .5, hair, vp);
            if (e.avatar.hair === "afro")
                draw("sphere", e.x, 1.88, e.y, .68, .38, .65, hair, vp);
            if (e.avatar.hair === "cap")
                draw("cylinder", e.x, 1.97, e.y, .62, .15, .62, "#e8644a", vp);
            draw("box", e.x - .39, .97, e.y, .18, .58, .19, skin, vp);
            draw("box", e.x + .39, .97, e.y, .18, .58, .19, skin, vp);
            draw("box", e.x - .18, .18, e.y, .19, .38, .2, "#1b2540", vp);
            draw("box", e.x + .18, .18, e.y, .19, .38, .2, "#1b2540", vp);
            drawn += 8;
            if (e.emote)
                draw("sphere", e.x, 2.25, e.y, .28, .28, .28, "#ffd166", vp);
        }
        const labels = overlayLabels(overlay, input, vp);
        return { drawn, culled, labels };
    };
    return { render, resize, registerMesh, unregisterMesh, destroy: () => { for (const m of Object.values(meshes)) {
            gl.deleteBuffer(m.p);
            gl.deleteBuffer(m.n);
            gl.deleteBuffer(m.c);
        } gl.deleteProgram(program); } };
}
function inBuildingWall(s, b) { return s.x >= b.x - .01 && s.x + s.w <= b.x + b.w + .01 && s.y >= b.y - .01 && s.y + s.h <= b.y + b.h + .01; }
function shadeHex(hex, amount) { const n = parseInt(hex.replace("#", ""), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)))); return `#${((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`; }
