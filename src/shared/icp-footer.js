// 备案号页脚：从 data/site.json 读取 icp 字段，填充 #icp-link（无备案号时保持隐藏）
export async function renderIcpFooter() {
  try {
    const site = await (await fetch('./data/site.json')).json();
    const el = document.getElementById('icp-link');
    if (el && site.icp) {
      el.textContent = site.icp;
      el.style.display = '';
    }
  } catch { /* 数据不可用时保持隐藏 */ }
}
