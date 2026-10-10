// 中国边界统一构建脚本 v2 —— 全部版图数据出自 frykit（天地图官方），单一数据源
// 边界范围：frykit 国界（陆地+全部岛屿） + 渤海/黄海/东海海域（至日韩朝海岸裁切） + 南海十段线海域
// 前置：pip install frykit[data] shapely，先运行：python tools/export_frykit.py
// 然后：node tools/build-boundary.cjs
const fs = require('fs'), zlib = require('zlib'), path = require('path'), os = require('os');
const TMP = os.tmpdir();

// —— 依赖 @turf/difference（首次：cd tools && npm init -y && npm i @turf/difference @turf/helpers） ——
const NM = fs.existsSync(path.join(__dirname, 'node_modules'))
  ? path.join(__dirname, 'node_modules')
  : (() => { throw new Error('先运行: cd tools && npm init -y && npm i @turf/difference @turf/helpers'); })();
const { difference } = require(path.join(NM, '@turf/difference'));
const { polygon, multiPolygon, featureCollection } = require(path.join(NM, '@turf/helpers'));

const BOUNDARY = path.join(__dirname, '..', 'data', 'china-boundary.json');
// 裁切参照：邻国陆地（Natural Earth，仅构建期使用）——海域边界沿其真实海岸
const NEIGHBORS = ['VNM', 'PHL', 'MYS', 'BRN', 'IDN', 'KHM', 'THA', 'KOR', 'PRK', 'JPN'];

// —— 工具 ——
function segInt(a, b, c, d) {
  const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  return ((cr(c, d, a) > 0) !== (cr(c, d, b) > 0)) && ((cr(a, b, c) > 0) !== (cr(a, b, d) > 0));
}
function selfX(ring) {
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) for (let k = i + 2; k < n - 1; k++) {
    if (i === 0 && k === n - 2) continue;
    if (segInt(ring[i], ring[i + 1], ring[k], ring[k + 1])) return [i, k];
  }
  return null;
}
function cleanRing(ring) {
  let pts = ring.filter((p, i) => i === 0 || Math.abs(p[0] - ring[i - 1][0]) + Math.abs(p[1] - ring[i - 1][1]) > 1e-7);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
      const v1 = [bx - ax, by - ay], v2 = [cx - bx, cy - by];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      if (l1 < 1e-9 || l2 < 1e-9 || (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2) < -0.8) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts;
}
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const t = ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / len2;
      const d = Math.hypot(pts[i][0] - (x1 + t * dx), pts[i][1] - (y1 + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = p => { const r = p[0]; let a = 0; for (let k = 0; k < r.length - 1; k++)a += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1]; return Math.abs(a / 2) };
const inRing = (x, y, r) => { let ins = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, yi] = r[i], [xj, yj] = r[k]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins };
function renderPNG(rings, file, lon0, lat0, lon1, lat1, W = 936) {
  const s = (lon1 - lon0) / W, H = Math.round((lat1 - lat0) / s);
  const px = new Uint8Array(W * H * 3).fill(238);
  const rows = Array.from({ length: H }, () => []);
  for (const r of rings) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
    const [x1, y1] = r[k], [x2, y2] = r[i]; if (y1 === y2) continue;
    const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
    const r0 = Math.max(0, Math.floor((lat1 - yMax) / s)), r1 = Math.min(H - 1, Math.floor((lat1 - yMin) / s));
    for (let row = r0; row <= r1; row++) { const y = lat1 - (row + 0.5) * s; if (y < yMin || y >= yMax) continue; rows[row].push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); }
  }
  for (let row = 0; row < H; row++) {
    const xs = rows[row].sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) {
      const q0 = Math.max(0, Math.floor((xs[j] - lon0) / s)), q1 = Math.min(W - 1, Math.floor((xs[j + 1] - lon0) / s));
      for (let q = q0; q <= q1; q++) { const o = (row * W + q) * 3; px[o] = 160; px[o + 1] = 200; px[o + 2] = 245; }
    }
  }
  const ct = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++)c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; ct[n] = c >>> 0 }
  const crc32 = buf => { let crc = 0xFFFFFFFF; for (const b of buf)crc = ct[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0 };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) { raw[y * (1 + W * 3)] = 0; Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1); }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log('渲染验证图 →', file);
}
function clipSea(seaRing, landRingsAll, minArea) {
  const diff = difference(featureCollection([polygon([seaRing]), multiPolygon(landRingsAll.map(r => [r]))]));
  if (!diff) return [];
  let polys = diff.geometry.type === 'Polygon' ? [diff.geometry.coordinates] : diff.geometry.coordinates;
  return polys.filter(p => area(p) > minArea).map(p => [cleanRing(p[0]), ...p.slice(1).filter(h => h.length >= 6).map(cleanRing)]);
}

// —— 1. 载入 frykit 数据（单一版图数据源） ——
const fry = JSON.parse(fs.readFileSync(path.join(TMP, 'frykit_tdt.json'), 'utf8'));
const dash = JSON.parse(fs.readFileSync(path.join(TMP, 'frykit_dash.json'), 'utf8'));
const land = fry.coordinates;
const landRings = land.map(p => p[0]);
console.log('frykit 天地图国界:', land.length, '多边形');

// —— 2. 主环 RDP 精简（自交校验） ——
const processed = land.map(p => {
  const r = p[0];
  if (r.length < 2000) return p;
  for (const tol of [0.0015, 0.001, 0.0007]) {
    const s = rdp(r, tol);
    if (!selfX([...s, s[0]])) return [[...s, [...s[0]]], ...p.slice(1)];
  }
  console.error('主环无法安全简化，保留原样');
  return p;
});

// —— 3. 邻国裁切参照环（海域裁切与文件使用同一版主环，杜绝海岸线细缝） ——
const nbr = [];
for (const c of NEIGHBORS) {
  const j = JSON.parse(fs.readFileSync(path.join(TMP, `ne_${c}.json`), 'utf8'));
  for (const f of j.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) nbr.push(p[0]);
  }
}
const clipAll = [...processed.map(p => p[0]), ...nbr];

// —— 4. 十段线 → V 形链（frykit 九段线 + 台湾以东第十段） ——
const withC = dash.map(d => {
  let b = { minx: 999, maxx: -999, miny: 999, maxy: -999 };
  d.forEach(([x, y]) => { b.minx = Math.min(b.minx, x); b.maxx = Math.max(b.maxx, x); b.miny = Math.min(b.miny, y); b.maxy = Math.max(b.maxy, y) });
  return { d, b, cx: (b.minx + b.maxx) / 2, cy: (b.miny + b.maxy) / 2 };
});
const east = withC.filter(x => x.cx >= 114 || x.b.maxy < 5).sort((a, b) => b.cy - a.cy);
const west = withC.filter(x => !(x.cx >= 114 || x.b.maxy < 5)).sort((a, b) => a.cy - b.cy);
const orient = (d, headHigh) => (headHigh ? (d[0][1] >= d[d.length - 1][1] ? d : [...d].reverse()) : (d[0][1] <= d[d.length - 1][1] ? d : [...d].reverse()));
const chain = [
  [[122.83, 24.6], [122.72, 23.6]], // 第十段（台湾以东，自然资源部标准地图位置）
  ...east.map(x => orient(x.d, true)),
  [west[0].d[0][1] <= west[0].d[west[0].d.length - 1][1] ? west[0].d[0] : west[0].d[west[0].d.length - 1]],
  ...west.map(x => orient(x.d, false)),
].flat();
console.log('十段线链:', chain.length, '点 首', chain[0].map(v => +v.toFixed(1)), '尾', chain[chain.length - 1].map(v => +v.toFixed(1)));

// —— 5. 南海海域环（闭合线走陆地内部） ——
const scsRing = cleanRing([...chain,
  [106.6, 6.9], [105.3, 7.6], [104.9, 8.0],
  [104.6, 9.0], [105.2, 9.5], [106.6, 10.0], [107.6, 11.5], [107.8, 13.5], [107.4, 15.5], [107.0, 17.5], [106.6, 19.5], [106.3, 21.0],
  [107.5, 22.0], [109.5, 22.2], [111.5, 22.8], [113.5, 23.3], [115.5, 23.8], [117.0, 24.6], [118.5, 25.3],
  [120.0, 25.9], [121.4, 25.7],
  [121.9, 25.3], [121.6, 24.8], [121.2, 24.2], [120.9, 23.4], [120.8, 22.6], [120.85, 21.95],
  [121.3, 22.3], [121.8, 23.5], [122.2, 24.2],
  [...chain[0]]]);
const sx = selfX(scsRing);
if (sx) { console.error('南海环自交', sx); process.exit(1); }
const scs = clipSea(scsRing, clipAll, 20);
console.log('南海海域:', scs.length, '块');

// —— 6. 渤海+黄海+东海海域环（与南海共享台湾以东线段；日韩朝海岸裁切） ——
const ecsRing = cleanRing([
  [122.83, 24.6],                                // 与南海环共享起点
  [124.5, 25.8], [126.5, 27.5], [128.5, 29.8], [130.2, 31.5], // 东海大陆架外缘（中日边界方向）
  [131.2, 32.6], [132.2, 33.8],                  // 对马海峡
  [130.2, 34.6], [129.6, 36.2], [128.7, 38.2], [127.9, 40.0], [126.2, 41.6], // 朝鲜东岸外（日本海西岸）
  [124.4, 39.9],                                 // 鸭绿江口
  [122.5, 40.3], [120.0, 40.5], [118.0, 39.3], [117.3, 38.0], [117.6, 37.2], [119.0, 37.2], [120.5, 37.6], [121.5, 38.5], // 穿中国内陆环抱住渤海（裁切后不可见）
  [120.0, 35.0], [120.5, 32.5], [121.9, 30.7],   // 黄海/苏北
  [122.4, 27.5], [122.2, 24.2],                  // 浙闽外海 → 台湾以东（与南海环共享线段）
  [122.83, 24.6],
]);
const ex = selfX(ecsRing);
if (ex) { console.error('东海环自交', ex); process.exit(1); }
let ecs = clipSea(ecsRing, clipAll, 1);
// 去碎屑：外环上均匀取 7 点，多数落在邻国陆域内才剔除（防贴岸顶点误删）
ecs = ecs.filter(p => {
  const r = p[0], step = Math.max(1, Math.floor(r.length / 7));
  let hits = 0, total = 0;
  for (let i = 0; i < r.length; i += step) { total++; if (nbr.some(nr => inRing(r[i][0], r[i][1], nr))) hits++; }
  return hits <= total / 2;
});
console.log('渤海+黄海+东海海域:', ecs.length, '块');

// —— 7. 组装 + 渲染验证 + 断言 ——
const coords = [...processed, ...scs, ...ecs];
renderPNG(coords.flatMap(p => p), path.join(TMP, 'mask_check.png'), 70, 0, 142, 62);
const cover = (x, y) => coords.some(p => inRing(x, y, p[0]));
const checks = [
  ['钓鱼岛', 123.47, 25.74, 1], ['台湾', 121, 23.8, 1], ['海南', 109.7, 19.2, 1],
  ['渤海', 120.8, 39.0, 1], ['黄海', 122.5, 36.5, 1], ['东海', 125.5, 30.5, 1],
  ['南海中心', 113, 15, 1], ['永兴岛', 112.34, 16.83, 1], ['黄岩岛', 117.75, 15.25, 1],
  ['长江口', 122.4, 31.5, 1],
  ['日本海(灰)', 129.5, 39, 0], ['对马海峡东口(灰)', 132.5, 34.5, 0], ['菲律宾海(灰)', 126, 21, 0], ['泰国湾(灰)', 101.5, 8, 0],
];
let pass = true;
for (const [n, x, y, expect] of checks) {
  const got = cover(x, y) ? 1 : 0;
  if (got !== expect) { pass = false; console.error('✗', n, '期望', expect ? '内' : '外', '实际', got ? '内' : '外'); }
  else console.log('✓', n);
}
if (!pass) { console.error('断言未通过'); process.exit(1); }

// —— 8. 写入 ——
const out = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '中华人民共和国', source: 'tianditu(frykit)', level: 'country' }, geometry: { type: 'MultiPolygon', coordinates: coords } }] };
fs.writeFileSync(BOUNDARY, JSON.stringify(out));
console.log('完成:', coords.length, '多边形,', Math.round(fs.statSync(BOUNDARY).size / 1024) + 'KB → data/china-boundary.json');
