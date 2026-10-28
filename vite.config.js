import { defineConfig } from 'vite';
import { resolve, normalize, sep, extname } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

// 多页应用（MPA）：src/ 下每个 HTML 一个入口，各自打包
// 构建产物输出到 ../dist；data/ api/ content/ photos/ 等静态资产由 tools/publish.mjs 组装
const ROOT = import.meta.dirname;
const STATIC_DIRS = ['data', 'content', 'photos'];
const ROOT_FILES = new Set(['manifest.json', 'favicon.png', 'icon-192.png', 'icon-512.png', 'robots.txt', 'sitemap.xml']);
const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 开发态：Vite 以 src/ 为根，页面里的 ./data/*.json 会落到 /data/*；
// 生产由 assemble 把仓库根的 data/content/photos 拷进站点，这里用中间件做同样的事。
// /api 默认返回可预期的 JSON 错误（页面会优雅降级）；设 DEV_API=http://127.0.0.1:8080 可代理真实 PHP。
function devRepoAssets() {
  return {
    name: 'dev-repo-assets',
    apply: 'serve',
    configureServer(server) {
      // 必须挂在 Vite 的 html fallback 之前：否则 /data/*.json 会先被改写成 index.html
      server.middlewares.use(async (req, res, next) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

        if (pathname.startsWith('/api/')) {
          if (process.env.DEV_API) return next(); // 交给 proxy 处理
          res.statusCode = pathname.endsWith('index.php') ? 503 : 404;
          res.setHeader('Content-Type', MIME['.json']);
          res.end(JSON.stringify({ error: '开发态未接入 PHP 后端，可使用规则引擎离线生成' }));
          return;
        }

        const rel = pathname.replace(/^\/+/, '');
        const top = rel.split('/')[0];
        if (!STATIC_DIRS.includes(top) && !ROOT_FILES.has(rel)) return next();

        const file = normalize(resolve(ROOT, rel));
        // 归一化后再确认确实落在允许的目录/文件内，防止 data/../ 越界读取仓库其他文件
        const inAllowedDir = STATIC_DIRS.some(d => file.startsWith(resolve(ROOT, d) + sep));
        const isRootFile = [...ROOT_FILES].some(f => file === resolve(ROOT, f));
        if (!inAllowedDir && !isRootFile) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        try {
          const s = await stat(file);
          if (!s.isFile()) throw new Error('not a file');
          res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          if (req.method === 'HEAD') { res.end(); return; }
          createReadStream(file).pipe(res);
        } catch {
          // 不要落到 Vite 的 html fallback：数据缺失时应是明确的 404，而不是 200 index.html
          res.statusCode = 404;
          res.setHeader('Content-Type', MIME['.json']);
          res.end(JSON.stringify({ error: `开发态静态文件不存在：${rel}` }));
        }
      });
    },
  };
}

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [devRepoAssets()],
  server: process.env.DEV_API
    ? { proxy: { '/api': { target: process.env.DEV_API, changeOrigin: true } } }
    : undefined,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'src/index.html'),
        map: resolve(ROOT, 'src/map.html'),
        list: resolve(ROOT, 'src/list.html'),
        notes: resolve(ROOT, 'src/notes.html'),
        album: resolve(ROOT, 'src/album.html'),
        admin: resolve(ROOT, 'src/admin.html'),
        account: resolve(ROOT, 'src/account.html'),
        friend: resolve(ROOT, 'src/friend.html'),
        plan: resolve(ROOT, 'src/plan.html'),
      },
    },
  },
});
