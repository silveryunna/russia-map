// TokenHub 预设模型表（刊例价快照 2026-10-27，元/百万 tokens；未计免费额度，仅供估算）
// 维护：thcli models get --id <id> 查最新价；模型上下线以 TokenHub 控制台为准
export const AI_MODELS = [
  { id: 'hy-mt2-lite', name: '混元 MT2 Lite', pin: 0.3, pout: 1.2, tier: '省' },
  { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', pin: 0.8, pout: 2.8, tier: '省' },
  { id: 'mimo-v2.6-flash', name: 'MiMo-V2.6-Flash', pin: 1, pout: 2, tier: '省' },
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash', pin: 1, pout: 4, tier: '省' },
  { id: 'minimax-m3.1-flash', name: 'MiniMax-M3.1-Flash', pin: 1, pout: 4, tier: '省' },
  { id: 'glm-5.3-flashx', name: 'GLM-5.3-FlashX', pin: 2, pout: 7, tier: '省' },
  { id: 'hy3', name: '混元 Hy3', pin: 1, pout: 4, tier: '均衡' },
  { id: 'minimax-m3', name: 'MiniMax-M3', pin: 2.1, pout: 8.4, tier: '均衡' },
  { id: 'glm-5.3', name: 'GLM-5.3', pin: 8, pout: 28, tier: '旗舰' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', pin: 12, pout: 24, tier: '旗舰' },
  { id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', pin: 13, pout: 68, tier: '旗舰' },
  { id: 'kimi-k3.1-pro-highspeed', name: 'Kimi K3.1 Pro 高速', pin: 26, pout: 136, tier: '旗舰' },
];
export const modelInfo = id => AI_MODELS.find(m => m.id === id);
// 刊例价估算（元）：pt/ct 为 token 数；未知模型返回 null
export const modelCost = (id, pt, ct) => {
  const m = modelInfo(id);
  return m ? (pt * m.pin + ct * m.pout) / 1e6 : null;
};
export const TIER_CLASS = { '省': 't-cheap', '均衡': 't-mid', '旗舰': 't-pro' };
