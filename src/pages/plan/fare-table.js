// 城市级打车费用估算表（仅用于规划比较，不是报价）
// 量级参考 2026 年公开均价，未逐城核价；换城市/换年份后需复核 reviewAfter。
const meta = { confidence: 'estimate', collectedAt: '2026-10-30', reviewAfter: '2027-04-30' };
const fare = (currency, base, perKm, minimum, roundTo, scoreUnit) => ({
  currency, base, perKm, minimum, roundTo, scoreUnit, ...meta,
});

export const TAXI_FARES = {
  '莫斯科': fare('RUB', 250, 30, 300, 10, 10),
  '莫斯科州/近郊': fare('RUB', 250, 30, 300, 10, 10),
  '圣彼得堡': fare('RUB', 250, 30, 300, 10, 10),
  '叶卡捷琳堡': fare('RUB', 200, 25, 250, 10, 10),
  '阿拉木图': fare('KZT', 700, 180, 800, 100, 60),
  '哈尔滨': fare('CNY', 10, 2.4, 10, 1, 1),
  '伊宁': fare('CNY', 8, 2, 8, 1, 1),
  '三亚': fare('CNY', 10, 2.5, 10, 1, 1),
};

export const CURRENCY_SYMBOLS = { RUB: '₽', KZT: '₸', CNY: '¥' };

export function taxiFareFor(city) {
  return TAXI_FARES[city] || null;
}

export function currencySymbol(code) {
  return CURRENCY_SYMBOLS[code] || code || '';
}
