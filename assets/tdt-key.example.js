// 【历史遗留 / 备用，正常情况下不需要】
//
// 2026-10-28 起天地图改用【服务端】Key：Key 写在服务器 nginx
//   /www/server/panel/vhost/nginx/julyyunna.art.conf → location ^~ /tdt/
// 由 nginx 回代上游时追加 tk=，浏览器端不再接触任何 Key。
// 前端瓦片 URL 形如：/tdt/DataServer?T=vec_w&x={x}&y={y}&l={z}（不带 tk）
//
// 仅当「必须回到浏览器端 Key」时才复用本模板（复制为 assets/tdt-key.js，已 gitignore）：
// 需同时在 map.html 恢复 <script src="./assets/tdt-key.js"></script>，
// 并在 map 产物的瓦片 URL 补回 &tk=${window.__TDT_KEY__}。请勿常态使用。
// 申请入口：https://console.tianditu.gov.cn/
window.__TDT_KEY__ = '';
