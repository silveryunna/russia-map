// 通用文件下载：触发浏览器保存，并回收 ObjectURL。
// 计划页的 Markdown/备份导出与全站备份横幅共用。

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
