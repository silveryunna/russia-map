// 页面分享：优先 navigator.share，不支持则复制链接到剪贴板（T0-5）
export async function sharePage({ title, text, url = location.href }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'aborted'; // 用户取消，不降级
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    window.prompt('复制链接分享：', url);
    return 'prompt';
  }
}

// 在 .page-nav 末尾挂载分享按钮；返回按钮元素（无导航栏时返回 null）
export function mountShareButton({ title, text }) {
  const nav = document.querySelector('.page-nav');
  if (!nav) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back';
  btn.style.marginLeft = 'auto';
  btn.textContent = '🔗 分享';
  btn.addEventListener('click', async () => {
    const r = await sharePage({ title, text });
    if (r === 'copied') {
      btn.textContent = '✅ 已复制链接';
      setTimeout(() => { btn.textContent = '🔗 分享'; }, 1500);
    }
  });
  nav.appendChild(btn);
  return btn;
}
