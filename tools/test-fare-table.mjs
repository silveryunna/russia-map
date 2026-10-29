#!/usr/bin/env node
// 城市打车费率表质量门：覆盖站内城市、币种/数值合法、未知城市不臆造
import { readFileSync } from 'node:fs';
import {
  CURRENCY_SYMBOLS, TAXI_FARES, currencySymbol, taxiFareFor,
} from '../src/pages/plan/fare-table.js';

let bad = 0;
const fail = (m) => { console.error('❌ ' + m); bad++; };
const ok = (m) => console.log('✅ ' + m);
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const points = JSON.parse(readFileSync(new URL('../data/points.json', import.meta.url), 'utf8'));
const list = Array.isArray(points) ? points : points.points;
const cities = [...new Set(list.map((p) => p.city))].filter((c) => c && c !== '其他城市');
const missing = cities.filter((c) => !TAXI_FARES[c]);
assert(missing.length === 0, `站内城市都有费率：${cities.join('、')}`);

const entries = Object.entries(TAXI_FARES);
const badEntry = entries.find(([, f]) => !CURRENCY_SYMBOLS[f.currency]
  || !(f.base > 0) || !(f.perKm > 0) || !(f.minimum > 0) || !(f.roundTo > 0) || !(f.scoreUnit > 0)
  || !/^\d{4}-\d{2}-\d{2}$/.test(f.collectedAt || '') || !/^\d{4}-\d{2}-\d{2}$/.test(f.reviewAfter || '')
  || f.confidence !== 'estimate');
assert(!badEntry, '费率条目字段完整且为正数/带估算元数据');

assert(taxiFareFor('莫斯科').currency === 'RUB' && taxiFareFor('阿拉木图').currency === 'KZT' && taxiFareFor('三亚').currency === 'CNY',
  '俄罗斯/哈萨克斯坦/中国城市币种正确');
assert(taxiFareFor('火星') === null, '未配置城市返回 null，不臆造费率');
assert(currencySymbol('RUB') === '₽' && currencySymbol('KZT') === '₸' && currencySymbol('CNY') === '¥', '币种符号齐全');
assert(TAXI_FARES['莫斯科州/近郊'].perKm === TAXI_FARES['莫斯科'].perKm
  && TAXI_FARES['莫斯科州/近郊'].base === TAXI_FARES['莫斯科'].base, '莫斯科州沿用莫斯科费率');

if (bad) { console.error(`\n${bad} 项费率表测试失败`); process.exit(1); }
console.log('\n打车费率表质量门通过');
