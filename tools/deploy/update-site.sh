#!/bin/bash
# 站点自动同步脚本（服务器端，/root/update-russia-map.sh）
#
# cron：*/2 * * * * /root/update-russia-map.sh >> /var/log/update-russia-map.log 2>&1
#
# 机制：git 是唯一事实来源，服务器始终 reset --hard 到 origin/main —— push 即部署（≤2 分钟）。
# 代价：无法热修线上文件（下一轮会被还原）。要直接改线上，先注释掉上面那行 cron，
#       改完验证后尽快 commit+push，再恢复 cron；否则改动会被静默抹掉。
#
# 安全网（2026-10-28 加）：cron 不等 CI，坏提交会先上线。故 reset 后对关键资源做 200 自检，
#   任一失败立即回滚到上一个 commit；并记住失败版本暂停重试，避免每 2 分钟反复回滚刷日志。
#
# 部署：scp 到服务器后务必确认行尾是 LF（CRLF 会报 bad interpreter）：
#   dos2unix /root/update-russia-map.sh   或   sed -i 's/\r$//' /root/update-russia-map.sh

set -uo pipefail

WEBROOT=/www/wwwroot/julyyunna.art
SITE=https://julyyunna.art
MARK=/tmp/update-site-failed-target

# 自检清单：两个 HTML 入口 + SW + 核心地图 JS + 点位数据
# 覆盖两类致命故障：白屏（JS 挂了）与数据损坏（points.json 解析不了）
CHECKS=(index.html map.html sw.js assets/map-D2GUsbT3.js data/points.json)

log() { echo "[$(date '+%F %T')] $*"; }

cd "$WEBROOT" || { log "❌ cd $WEBROOT 失败"; exit 1; }

PREV=$(git rev-parse HEAD 2>/dev/null)
[ -n "$PREV" ] || { log "❌ $WEBROOT 不是 git 工作区"; exit 1; }

git fetch origin main >/dev/null 2>&1 || { log "⚠️ fetch 失败（网络抖动？），保留当前版本"; exit 0; }
TARGET=$(git rev-parse origin/main 2>/dev/null)
[ -n "$TARGET" ] || { log "⚠️ 解析 origin/main 失败"; exit 0; }

[ "$PREV" = "$TARGET" ] && exit 0   # 无更新，静默退出（不刷日志）

# 该版本上一轮自检失败过 → 暂停同步等人工介入
if [ -f "$MARK" ] && [ "$(cat "$MARK" 2>/dev/null)" = "$TARGET" ]; then
  log "⏸ $TARGET 上一轮自检失败已回滚，暂停同步；人工修复后 rm -f $MARK 恢复"
  exit 1
fi

git reset --hard "$TARGET" >/dev/null 2>&1 || { log "❌ reset --hard $TARGET 失败"; exit 1; }
chown -R www:www "$WEBROOT" 2>/dev/null   # nginx 运行用户，reset 新建的文件默认是 root

check_url() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo 000
}

for u in "${CHECKS[@]}"; do
  code=$(check_url "$SITE/$u")
  [ "$code" = "200" ] || { sleep 2; code=$(check_url "$SITE/$u"); }   # 抖动重试一次
  if [ "$code" != "200" ]; then
    git reset --hard "$PREV" >/dev/null 2>&1
    chown -R www:www "$WEBROOT" 2>/dev/null
    echo "$TARGET" > "$MARK"
    log "❌ 自检失败：$u 返回 $code → 已回滚至 $PREV；该版本暂停同步（rm -f $MARK 恢复）"
    exit 1
  fi
done

rm -f "$MARK"
log "✅ 同步 ${PREV:0:7} → ${TARGET:0:7}（自检 ${#CHECKS[@]}/${#CHECKS[@]} 通过）"
