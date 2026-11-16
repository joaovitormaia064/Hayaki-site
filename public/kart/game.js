import * as THREE from './vendor/three.module.min.js';

/* ───────────── utilidades ───────────── */
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const rnd = (a, b) => a + Math.random() * (b - a);
const rid = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const fmtTime = (t) => { const m = Math.floor(t / 60); const s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };
const QS = new URLSearchParams(location.search);
const STEP = 1 / 60;

const COLORS = ['#ff4d4d', '#3d8bff', '#35d07f', '#ffb020', '#b56bff', '#ff7ac8', '#22d3e6', '#f2f2f2'];
const BOT_NAMES = ['Faísca', 'Trovão', 'Pipoca', 'Zé Turbo', 'Marola', 'Brisa', 'Cometa', 'Tatu'];
const ICON = { nitro: '🔥', triple: '🔥', oil: '🛢️', disc: '🥏', missile: '🎯', shield: '🛡️', emp: '⚡' };

const TRACKS = [
  { name: 'Vale Verde', scale: 1.5,
    pts: [[0, 0], [120, 0], [200, 40], [220, 130], [160, 200], [60, 190], [0, 230], [-90, 210], [-130, 130], [-90, 50]],
    sky: 0x8ecbff, ground: 0x4c9a3d, wallA: '#e9e9e9', wallB: '#e0483a', scenery: 'tree', light: 1 },
  { name: 'Cânion Seco', scale: 1.5,
    pts: [[0, 0], [140, 0], [220, -50], [300, 0], [320, 100], [250, 170], [150, 150], [80, 200], [100, 290], [30, 340], [-70, 300], [-60, 200], [-120, 120], [-100, 30]],
    sky: 0xf6c98a, ground: 0xc9954f, wallA: '#f4e3c1', wallB: '#8a4b25', scenery: 'cactus', light: 1 },
  { name: 'Pico Gelado', scale: 1.5,
    pts: [[0, 0], [160, 0], [240, 60], [200, 150], [100, 130], [40, 190], [110, 260], [220, 250], [300, 310], [240, 400], [100, 390], [-20, 340], [-90, 230], [-60, 100]],
    sky: 0x27345e, ground: 0xdfe9f5, wallA: '#9fd3ff', wallB: '#2d4a8a', scenery: 'pine', light: 0.8 },
];

/* ───────────── pista ───────────── */
function buildTrack(def) {
  const s = def.scale;
  const curve = new THREE.CatmullRomCurve3(def.pts.map((p) => new THREE.Vector3(p[0] * s, 0, p[1] * s)), true, 'centripetal');
  curve.arcLengthDivisions = 3000;
  const L = curve.getLength();
  const N = Math.round(L / 2.5);
  const sp = curve.getSpacedPoints(N);
  const P = [], T = [], Lf = [];
  for (let i = 0; i < N; i++) P.push({ x: sp[i].x, z: sp[i].z });
  for (let i = 0; i < N; i++) {
    const a = P[(i + N - 1) % N], b = P[(i + 1) % N];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    T.push({ x: tx, z: tz }); Lf.push({ x: tz, z: -tx });
  }
  const hw = 12;
  return { def, N, L, P, T, Lf, seglen: L / N, hw, wall: hw + 7 };
}
function locate(tr, x, z, hint, win = 14) {
  const N = tr.N; let bi = 0, bd = 1e18; const h = Math.round(hint);
  for (let o = -win; o <= win; o++) {
    const i = (((h + o) % N) + N) % N; const p = tr.P[i];
    const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d2 < bd) { bd = d2; bi = i; }
  }
  const p = tr.P[bi], t = tr.T[bi], l = tr.Lf[bi];
  const dx = x - p.x, dz = z - p.z;
  const f = clamp((dx * t.x + dz * t.z) / tr.seglen, -0.5, 0.5);
  return { i: bi, s: bi + f, d: dx * l.x + dz * l.z };
}
function trackPoint(tr, s, d) {
  const N = tr.N; const i = ((Math.floor(s) % N) + N) % N; const j = (i + 1) % N; const f = s - Math.floor(s);
  const a = tr.P[i], b = tr.P[j], l = tr.Lf[i];
  return { x: a.x + (b.x - a.x) * f + l.x * d, z: a.z + (b.z - a.z) * f + l.z * d, i };
}

/* ───────────── texturas procedurais ───────────── */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const roadTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4a4d57'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = '#d8382e'; g.fillRect(0, 0, 14, h / 2); g.fillRect(w - 14, h / 2, 14, h / 2);
  g.fillStyle = '#f3f3f3'; g.fillRect(0, h / 2, 14, h / 2); g.fillRect(w - 14, 0, 14, h / 2);
  g.fillRect(16, 0, 4, h); g.fillRect(w - 20, 0, 4, h);
  g.fillStyle = '#f5d442'; g.fillRect(w / 2 - 3, 0, 6, h * 0.55);
}, true);
const wallTex = (a, b) => canvasTex(64, 16, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w / 2, h); }, true);
const checkTex = () => canvasTex(128, 16, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); } });
const boxTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#12303a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#35e0c0'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  g.strokeStyle = 'rgba(53,224,192,.45)'; g.lineWidth = 5; g.beginPath(); g.moveTo(6, 6); g.lineTo(w - 6, h - 6); g.moveTo(w - 6, 6); g.lineTo(6, h - 6); g.stroke();
  g.fillStyle = '#ffb020'; g.font = '900 84px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', w / 2, h / 2 + 4);
});
function tagSprite(text, color) {
  const t = canvasTex(256, 64, (g, w, h) => {
    g.font = '800 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, w / 2, h / 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(7, 1.75, 1); s.position.y = 3.6; s.renderOrder = 10; return s;
}

/* ───────────── cena ───────────── */
const renderer = new THREE.WebGLRenderer({ canvas: $('#view'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
let scene = new THREE.Scene();
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

function ribbon(tr, dA, dB, yA, yB, vScale) {
  const N = tr.N; const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N; const p = tr.P[k], l = tr.Lf[k];
    pos.push(p.x + l.x * dA, yA, p.z + l.z * dA, p.x + l.x * dB, yB, p.z + l.z * dB);
    uv.push(0, i * tr.seglen / vScale, 1, i * tr.seglen / vScale);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

function buildScene(tr) {
  const def = tr.def; scene = new THREE.Scene();
  scene.background = new THREE.Color(def.sky); scene.fog = new THREE.Fog(def.sky, 220, 900);
  scene.add(new THREE.HemisphereLight(0xffffff, def.ground, 1.5 * def.light));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6 * def.light); sun.position.set(0.5, 1, 0.3); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lam(def.ground)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const road = new THREE.Mesh(ribbon(tr, tr.hw, -tr.hw, 0.02, 0.02, 24), new THREE.MeshLambertMaterial({ map: roadTex(), side: THREE.DoubleSide })); scene.add(road);
  const wm = new THREE.MeshLambertMaterial({ map: wallTex(def.wallA, def.wallB), side: THREE.DoubleSide });
  for (const sg of [1, -1]) {
    const g = ribbon(tr, sg * tr.wall, sg * tr.wall, 0, 1.5, 10);
    // UV: u ao longo, v na altura
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
    scene.add(new THREE.Mesh(g, wm));
  }
  // linha de largada + pórtico
  const st = new THREE.Group(); const p0 = tr.P[0], t0 = tr.T[0];
  st.position.set(p0.x, 0, p0.z); st.rotation.y = Math.atan2(t0.x, t0.z);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(tr.hw * 2, 3), new THREE.MeshBasicMaterial({ map: checkTex() })); line.rotation.x = -Math.PI / 2; line.position.y = 0.04; st.add(line);
  for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(1, 11, 1), lam(0x333a4d)); post.position.set(sx * (tr.hw + 2), 5.5, 0); st.add(post); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(tr.hw * 2 + 5, 2.6, 0.6), new THREE.MeshBasicMaterial({ map: checkTex() })); beam.position.y = 10; st.add(beam);
  scene.add(st);
  // cenário
  const pts = []; let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of tr.P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  let guard = 0;
  while (pts.length < 420 && guard++ < 6000) {
    const x = rnd(minX - 120, maxX + 120), z = rnd(minZ - 120, maxZ + 120); let ok = true;
    for (let i = 0; i < tr.N; i += 3) { const p = tr.P[i]; if ((x - p.x) ** 2 + (z - p.z) ** 2 < (tr.wall + 6) ** 2) { ok = false; break; } }
    if (ok) pts.push([x, z, rnd(0.8, 1.5)]);
  }
  const kind = def.scenery;
  const trunkG = kind === 'cactus' ? new THREE.CylinderGeometry(0.9, 1, 7, 7) : new THREE.CylinderGeometry(0.6, 0.8, 3, 6);
  const topG = kind === 'cactus' ? new THREE.DodecahedronGeometry(2.2) : new THREE.ConeGeometry(3.4, kind === 'pine' ? 11 : 8, 7);
  const trunkM = lam(kind === 'cactus' ? 0x3f8f4a : 0x7a5230);
  const topM = lam(kind === 'cactus' ? 0x9a6a43 : kind === 'pine' ? 0xf4f8ff : 0x2f7d32);
  const im1 = new THREE.InstancedMesh(trunkG, trunkM, pts.length), im2 = new THREE.InstancedMesh(topG, topM, pts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  pts.forEach(([x, z, s], i) => {
    sc.set(s, s, s);
    m.compose(v.set(x, (kind === 'cactus' ? 3.5 : 1.5) * s, z), q, sc); im1.setMatrixAt(i, m);
    if (kind === 'cactus') m.compose(v.set(x + 5 * s, 1.2 * s, z + 3 * s), q, sc); else m.compose(v.set(x, (kind === 'pine' ? 8 : 6.5) * s, z), q, sc);
    im2.setMatrixAt(i, m);
  });
  scene.add(im1, im2);
  // montanhas ao fundo
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, R = Math.max(maxX - minX, maxZ - minZ) / 2 + 420;
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2 + rnd(-0.1, 0.1), h = rnd(110, 230);
    const mt = new THREE.Mesh(new THREE.ConeGeometry(rnd(130, 220), h, 6), lam(new THREE.Color(def.ground).multiplyScalar(0.6)));
    mt.position.set(cx + Math.cos(a) * R, h / 2 - 5, cz + Math.sin(a) * R); scene.add(mt);
  }
}

function makeKartMesh(color, name, showTag) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const add = (geo, mat, x, y, z, parent = body) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); parent.add(o); return o; };
  const cm = lam(color), dark = lam(0x22252e), white = lam(0xf4f4f4);
  add(new THREE.BoxGeometry(1.9, 0.5, 3.1), cm, 0, 0.6, 0);
  add(new THREE.BoxGeometry(1.3, 0.35, 0.9), cm, 0, 0.55, 1.8);
  add(new THREE.BoxGeometry(2.3, 0.14, 0.5), dark, 0, 0.42, 2.2);
  add(new THREE.BoxGeometry(1.1, 0.9, 0.3), dark, 0, 1.15, -0.95);
  add(new THREE.BoxGeometry(2.1, 0.12, 0.55), white, 0, 1.75, -1.45);
  for (const sx of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.12, 0.7, 0.4), dark, sx, 1.4, -1.45);
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 10), white, 0, 1.25, -0.25);
  add(new THREE.SphereGeometry(0.52, 14, 10), cm, 0, 2.05, -0.25);
  add(new THREE.BoxGeometry(0.75, 0.24, 0.3), dark, 0, 2.08, 0.15);
  const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 12); wg.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-1.15, 1.15], [1.15, 1.15], [-1.2, -1.05], [1.2, -1.05]]) wheels.push(add(wg, dark, x, 0.5, z));
  const flame = add(new THREE.ConeGeometry(0.45, 2.2, 8), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 }), 0, 0.7, -2.6);
  flame.rotation.x = -Math.PI / 2; flame.visible = false;
  const sparkM = new THREE.MeshBasicMaterial({ color: 0x40b0ff });
  const sparks = [add(new THREE.SphereGeometry(0.34, 6, 5), sparkM, -1.2, 0.25, -1.5), add(new THREE.SphereGeometry(0.34, 6, 5), sparkM, 1.2, 0.25, -1.5)];
  sparks.forEach((s) => (s.visible = false));
  const shield = add(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.32 }), 0, 1.1, 0, g); shield.visible = false;
  const zap = add(new THREE.SphereGeometry(0.4, 6, 5), new THREE.MeshBasicMaterial({ color: 0x9ad0ff }), 0, 3, 0, g); zap.visible = false;
  const shadow = add(new THREE.CircleGeometry(1.9, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }), 0, 0.05, 0, g); shadow.rotation.x = -Math.PI / 2;
  if (showTag) g.add(tagSprite(name, color));
  return { g, body, wheels, flame, sparks, sparkM, shield, zap };
}

/* ───────────── áudio ───────────── */
let actx = null, engOsc = null, engGain = null;
function audioInit() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    engOsc = actx.createOscillator(); engOsc.type = 'sawtooth'; engGain = actx.createGain(); engGain.gain.value = 0;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    engOsc.connect(lp); lp.connect(engGain); engGain.connect(actx.destination); engOsc.start();
  } catch (e) { actx = null; }
}
function sfx(freq, dur = 0.12, type = 'square', vol = 0.08, slide = 0) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, actx.currentTime + dur);
  g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
}

/* ───────────── rede ───────────── */
// Topologia em estrela: os convidados falam com o anfitrião, que repassa aos demais.
const net = {
  online: false, isHost: true, conns: new Map(), peer: null, bc: null, onMsg: null, onLeave: null, onDown: null, cid: rid(6),
  reset() {
    try { this.peer && this.peer.destroy(); } catch (e) {}
    try { this.bc && (this.bc.postMessage({ from: this.cid, bye: 1 }), this.bc.close()); } catch (e) {}
    this.peer = null; this.bc = null; this.conns.clear(); this.online = false; this.isHost = true;
  },
  _accept(id, send) { const c = { id, send }; this.conns.set(id, c); return c; },
  _recv(c, msg) {
    if (this.isHost && msg.t !== 'join') for (const o of this.conns.values()) if (o !== c) o.send(msg);
    this.onMsg && this.onMsg(msg, c);
  },
  _drop(id) { const c = this.conns.get(id); if (!c) return; this.conns.delete(id); if (this.isHost) this.onLeave && this.onLeave(c); else this.onDown && this.onDown(); },
  host(code) {
    this.reset(); this.online = true; this.isHost = true;
    if (QS.get('net') === 'bc') return this._bc(code, true);
    return new Promise((res, rej) => {
      const peer = this.peer = new window.Peer('cturbo-' + code);
      peer.on('open', () => res());
      peer.on('error', (e) => rej(new Error(e.type === 'unavailable-id' ? 'Código em uso, tente de novo.' : 'Falha na conexão (' + e.type + ').')));
      peer.on('connection', (dc) => {
        dc.on('open', () => { const c = this._accept(dc.peer, (m) => { try { dc.send(m); } catch (e) {} }); dc.on('data', (m) => this._recv(c, m)); });
        dc.on('close', () => this._drop(dc.peer));
      });
    });
  },
  join(code) {
    this.reset(); this.online = true; this.isHost = false;
    if (QS.get('net') === 'bc') return this._bc(code, false);
    return new Promise((res, rej) => {
      const peer = this.peer = new window.Peer();
      const to = setTimeout(() => rej(new Error('Sala não encontrada.')), 12000);
      peer.on('error', (e) => { clearTimeout(to); rej(new Error(e.type === 'peer-unavailable' ? 'Sala não encontrada.' : 'Falha na conexão (' + e.type + ').')); });
      peer.on('open', () => {
        const dc = peer.connect('cturbo-' + code, { reliable: true, serialization: 'json' });
        dc.on('open', () => { clearTimeout(to); const c = this._accept('host', (m) => { try { dc.send(m); } catch (e) {} }); dc.on('data', (m) => this._recv(c, m)); res(); });
        dc.on('close', () => this._drop('host'));
      });
    });
  },
  // Transporte entre abas do mesmo navegador (?net=bc), usado para testar o netcode sem internet.
  _bc(code, host) {
    const bc = this.bc = new BroadcastChannel('cturbo-' + code);
    return new Promise((res, rej) => {
      if (host) {
        bc.onmessage = ({ data }) => {
          if (!data.from) return;
          if (data.bye) return this._drop(data.from);
          let c = this.conns.get(data.from);
          if (!c) c = this._accept(data.from, (m) => bc.postMessage({ to: data.from, d: m }));
          if (data.d) this._recv(c, data.d);
        };
        res();
      } else {
        const c = this._accept('host', (m) => bc.postMessage({ from: this.cid, d: m }));
        bc.onmessage = ({ data }) => { if (data.to === this.cid && data.d) this._recv(c, data.d); };
        res();
      }
    });
  },
  send(msg) { if (!this.online) return; for (const c of this.conns.values()) c.send(msg); },
};
addEventListener('pagehide', () => net.reset());

/* ───────────── estado geral ───────────── */
const me = { id: net.cid, name: localStorage.getItem('ct_name') || '', color: localStorage.getItem('ct_color') || COLORS[0] };
let mode = 'menu';            // menu | lobby | race
let split = false;
let lobby = null;             // { players:[{id,name,color}], track, laps, cc, bots, racing }
let race = null;
const huds = [];

function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); }
function localPlayers() {
  const a = [{ id: me.id, name: me.name || 'Piloto', color: me.color }];
  if (split) a.push({ id: me.id + '2', name: 'Jogador 2', color: COLORS.find((c) => c !== me.color) });
  return a;
}

/* ───────────── menu e sala ───────────── */
const colorsEl = $('#colors');
COLORS.forEach((c) => { const i = document.createElement('i'); i.style.background = c; i.onclick = () => { me.color = c; localStorage.setItem('ct_color', c); paintColors(); }; colorsEl.append(i); });
const paintColors = () => [...colorsEl.children].forEach((i, n) => i.classList.toggle('sel', COLORS[n] === me.color));
paintColors();
$('#name').value = me.name;
$('#name').oninput = (e) => { me.name = e.target.value.trim().slice(0, 12); localStorage.setItem('ct_name', me.name); };
TRACKS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.name; $('#selTrack').append(o); });
if (QS.get('sala')) $('#code').value = QS.get('sala').toUpperCase();

function newLobby() { return { players: localPlayers(), track: 0, laps: 3, cc: 1, bots: 8, racing: false }; }
function renderLobby() {
  if (!lobby) return;
  $('#plist').innerHTML = '';
  for (const p of lobby.players) { const li = document.createElement('li'); const i = document.createElement('i'); i.style.background = p.color; li.append(i, document.createTextNode(p.name)); $('#plist').append(li); }
  $('#selTrack').value = lobby.track; $('#selLaps').value = lobby.laps; $('#selCC').value = lobby.cc; $('#selBots').value = lobby.bots;
  for (const s of ['#selTrack', '#selLaps', '#selCC', '#selBots']) $(s).disabled = !net.isHost;
  $('#bStart').style.display = net.isHost ? '' : 'none';
  $('#lobbyMsg').style.color = '#9aa3bd';
  $('#lobbyMsg').textContent = net.isHost ? '' : (lobby.racing ? 'Corrida em andamento — você entra na próxima.' : 'Aguardando o anfitrião começar…');
}
function pushLobby() { renderLobby(); if (net.online && net.isHost) net.send({ t: 'lobby', lobby }); }
for (const [sel, key] of [['#selTrack', 'track'], ['#selLaps', 'laps'], ['#selCC', 'cc'], ['#selBots', 'bots']]) $(sel).onchange = (e) => { lobby[key] = +e.target.value; pushLobby(); };

function enterLobby(code) {
  mode = 'lobby'; show('lobby'); $('#results').classList.remove('on'); hudVisible(false);
  $('#roomBox').style.display = code ? '' : 'none';
  $('#lobbyTitle').textContent = code ? 'Sala online' : (split ? 'Tela dividida' : 'Corrida solo');
  if (code) { $('#roomCode').textContent = code; $('#roomLink').textContent = 'Convide: ' + location.origin + location.pathname + '?sala=' + code; }
  renderLobby();
}
function toMenu(err) { net.reset(); race = null; lobby = null; mode = 'menu'; show('menu'); $('#results').classList.remove('on'); hudVisible(false); $('#menuErr').textContent = err || ''; }

$('#bSolo').onclick = () => { audioInit(); net.reset(); split = false; lobby = newLobby(); enterLobby(); };
$('#bSplit').onclick = () => { audioInit(); net.reset(); split = true; lobby = newLobby(); enterLobby(); };
$('#bHost').onclick = async () => {
  audioInit(); split = false; const code = (QS.get('net') === 'bc' && QS.get('sala')) || rid(4);
  $('#menuErr').textContent = 'Criando sala…';
  try { await net.host(code.toUpperCase()); lobby = newLobby(); $('#menuErr').textContent = ''; enterLobby(code.toUpperCase()); }
  catch (e) { toMenu(e.message); }
};
$('#bJoin').onclick = async () => {
  audioInit(); split = false; const code = $('#code').value.trim().toUpperCase();
  if (code.length !== 4) { $('#menuErr').textContent = 'Digite o código de 4 letras.'; return; }
  $('#menuErr').textContent = 'Conectando…';
  try {
    await net.join(code); lobby = { players: [], track: 0, laps: 3, cc: 1, bots: 8, racing: false };
    net.send({ t: 'join', p: localPlayers()[0] }); $('#menuErr').textContent = ''; enterLobby(code);
  } catch (e) { toMenu(e.message); }
};
$('#bLeave').onclick = () => toMenu();
$('#bQuit').onclick = () => toMenu();
$('#bAgain').onclick = () => { if (net.isHost) { lobby.racing = false; if (net.online) net.send({ t: 'lobby', lobby, back: 1 }); race = null; enterLobby(net.online ? $('#roomCode').textContent : null); } };
$('#bStart').onclick = () => {
  const roster = lobby.players.map((p) => ({ ...p }));
  const used = new Set(roster.map((p) => p.color)); let bi = 0;
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  while (roster.length < lobby.bots) { const col = COLORS.find((c) => !used.has(c)) || COLORS[bi % 8]; used.add(col); roster.push({ id: 'bot' + bi, name: names[bi], color: col, bot: true }); bi++; }
  roster.sort(() => Math.random() - 0.5);
  const msg = { t: 'start', track: lobby.track, laps: lobby.laps, cc: lobby.cc, roster };
  lobby.racing = true; net.send(msg); startRace(msg);
};

net.onLeave = (c) => {
  if (!lobby) return;
  lobby.players = lobby.players.filter((p) => p.id !== c.pid);
  if (mode === 'lobby') pushLobby(); else net.send({ t: 'lobby', lobby });
  if (race) { removeKart(c.pid); net.send({ t: 'left', id: c.pid }); }
};
net.onDown = () => toMenu('O anfitrião saiu da sala.');
net.onMsg = (m, c) => {
  switch (m.t) {
    case 'join':
      c.pid = m.p.id; m.p.name = String(m.p.name || 'Piloto').slice(0, 12);
      if (lobby.players.length < 8 && !lobby.players.find((p) => p.id === m.p.id)) lobby.players.push(m.p);
      renderLobby(); net.send({ t: 'lobby', lobby }); break;
    case 'lobby':
      lobby = m.lobby; if (m.back && mode === 'race') { race = null; enterLobby($('#roomCode').textContent); } else if (mode === 'lobby') renderLobby(); break;
    case 'start': startRace(m); break;
    case 'left': if (race) removeKart(m.id); break;
    case 'st': if (race) for (const a of m.a) applyState(a); break;
    case 'ev': if (race) onEvent(m, false); break;
  }
};

/* ───────────── corrida ───────────── */
function owned(k) { return k.local || (k.bot && net.isHost); }

function startRace(msg) {
  const tr = buildTrack(TRACKS[msg.track]); buildScene(tr);
  race = { tr, karts: [], byId: new Map(), ents: new Map(), boxes: [], clock: 4, time: 0, laps: msg.laps, cc: msg.cc, entN: 0, sendT: 0, shown: false, order: [] };
  const localIds = localPlayers().map((p) => p.id);
  msg.roster.forEach((p, n) => {
    const li = localIds.indexOf(p.id);
    const row = Math.floor(n / 2), s = tr.N - 4 - row * 3.2 - (n % 2) * 1.2, d = n % 2 ? -5 : 5;
    const pt = trackPoint(tr, s, d); const t = tr.T[pt.i];
    const k = {
      id: p.id, name: p.name, color: p.color, bot: !!p.bot, local: li >= 0, li,
      x: pt.x, z: pt.z, h: Math.atan2(t.x, t.z), speed: 0, s, d, lap: 0, prog: s,
      drift: 0, charge: 0, driftLock: false, hop: 0, boost: 0, spin: 0, spinA: 0, shield: 0, emp: 0,
      item: null, count: 0, roul: 0, finished: false, ftime: 0, rank: n + 1, off: false,
      skill: p.bot ? rnd(0.9, 1.0) : 1, lane: rnd(-6, 6), useT: 0, laneT: 0, steerV: 0, yawV: 0,
      tx: pt.x, tz: pt.z, th: 0, accelAt: -1, prevUse: false, auto: !!QS.get('auto'), camH: Math.atan2(t.x, t.z), wrong: 0,
    };
    k.mesh = makeKartMesh(p.color, p.name, li < 0); scene.add(k.mesh.g);
    race.karts.push(k); race.byId.set(k.id, k);
  });
  // caixas de itens
  let bid = 0;
  for (const f of [0.1, 0.28, 0.46, 0.64, 0.82]) for (const d of [-7.5, -2.5, 2.5, 7.5]) {
    const pt = trackPoint(tr, Math.floor(f * tr.N), d);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), new THREE.MeshBasicMaterial({ map: BOXTEX, transparent: true, opacity: 0.9 }));
    mesh.position.set(pt.x, 1.9, pt.z); scene.add(mesh);
    race.boxes.push({ id: bid++, x: pt.x, z: pt.z, off: 0, mesh });
  }
  race.locals = race.karts.filter((k) => k.local).sort((a, b) => a.li - b.li);
  race.cams = race.locals.map(() => new THREE.PerspectiveCamera(70, 1, 0.5, 1500));
  buildHuds(); drawMiniBase();
  mode = 'race'; show('none'); $('#results').classList.remove('on'); hudVisible(true); onResize();
}
const BOXTEX = boxTex();

function removeKart(id) {
  const k = race.byId.get(id); if (!k) return;
  scene.remove(k.mesh.g); race.byId.delete(id); race.karts.splice(race.karts.indexOf(k), 1);
}

/* ── entrada ── */
const keys = {};
addEventListener('keydown', (e) => { if (mode === 'race' && /^(Arrow|Space)/.test(e.code)) e.preventDefault(); keys[e.code] = true; audioInit(); if (e.code === 'KeyR' && race) for (const k of race.locals) respawn(k); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const touch = { on: 'ontouchstart' in window, L: 0, R: 0, D: 0, I: 0, B: 0 };
for (const [id, key] of [['tL', 'L'], ['tR', 'R'], ['tD', 'D'], ['tI', 'I'], ['tB', 'B']]) {
  const el = $('#' + id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[key] = 1; touch.used = true; audioInit(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { touch[key] = 0; });
}
function readInput(li) {
  const solo = race.locals.length === 1; const k = keys;
  let l = false, r = false, u = false, d = false, dr = false, it = false;
  if (solo || li === 0) { l = k.KeyA; r = k.KeyD; u = k.KeyW; d = k.KeyS; dr = k.ShiftLeft || (solo && k.Space); it = k.KeyE || k.KeyQ; }
  if (solo || li === 1) { l = l || k.ArrowLeft; r = r || k.ArrowRight; u = u || k.ArrowUp; d = d || k.ArrowDown; dr = dr || k.ShiftRight || (!solo && k.Slash); it = it || k.Enter || k.NumpadEnter; }
  let steer = (l ? 1 : 0) - (r ? 1 : 0);
  const gp = navigator.getGamepads ? navigator.getGamepads()[li] : null;
  if (gp) {
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    if (Math.abs(gp.axes[0]) > 0.15) steer = -gp.axes[0];
    if (b(14)) steer = 1; if (b(15)) steer = -1;
    u = u || b(0) || b(7); d = d || b(1) || b(6); dr = dr || b(5) || b(4); it = it || b(2) || b(3);
  }
  if (li === 0 && touch.used) { steer += touch.L - touch.R; u = u || !touch.B; d = d || !!touch.B; dr = dr || !!touch.D; it = it || !!touch.I; }
  return { steer: clamp(steer, -1, 1), accel: !!u, brake: !!d, drift: !!dr, use: !!it };
}
function botInput(k) {
  const tr = race.tr;
  k.laneT -= STEP; if (k.laneT <= 0) { k.laneT = rnd(2, 6); k.lane = rnd(-7, 7); }
  const pt = trackPoint(tr, k.s + 5 + Math.abs(k.speed) * 0.11, k.lane);
  const diff = wrap(Math.atan2(pt.x - k.x, pt.z - k.z) - k.h);
  let use = false;
  if (k.item && k.roul <= 0) { k.useT -= STEP; if (k.useT <= 0) { use = !k.prevUse; k.useT = rnd(0.6, 4); } }
  return { steer: clamp(diff * 2.4, -1, 1), accel: true, brake: Math.abs(diff) > 1.1 && k.speed > 30, drift: false, use };
}
function respawn(k) {
  if (!race || race.clock > 0 || k.finished) return;
  const pt = trackPoint(race.tr, Math.round(k.s), 0); const t = race.tr.T[pt.i];
  k.x = pt.x; k.z = pt.z; k.h = Math.atan2(t.x, t.z); k.speed = 0; k.drift = 0; k.charge = 0;
}

/* ── física do kart ── */
const LEVELS = [0.8, 1.8, 3.0];
const chargeLevel = (c) => (c >= LEVELS[2] ? 3 : c >= LEVELS[1] ? 2 : c >= LEVELS[0] ? 1 : 0);
function spinOut(k, dur = 1.3) { if (k.shield > 0 || k.finished && !owned(k)) return; k.spin = dur; k.drift = 0; k.charge = 0; k.boost = 0; k.driftLock = true; if (k.local) sfx(220, 0.5, 'sawtooth', 0.1, -160); }

function updateKart(k, inp, dt) {
  const tr = race.tr, base = 60 * race.cc * k.skill;
  for (const f of ['boost', 'spin', 'shield', 'emp', 'hop']) k[f] = Math.max(0, k[f] - dt);
  k.off = Math.abs(k.d) > tr.hw + 0.6;
  let max = base;
  if (k.bot) { // elástico leve para manter o pelotão junto
    const lead = race.order.find((o) => !o.bot); if (lead) max *= clamp(1 + (lead.prog - k.prog) * tr.seglen / 3000, 0.93, 1.08);
  }
  if (k.shield > 0) max *= 1.12;
  if (k.boost > 0) max *= 1.32; else if (k.off && k.shield <= 0) max *= 0.5;
  if (k.emp > 0) max *= 0.6;

  if (race.clock > 0) { // largada: segurar o acelerador na hora certa dá turbo
    if (inp.accel) { if (k.accelAt < 0) k.accelAt = race.clock; } else k.accelAt = -1;
    return;
  }
  if (k.accelAt !== -2) {
    if (k.accelAt > 0.15 && k.accelAt < 0.95) { k.boost = 1.1; if (k.local) sfx(500, 0.3, 'sawtooth', 0.08, 500); }
    else if (k.accelAt > 1.7 && !k.bot) k.spin = 0.9;
    k.accelAt = -2;
  }
  if (k.spin > 0) { k.speed *= Math.pow(0.1, dt); k.spinA += dt * 13; inp = { steer: 0, accel: false, brake: false, drift: false, use: false }; } else k.spinA = 0;

  if (inp.accel) { if (k.speed < max) k.speed = Math.min(max, k.speed + (k.boost > 0 ? 95 : 34 * (1.15 - k.speed / max)) * dt); }
  else if (inp.brake) k.speed = Math.max(-18, k.speed - (k.speed > 0 ? 75 : 30) * dt);
  else k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 16 * dt);
  if (k.speed > max) k.speed = Math.max(max, k.speed - 45 * dt);

  const sr = k.speed / base;
  if (!inp.drift) k.driftLock = false;
  if (k.drift) {
    if (!inp.drift || sr < 0.4 || k.spin > 0) {
      const lv = chargeLevel(k.charge);
      if (!inp.drift && lv) { k.boost = Math.max(k.boost, [0, 0.7, 1.3, 2.0][lv]); if (k.local) sfx(400 + lv * 120, 0.25, 'sawtooth', 0.08, 400); }
      else if (inp.drift) k.driftLock = true;
      k.drift = 0; k.charge = 0;
    } else {
      const into = inp.steer * k.drift;
      k.h += k.drift * (1.15 + 0.75 * into) * dt;
      const before = chargeLevel(k.charge); k.charge += dt * (1 + 0.5 * into);
      if (k.local && chargeLevel(k.charge) > before) sfx(700 + chargeLevel(k.charge) * 150, 0.08, 'square', 0.05);
    }
  } else {
    if (inp.drift && !k.driftLock && Math.abs(inp.steer) > 0.3 && sr > 0.55 && !k.off) { k.drift = Math.sign(inp.steer); k.charge = 0; k.hop = 0.22; k.driftLock = true; if (k.local) sfx(300, 0.08, 'triangle', 0.08, 200); }
    else k.h += inp.steer * 1.75 * (1 - 0.38 * clamp(sr, 0, 1)) * clamp(k.speed / 18, -1, 1) * dt;
  }
  k.steerV += (inp.steer - k.steerV) * Math.min(1, dt * 10);

  const mh = k.h - k.drift * 0.22;
  k.x += Math.sin(mh) * k.speed * dt; k.z += Math.cos(mh) * k.speed * dt;
  trackKart(k, true);

  // itens
  if (k.roul > 0) { k.roul -= dt; if (k.roul <= 0) giveItem(k); }
  if (inp.use && !k.prevUse && k.item && k.roul <= 0 && k.spin <= 0) useItem(k, inp);
  k.prevUse = inp.use;
}

function trackKart(k, walls) {
  const tr = race.tr; const loc = locate(tr, k.x, k.z, k.s);
  if (walls && Math.abs(loc.d) > tr.wall - 1.2) {
    const lim = (tr.wall - 1.2) * Math.sign(loc.d), l = tr.Lf[loc.i];
    k.x -= l.x * (loc.d - lim); k.z -= l.z * (loc.d - lim); loc.d = lim;
    const t = tr.T[loc.i]; const th = Math.atan2(t.x, t.z) + (k.wrong > 0.5 ? Math.PI : 0);
    k.h += wrap(th - k.h) * 0.07; if (Math.abs(k.speed) > 22) k.speed *= 0.975;
  }
  const N = tr.N;
  if (k.s > N * 0.75 && loc.s < N * 0.25) { k.lap++; if (owned(k)) onLap(k); }
  else if (k.s < N * 0.25 && loc.s > N * 0.75) k.lap--;
  k.s = loc.s; k.d = loc.d; k.prog = k.lap * N + k.s;
  const t = tr.T[loc.i]; const fwd = Math.sin(k.h) * t.x + Math.cos(k.h) * t.z;
  k.wrong = fwd < -0.35 && k.speed > 8 ? k.wrong + STEP : 0;
}
function onLap(k) {
  if (k.finished) return;
  if (k.lap > race.laps) { k.finished = true; k.ftime = race.time; if (k.local) { sfx(660, 0.15); setTimeout(() => sfx(880, 0.3), 150); hudMsg(k, 'CHEGADA!', 3); } }
  else if (k.local && k.lap > 1) { sfx(880, 0.12); hudMsg(k, k.lap === race.laps ? 'ÚLTIMA VOLTA!' : 'Volta ' + k.lap, 1.8); }
}

/* ── itens ── */
function giveItem(k) {
  const n = race.karts.length; const r = n > 1 ? (k.rank - 1) / (n - 1) : 0.5;
  const w = r < 0.25 ? { oil: 40, disc: 35, nitro: 20, missile: 5 }
    : r < 0.7 ? { nitro: 25, disc: 20, oil: 15, missile: 25, triple: 10, shield: 5 }
    : { triple: 30, missile: 20, shield: 25, emp: 12, nitro: 13 };
  let tot = 0; for (const v of Object.values(w)) tot += v; let x = Math.random() * tot;
  for (const [it, v] of Object.entries(w)) { x -= v; if (x <= 0) { k.item = it; break; } }
  k.count = k.item === 'triple' ? 3 : 1; if (k.local) sfx(990, 0.15, 'square', 0.06);
}
function useItem(k) {
  const it = k.item; const fx = Math.sin(k.h), fz = Math.cos(k.h);
  if (--k.count <= 0) k.item = null;
  if (it === 'nitro' || it === 'triple') { k.boost = Math.max(k.boost, 1.5); if (k.local) sfx(350, 0.4, 'sawtooth', 0.09, 600); return; }
  if (it === 'shield') { k.shield = 7; if (k.local) sfx(520, 0.5, 'triangle', 0.1, 400); return; }
  const id = k.id + '-' + race.entN++;
  let e;
  if (it === 'oil') e = { k: 'oil', id, o: k.id, x: k.x - fx * 4, z: k.z - fz * 4 };
  else if (it === 'disc') e = { k: 'disc', id, o: k.id, x: k.x + fx * 4, z: k.z + fz * 4, vx: fx * 105, vz: fz * 105, s: k.s };
  else if (it === 'missile') { const tg = race.order[race.order.indexOf(k) - 1]; e = { k: 'missile', id, o: k.id, tg: tg ? tg.id : null, s: k.s + 2, d: k.d, x: k.x, z: k.z }; }
  else if (it === 'emp') e = { k: 'emp', o: k.id };
  const m = { t: 'ev', ev: 'spawn', e }; net.send(m); onEvent(m, true);
}
function onEvent(m) {
  if (m.ev === 'spawn') {
    const e = { ...m.e, age: 0 };
    if (e.k === 'emp') {
      for (const k of race.karts) if (k.id !== e.o && owned(k) && k.shield <= 0 && !k.finished) { k.emp = 3.5; k.boost = 0; if (k.local) { hudMsg(k, '⚡', 1); sfx(120, 0.6, 'sawtooth', 0.12, 700); } }
      race.flash = 0.35; return;
    }
    let mesh;
    if (e.k === 'oil') { mesh = new THREE.Mesh(new THREE.CircleGeometry(2.3, 14), new THREE.MeshBasicMaterial({ color: 0x15151c })); mesh.rotation.x = -Math.PI / 2; mesh.position.set(e.x, 0.06, e.z); }
    else if (e.k === 'disc') { mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 14), new THREE.MeshBasicMaterial({ color: 0x33e0c0 })); }
    else { mesh = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.8, 8), new THREE.MeshBasicMaterial({ color: 0xff3355 })); mesh.geometry.rotateX(Math.PI / 2); }
    e.mesh = mesh; scene.add(mesh); race.ents.set(e.id, e);
  } else if (m.ev === 'kill') { killEnt(m.id); }
  else if (m.ev === 'box') { const b = race.boxes[m.id]; if (b) { b.off = 5; b.mesh.visible = false; } }
}
function killEnt(id) { const e = race.ents.get(id); if (e) { scene.remove(e.mesh); race.ents.delete(id); } }

function updateEnts(dt) {
  const tr = race.tr;
  for (const e of [...race.ents.values()]) {
    e.age += dt;
    if (e.k === 'disc') {
      e.x += e.vx * dt; e.z += e.vz * dt;
      const loc = locate(tr, e.x, e.z, e.s); e.s = loc.s;
      if (Math.abs(loc.d) > tr.wall - 1) {
        const l = tr.Lf[loc.i], vn = e.vx * l.x + e.vz * l.z;
        if (vn * loc.d > 0) { e.vx -= 2 * vn * l.x; e.vz -= 2 * vn * l.z; }
      }
      e.mesh.position.set(e.x, 0.9, e.z); e.mesh.rotation.y += dt * 12;
      if (e.age > 10) { killEnt(e.id); continue; }
    } else if (e.k === 'missile') {
      const tg = e.tg && race.byId.get(e.tg); const px = e.x, pz = e.z;
      if (tg && Math.hypot(tg.x - e.x, tg.z - e.z) < 40) {
        const dx = tg.x - e.x, dz = tg.z - e.z, l = Math.hypot(dx, dz) || 1; e.x += dx / l * 115 * dt; e.z += dz / l * 115 * dt; e.s = locate(tr, e.x, e.z, e.s).s;
      } else {
        e.s += 115 * dt / tr.seglen; e.d += clamp((tg ? tg.d : 0) - e.d, -20 * dt, 20 * dt);
        const p = trackPoint(tr, e.s, e.d); e.x = p.x; e.z = p.z;
      }
      e.mesh.position.set(e.x, 1.2, e.z); e.mesh.rotation.y = Math.atan2(e.x - px, e.z - pz);
      if (e.age > 12 || (tg && tg.finished)) { killEnt(e.id); continue; }
    } else if (e.age > 90) { killEnt(e.id); continue; }
    // quem decide o acerto é o dono do kart atingido
    for (const k of race.karts) {
      if (!owned(k) || (e.o === k.id && (e.k === 'missile' || e.age < 0.7))) continue;
      const r = e.k === 'oil' ? 2.6 : 3;
      if ((k.x - e.x) ** 2 + (k.z - e.z) ** 2 < r * r) {
        spinOut(k, e.k === 'missile' ? 1.6 : 1.3);
        net.send({ t: 'ev', ev: 'kill', id: e.id }); killEnt(e.id); break;
      }
    }
  }
  for (const b of race.boxes) {
    if (b.off > 0) { b.off -= dt; if (b.off <= 0) b.mesh.visible = true; continue; }
    b.mesh.rotation.y += dt * 1.5; b.mesh.rotation.x += dt * 0.9;
    for (const k of race.karts) {
      if (!owned(k) || (k.x - b.x) ** 2 + (k.z - b.z) ** 2 > 9) continue;
      b.off = 5; b.mesh.visible = false; net.send({ t: 'ev', ev: 'box', id: b.id });
      if (!k.item && k.roul <= 0 && !k.finished) { k.roul = 1.6; if (k.local) sfx(600, 0.1, 'square', 0.05, 300); }
      break;
    }
  }
}

/* ── estado em rede ── */
function packState(k) {
  return [k.id, +k.x.toFixed(2), +k.z.toFixed(2), +k.h.toFixed(3), +k.speed.toFixed(1), k.drift, chargeLevel(k.charge), k.boost > 0 ? 1 : 0,
    +k.spin.toFixed(2), k.shield > 0 ? 1 : 0, k.emp > 0 ? 1 : 0, k.lap, +k.s.toFixed(2), k.finished ? 1 : 0, +k.ftime.toFixed(3)];
}
function applyState(a) {
  const k = race.byId.get(a[0]); if (!k || owned(k)) return;
  k.tx = a[1]; k.tz = a[2]; k.h = a[3]; k.speed = a[4]; k.drift = a[5]; k.charge = a[6] ? LEVELS[a[6] - 1] : 0; k.boost = a[7] ? 0.2 : 0;
  if (a[8] > 0 && k.spin <= 0) k.spinA = 0; k.spin = a[8]; k.shield = a[9] ? 0.2 : 0; k.emp = a[10] ? 0.2 : 0;
  k.lap = a[11]; k.s = a[12]; k.finished = !!a[13]; k.ftime = a[14]; k.prog = k.lap * race.tr.N + k.s;
}
function updateRemote(k, dt) {
  const mh = k.h - k.drift * 0.22, vx = Math.sin(mh) * k.speed, vz = Math.cos(mh) * k.speed;
  k.tx += vx * dt; k.tz += vz * dt; k.x += vx * dt; k.z += vz * dt;
  const b = Math.min(1, dt * 10); k.x += (k.tx - k.x) * b; k.z += (k.tz - k.z) * b;
  if (k.spin > 0) { k.spin -= dt; k.spinA += dt * 13; } else k.spinA = 0;
}

/* ── passo da simulação ── */
function step(dt) {
  const r = race;
  if (r.clock > 0) {
    const before = Math.ceil(r.clock); r.clock -= dt;
    if (Math.ceil(r.clock) !== before) { if (r.clock <= 0) sfx(880, 0.5, 'square', 0.1); else if (r.clock <= 3) sfx(440, 0.18, 'square', 0.1); }
  } else r.time += dt;

  for (const k of r.karts) {
    if (!owned(k)) { updateRemote(k, dt); continue; }
    const inp = k.local && !k.finished && !k.auto ? readInput(k.li) : botInput(k);
    if (k.finished) inp.use = false;
    updateKart(k, inp, dt);
  }
  // colisões entre karts
  if (r.clock <= 0) for (const k of r.karts) {
    if (!owned(k)) continue;
    for (const o of r.karts) {
      if (o === k) continue;
      const dx = k.x - o.x, dz = k.z - o.z, d = Math.hypot(dx, dz);
      if (d < 2.9 && d > 0.001) {
        const push = (2.9 - d) * 0.5; k.x += dx / d * push; k.z += dz / d * push; k.speed *= 0.992;
        if (o.shield > 0 && k.shield <= 0 && k.spin <= 0) spinOut(k);
      }
    }
  }
  updateEnts(dt);
  r.order = [...r.karts].sort((a, b) => (a.finished && b.finished ? a.ftime - b.ftime : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog));
  r.order.forEach((k, i) => (k.rank = i + 1));
  if (r.flash > 0) r.flash -= dt;

  if (net.online) { r.sendT -= dt; if (r.sendT <= 0) { r.sendT = 0.05; net.send({ t: 'st', a: r.karts.filter(owned).map(packState) }); } }
  if (!r.shown && r.locals.every((k) => k.finished)) { r.shown = true; r.showAt = 2.2; }
  if (r.shown && r.showAt > 0) { r.showAt -= dt; if (r.showAt <= 0) $('#results').classList.add('on'); }
}

/* ───────────── HUD ───────────── */
function hudVisible(v) { for (const id of ['#huds', '#clock', '#mini']) $(id).style.display = v ? 'block' : 'none'; $('#touch').style.display = v && touch.on ? 'block' : 'none'; }
function buildHuds() {
  const root = $('#huds'); root.innerHTML = ''; huds.length = 0; root.classList.toggle('split', race.locals.length > 1);
  race.locals.forEach((k, i) => {
    const el = document.createElement('div'); el.className = 'hud';
    const n = race.locals.length; el.style.top = (i * 100 / n) + '%'; el.style.height = (100 / n) + '%';
    el.innerHTML = '<div class="item"></div><div class="lap"></div><div class="pos"></div><div class="spd"></div><div class="warn"></div><div class="msg"></div>';
    root.append(el);
    huds.push({ k, el, item: el.children[0], lap: el.children[1], pos: el.children[2], spd: el.children[3], warn: el.children[4], msg: el.children[5], msgT: 0, last: {} });
  });
}
function hudMsg(k, text, dur) { const h = huds.find((x) => x.k === k); if (h) { h.text = text; h.msgT = dur; } }
const setText = (h, key, v) => { if (h.last[key] !== v) { h.last[key] = v; h[key].innerHTML = v; } };
function updateHud(dt) {
  const r = race;
  for (const h of huds) {
    const k = h.k;
    setText(h, 'pos', k.rank + '<small>º</small>');
    setText(h, 'lap', 'Volta ' + clamp(k.lap, 1, r.laps) + '/' + r.laps);
    setText(h, 'spd', Math.round(Math.abs(k.speed) * 2.2) + ' km/h');
    const ic = k.roul > 0 ? Object.values(ICON)[Math.floor(performance.now() / 80) % 7] : k.item ? ICON[k.item] + (k.count > 1 ? '<b>×' + k.count + '</b>' : '') : '';
    setText(h, 'item', ic);
    setText(h, 'warn', k.wrong > 0.8 ? 'CONTRAMÃO!' : '');
    let msg = '';
    if (r.clock > 0) msg = r.clock > 3 ? '' : String(Math.ceil(r.clock)); else if (r.time < 1) msg = 'VAI!';
    if (h.msgT > 0) { h.msgT -= dt; msg = h.text; }
    setText(h, 'msg', msg);
  }
  $('#clock').textContent = fmtTime(r.time);
  drawMini();
  if (r.shown) renderResults();
}
let miniBase = null, miniMap = null;
function drawMiniBase() {
  const tr = race.tr; let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of tr.P) { minX = Math.min(minX, -p.x); maxX = Math.max(maxX, -p.x); minZ = Math.min(minZ, -p.z); maxZ = Math.max(maxZ, -p.z); }
  const sc = 260 / Math.max(maxX - minX, maxZ - minZ);
  miniMap = (x, z) => [150 + (-x - (minX + maxX) / 2) * sc, 150 + (-z - (minZ + maxZ) / 2) * sc];
  miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = 300; const g = miniBase.getContext('2d');
  g.lineJoin = 'round'; g.beginPath(); tr.P.forEach((p, i) => { const [x, y] = miniMap(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 16; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 9; g.stroke();
}
function drawMini() {
  const g = $('#mini').getContext('2d'); g.clearRect(0, 0, 300, 300); g.drawImage(miniBase, 0, 0);
  for (const k of [...race.karts].sort((a, b) => a.local - b.local)) {
    const [x, y] = miniMap(k.x, k.z); g.beginPath(); g.arc(x, y, k.local ? 9 : 6, 0, 7); g.fillStyle = k.color; g.fill(); g.lineWidth = 2.5; g.strokeStyle = k.local ? '#fff' : '#000'; g.stroke();
  }
}
let resKey = '';
function renderResults() {
  const key = race.order.map((k) => k.id + (k.finished ? 'f' : '')).join();
  if (key === resKey) return; resKey = key;
  const ol = $('#resList'); ol.innerHTML = '';
  race.order.forEach((k, i) => {
    const li = document.createElement('li'); if (k.local) li.className = 'me';
    const dot = document.createElement('i'); dot.style.background = k.color;
    const t = document.createElement('span'); t.className = 't'; t.textContent = k.finished ? fmtTime(k.ftime) : 'correndo…';
    li.append((i + 1) + 'º', dot, document.createTextNode(k.name), t); ol.append(li);
  });
  $('#bAgain').style.display = net.isHost ? '' : 'none';
}

/* ───────────── render ───────────── */
const SPARK = [0, 0x40b0ff, 0xff9a20, 0xd050ff];
function syncMeshes(dt) {
  for (const k of race.karts) {
    const m = k.mesh;
    m.g.position.set(k.x, k.hop > 0 ? Math.sin(k.hop / 0.22 * Math.PI) * 0.8 : 0, k.z);
    k.yawV += (k.drift * 0.38 - k.yawV) * Math.min(1, dt * 12);
    m.g.rotation.y = k.h; m.body.rotation.y = k.yawV + k.spinA;
    m.body.rotation.z = -k.steerV * 0.06 * clamp(k.speed / 40, 0, 1);
    m.wheels[0].rotation.y = m.wheels[1].rotation.y = k.steerV * 0.4;
    m.flame.visible = k.boost > 0; if (m.flame.visible) m.flame.scale.setScalar(0.8 + Math.random() * 0.5);
    const lv = k.drift ? chargeLevel(k.charge) : 0;
    for (const s of m.sparks) { s.visible = lv > 0; s.scale.setScalar(0.7 + Math.random() * 0.8); }
    if (lv) m.sparkM.color.setHex(SPARK[lv]);
    m.shield.visible = k.shield > 0; if (m.shield.visible) m.shield.material.color.setHSL((performance.now() / 600) % 1, 0.9, 0.65);
    m.zap.visible = k.emp > 0; m.body.scale.setScalar(k.emp > 0 ? 0.75 : 1);
  }
}
function render(dt) {
  if (!race) { renderer.setScissorTest(false); renderer.setClearColor(0x10131c); renderer.clear(); return; }
  syncMeshes(dt);
  const W = innerWidth, H = innerHeight, n = race.locals.length;
  renderer.setScissorTest(true);
  race.locals.forEach((k, i) => {
    const cam = race.cams[i], vh = H / n, y = H - (i + 1) * vh;
    k.camH += wrap(k.h + k.drift * 0.2 - k.camH) * Math.min(1, dt * 6);
    const fx = Math.sin(k.camH), fz = Math.cos(k.camH);
    cam.position.set(k.x - fx * 10.5, 5, k.z - fz * 10.5); cam.lookAt(k.x + fx * 5, 1.6, k.z + fz * 5);
    const fov = (n > 1 ? 58 : 68) + (k.boost > 0 ? 9 : 0) + clamp(k.speed, 0, 80) * 0.08;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 5); cam.aspect = W / vh; cam.updateProjectionMatrix();
    renderer.setViewport(0, y, W, vh); renderer.setScissor(0, y, W, vh); renderer.render(scene, cam);
  });
  if (engGain && actx) {
    const k = race.locals[0]; const on = race.clock <= 3.2 && !$('#results').classList.contains('on');
    engGain.gain.setTargetAtTime(on ? 0.035 : 0, actx.currentTime, 0.1);
    engOsc.frequency.setTargetAtTime(55 + Math.abs(k.speed) * 2.4 + (k.boost > 0 ? 40 : 0), actx.currentTime, 0.05);
  }
}
function onResize() { renderer.setSize(innerWidth, innerHeight, false); }
addEventListener('resize', onResize); onResize();

let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (race && mode === 'race') { acc += dt; let n = 0; while (acc >= STEP && n++ < 8) { step(STEP); acc -= STEP; } if (race) updateHud(dt); }
  else if (engGain && actx) engGain.gain.setTargetAtTime(0, actx.currentTime, 0.1);
  render(dt);
}
requestAnimationFrame(frame);

window.__ct = { get race() { return race; }, get lobby() { return lobby; }, get mode() { return mode; }, net, TRACKS, buildTrack };
