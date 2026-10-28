// 组装完整站点：vite 产物（dist/）+ 仓库内的静态资产 → site-out/
// 用法：node tools/assemble.mjs [输出目录，默认 site-out]
// P3 的 publish.mjs 与本地 smoke 都走这里，保证"本地看到的 == 线上部署的"
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] || 'site-out';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'nogit-' + Date.now().toString(36);
  }
}

if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('dist/ 不存在，先跑 npm run build');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) vite 产物（排除 hidden sourcemap，不上线）
cpSync(join(ROOT, 'dist'), OUT, { recursive: true, filter: s => !s.endsWith('.map') });

// 2) 整目录直拷
for (const d of ['data', 'content', 'photos', 'api']) {
  if (existsSync(join(ROOT, d))) cpSync(join(ROOT, d), join(OUT, d), { recursive: true });
}

// 3) 根目录散文件
for (const f of ['sw.js', 'manifest.json', 'favicon.png', 'icon-192.png', 'icon-512.png', 'robots.txt', 'sitemap.xml', 'tile-manifest.json']) {
  if (!existsSync(join(ROOT, f))) continue;
  if (f === 'sw.js') {
    // SW 版本号构建期注入：tn-v<git short sha>，保留 tn- 前缀（缓存清理逻辑按此前缀匹配）
    const sha = gitSha();
    const src = readFileSync(join(ROOT, f), 'utf8');
    const out = src.replace(/const VERSION = '[^']*'/, `const VERSION = 'tn-v${sha}'`);
    if (out === src) { console.error('sw.js VERSION 注入失败：未匹配 const VERSION 行'); process.exit(1); }
    writeFileSync(join(OUT, f), out);
    console.log(`sw.js VERSION → tn-v${sha}`);
  } else {
    copyFileSync(join(ROOT, f), join(OUT, f));
  }
}

// 4) 天地图 key（gitignore 豁免，本机/服务器持有）→ assets/
if (existsSync(join(ROOT, 'assets/tdt-key.js'))) {
  mkdirSync(join(OUT, 'assets'), { recursive: true });
  copyFileSync(join(ROOT, 'assets/tdt-key.js'), join(OUT, 'assets/tdt-key.js'));
}

const n = readdirSync(OUT).length;
console.log(`assembled → ${OUT}/（顶层 ${n} 项）`);
