#!/usr/bin/env node
// Markdown 安全渲染质量门（P2-8）：笔记正文的 innerHTML 汇必须只产生允许的标签/协议。
// 用法: node tools/test-markdown.mjs
import { renderMarkdown, safeMarkdownUrl } from '../src/shared/markdown.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

// 1) 原始 HTML 必须失活
{
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>');
  assert(!/<script/i.test(html), 'script 标签不会进入输出');
  assert(!/<img[^>]+onerror/i.test(html), '内联事件属性不会进入输出');
  assert(html.includes('&lt;script&gt;'), '原始 HTML 以文本形式显示');
}

// 2) 危险协议链接降级为文本
{
  const html = renderMarkdown('[点我](javascript:alert(1)) [数据](data:text/html;base64,PHNjcmlwdD4=)');
  assert(!/href="javascript:/i.test(html), 'javascript: 链接被拒绝');
  assert(!/href="data:/i.test(html), 'data:text/html 链接被拒绝');
  assert(html.includes('点我'), '被拒绝的链接保留文字');
}

// 3) 正常外链保留且带 rel
{
  const html = renderMarkdown('[官网](https://example.com/a?b=1&c=2)');
  assert(html.includes('href="https://example.com/a?b=1&amp;c=2"'), 'https 链接保留并转义 &');
  assert(html.includes('rel="noopener noreferrer"'), '外链带 noopener noreferrer');
}

// 4) 图片协议
{
  const httpsImg = renderMarkdown('![图](https://example.com/a.png)');
  assert(/<img [^>]*src="https:\/\/example\.com\/a\.png"/.test(httpsImg), 'https 图片保留');
  assert(httpsImg.includes('loading="lazy"'), '图片默认懒加载');
  const dataImg = renderMarkdown('![图](data:image/png;base64,iVBORw0KGgo=)');
  assert(dataImg.includes('src="data:image/png;base64,'), 'data:image/png 图片保留');
  const evilImg = renderMarkdown('![图](javascript:alert(1))');
  assert(!/src="javascript:/i.test(evilImg), 'javascript: 图片被拒绝');
}

// 5) 常规 Markdown 不受影响
{
  const html = renderMarkdown('# 标题\n\n**粗体** 和 `代码`\n\n- 一\n- 二');
  assert(html.includes('<h1>标题</h1>'), '标题正常渲染');
  assert(html.includes('<strong>粗体</strong>'), '粗体正常渲染');
  assert(html.includes('<code>代码</code>'), '行内代码正常渲染');
  assert((html.match(/<li>/g) || []).length === 2, '列表正常渲染');
}

// 6) safeMarkdownUrl 边界
{
  assert(safeMarkdownUrl('') === '', '空 URL → 空');
  assert(safeMarkdownUrl('//evil.com/x') === '', '协议相对地址 → 拒绝');
  assert(safeMarkdownUrl('java\nscript:alert(1)') === '', '控制字符混淆 → 拒绝');
  assert(safeMarkdownUrl('./photos/a.jpg') === './photos/a.jpg', '相对路径 → 保留');
  assert(safeMarkdownUrl('/notes/a.md') === '/notes/a.md', '站内绝对路径 → 保留');
  assert(safeMarkdownUrl('mailto:a@b.c') === 'mailto:a@b.c', 'mailto → 保留');
  assert(safeMarkdownUrl('data:image/png;base64,AAAA', { image: true }).startsWith('data:image/png'), '图片 data URL → 保留');
  assert(safeMarkdownUrl('data:image/png;base64,AAAA') === '', '非图片场景拒绝 data URL');
}

if (bad) { console.error(`\n${bad} 项 Markdown 安全检查失败`); process.exit(1); }
console.log('\nMarkdown 安全渲染质量门通过');
