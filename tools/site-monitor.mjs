// 双节点站外探针（GitHub Actions runner 在境外，天然覆盖境外视角）
// 检查：首页/地图页/点位数据 200 且可解析、API 存活、TLS 证书剩余天数
// 输出 markdown 报告到 stdout；有任何 FAIL 时退出码 1
import tls from 'node:tls';

let fail = 0;
const lines = [];
const report = (name, pass, extra = '') => {
  lines.push(`${pass ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
  if (!pass) fail++;
};

async function fetchWithTimeout(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { signal: ctl.signal, redirect: 'follow' }); }
  finally { clearTimeout(t); }
}

async function probeHttp(name, url, expect) {
  try {
    const r = await fetchWithTimeout(url);
    report(name, await expect(r), `HTTP ${r.status}`);
  } catch (e) {
    report(name, false, e.name === 'AbortError' ? '超时15s' : e.message);
  }
}

const checkPoints = async (r) => {
  if (r.status !== 200) return false;
  const j = await r.json().catch(() => null);
  return Array.isArray(j) && j.length > 600;
};

await probeHttp('腾讯云 首页', 'https://julyyunna.art/', r => r.status === 200);
await probeHttp('腾讯云 地图页', 'https://julyyunna.art/map.html', r => r.status === 200);
await probeHttp('腾讯云 点位数据', 'https://julyyunna.art/data/points.json', checkPoints);
// API 无 ping 端点：未授权访问应返回 4xx（证明 PHP/SQLite 链路活着），5xx/超时才算故障
await probeHttp('腾讯云 API 存活', 'https://julyyunna.art/api/index.php?a=my', r => r.status >= 400 && r.status < 500);
await probeHttp('Pages 首页', 'https://silveryunna.github.io/russia-map/', r => r.status === 200);
await probeHttp('Pages 点位数据', 'https://silveryunna.github.io/russia-map/data/points.json', checkPoints);

// TLS 证书剩余天数（Let's Encrypt 90 天，<14 天视为告警——自动续签可能已失效）
await new Promise((resolve) => {
  const sock = tls.connect(443, 'julyyunna.art', { servername: 'julyyunna.art', timeout: 10000 }, () => {
    const validTo = sock.getPeerCertificate()?.valid_to;
    sock.end();
    const days = validTo ? Math.floor((new Date(validTo) - Date.now()) / 86400000) : -1;
    report('腾讯云 TLS 证书', days >= 14, `剩 ${days} 天（${validTo}）`);
    resolve();
  });
  sock.on('error', (e) => { report('腾讯云 TLS 证书', false, e.message); resolve(); });
  sock.on('timeout', () => { report('腾讯云 TLS 证书', false, '连接超时'); sock.destroy(); resolve(); });
});

console.log(`# 站点监控报告 ${new Date().toISOString()}\n`);
console.log('检查项 | 结果\n--- | ---');
for (const l of lines) console.log(l);
console.log(fail ? `\n**${fail} 项 FAIL**` : '\n全部通过');
process.exit(fail ? 1 : 0);
