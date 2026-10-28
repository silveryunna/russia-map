import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// 多页应用（MPA）：src/ 下每个 HTML 一个入口，各自打包
// 构建产物输出到 ../dist；data/ api/ content/ photos/ 等静态资产由 tools/publish.mjs 组装
export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'src/index.html'),
        map: resolve(import.meta.dirname, 'src/map.html'),
        list: resolve(import.meta.dirname, 'src/list.html'),
        notes: resolve(import.meta.dirname, 'src/notes.html'),
        album: resolve(import.meta.dirname, 'src/album.html'),
        admin: resolve(import.meta.dirname, 'src/admin.html'),
        account: resolve(import.meta.dirname, 'src/account.html'),
        friend: resolve(import.meta.dirname, 'src/friend.html'),
        plan: resolve(import.meta.dirname, 'src/plan.html'),
      },
    },
  },
});
