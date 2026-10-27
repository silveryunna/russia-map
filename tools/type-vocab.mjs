// type 受控词表 —— 单一来源（2026-10-28 起）
//
// 消费方：
//   • tools/check-data.mjs      强制校验 data/points.json 的 type 必须在此表内
//   • tools/migrate-types.mjs   把自由文本 type 归类到此表
//
// 改词表只改本文件一处。改完必做：
//   1) node tools/migrate-types.mjs --dry   （确认无点位落入「其他」，归类结果全在表内）
//   2) node tools/check-data.mjs ./data     （确认存量数据仍全绿）
//   3) 若新增/删除类别，同步评估 check-data.mjs 里的 TRANS（交通类禁评分）与 DIMS（评分维度路由）

export const TYPE_VOCAB = [
  // 交通（与 check-data.mjs 的 TRANS 集合保持一致）
  '地铁站', '火车站', '机场', '交通枢纽', '水上巴士',
  // 文化
  '博物馆', '宗教场所', '宫殿庄园', '建筑', '纪念地', '图书馆书店',
  // 城市考古主题
  '科技遗迹', '工业遗产', '城市记忆',
  // 自然休闲
  '公园自然', '海滩', '街区', '观景',
  // 生活
  '演出', '餐饮', '购物', '酒店住宿', '地标', '其他',
];
