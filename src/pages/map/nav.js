// 导航跳转：多平台外链 + 一键导航（按平台选最省事的方式）
import { wgs2gcj } from './coords.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// 国内城市：提供高德链接（坐标需转 GCJ-02）
const CN_CITIES = ['哈尔滨', '伊宁', '三亚'];

// 坐标顺序坑（改动前先看清）：
//   Google query/destination：纬度,经度
//   Yandex pt/ll：经度,纬度（需要翻转！）
//   Yandex rtext：纬度,经度（~ 表示从当前位置出发）
export function navLinks(p) {
  const q = `${p.lat},${p.lon}`;
  const n = {
    yandexPin: `https://yandex.ru/maps/?pt=${p.lon},${p.lat}&ll=${p.lon},${p.lat}&z=17&l=map`,
    yandexNav: `https://yandex.ru/maps/?rtext=~${p.lat},${p.lon}&rtt=mt`,
    googlePin: `https://www.google.com/maps/search/?api=1&query=${q}`,
    googleNav: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=transit&dir_action=navigate`,
  };
  if (CN_CITIES.includes(p.city)) {
    const [glat, glon] = wgs2gcj(p.lat, p.lon);
    const name = encodeURIComponent(p.name);
    n.amapPin = `https://uri.amap.com/marker?position=${glon},${glat}&name=${name}&src=travelmap`;
    n.amapNav = `https://uri.amap.com/navigation?to=${glon},${glat},${name}&mode=transit&policy=1&src=travelmap&callnative=1`;
  }
  return n;
}

// 一键导航：境内→高德唤起 App；iOS→Apple 地图；安卓→geo: 深链；其他→Google
export function navHref(p, nav) {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (CN_CITIES.includes(p.city)) return { href: nav.amapNav || nav.amapPin, label: '跳转高德' };
  if (iOS) return { href: `https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=r`, label: '跳转Apple地图' };
  if (android) return { href: `geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}(${encodeURIComponent(p.name)})`, label: '跳转本机导航' };
  return { href: nav.googleNav || nav.googlePin, label: '跳转Google', blank: true };
}

// 弹窗里"复制英文名"按钮（内联 onclick 用，挂全局）
window.__copyEn__ = function (b) {
  const t = b.getAttribute('data-en');
  const done = () => {
    const o = b.textContent;
    b.textContent = '已复制';
    setTimeout(() => { b.textContent = o === '已复制' ? '复制' : o; }, 1200);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(t).then(done, done);
  } else {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
    done();
  }
};
