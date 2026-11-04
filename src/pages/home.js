import '../shared/base.css';
import './home.css';
import { renderIcpFooter } from '../shared/icp-footer.js';
import { loadRegions, visiblePoints, regionStats } from '../shared/regions.js';
import { openVisitRepository } from './visits/repository.js';

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
    const [all, regionIndex, checkins] = await Promise.all([
      fetch('./data/points.json').then(r => r.json()),
      loadRegions(),
      openVisitRepository().then(repo => repo.getCheckins()).catch(() => ({})),
    ]);
    // 关闭板块不计入统计；配置缺失时单板块降级，统计口径与原来一致
    const points = visiblePoints(all, regionIndex);
    const pending = points.filter(p => p.pending).length;
    const cities = new Set(points.map(p => p.city)).size;
    set('stat-list', `${points.length} 个点位 · ${cities} 个城市`);
    set('stat-map', pending ? `${points.length} 个点位（${pending} 个待核坐标）` : `${points.length} 个点位`);

    // 板块级统计（与列表页共用 regionStats，口径一致）
    const checked = new Set(Object.keys(checkins || {}));
    const stats = regionStats(points, regionIndex, id => checked.has(id));
    const grid = document.querySelector('.home-grid');
    if (stats.length > 1 && grid && !document.getElementById('home-regions')) {
      const bar = document.createElement('div');
      bar.id = 'home-regions';
      bar.className = 'home-regions';
      bar.innerHTML = `<span class="hr-title">板块</span>${stats.map(s => `
        <a class="hr-item" href="./list.html" title="在打卡清单中查看 ${s.name}">
          <b>${s.name}</b><span>${s.total} 个 · 已打卡 ${s.checked} · ${s.coverage}%</span>
        </a>`).join('')}`;
      grid.insertAdjacentElement('beforebegin', bar);
    }
  } catch { /* 数据不可用时保持默认文案 */ }
}

loadStats();
renderIcpFooter();
import { registerSW } from '../shared/sw-register.js';
registerSW();
