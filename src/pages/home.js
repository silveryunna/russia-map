import '../shared/base.css';
import './home.css';
import { renderIcpFooter } from '../shared/icp-footer.js';
import { loadRegions, visiblePoints } from '../shared/regions.js';

// 导航页：从数据文件读取统计信息，填充卡片副标题
async function loadStats() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
  };

  // 网站基本信息（管理后台可改）
  try {
    const site = await (await fetch('./data/site.json')).json();
    if (site.title) {
      document.title = site.title;
      const h1 = document.querySelector('.site-header h1');
      if (h1) h1.textContent = `${site.emoji || ''} ${site.title}`.trim();
    }
    if (site.subtitle) set('site-sub', site.subtitle);
  } catch { /* 数据不可用时保持页面默认文案 */ }

  try {
    const [all, regionIndex] = await Promise.all([
      fetch('./data/points.json').then(r => r.json()),
      loadRegions(),
    ]);
    // 关闭板块不计入统计；配置缺失时单板块降级，统计口径与原来一致
    const points = visiblePoints(all, regionIndex);
    const pending = points.filter(p => p.pending).length;
    const cities = new Set(points.map(p => p.city)).size;
    set('stat-list', `${points.length} 个点位 · ${cities} 个城市`);
    set('stat-map', pending ? `${points.length} 个点位（${pending} 个待核坐标）` : `${points.length} 个点位`);
  } catch { /* 数据不可用时保持默认文案 */ }
}

loadStats();
renderIcpFooter();
import { registerSW } from '../shared/sw-register.js';
registerSW();
