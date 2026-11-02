#!/bin/bash
# 站点静态数据每日备份（服务器端，/root/backup-site-data.sh）
# 备份 data/ + content/（照片源在 NAS immich，不在此列），保留最近 14 份
# cron: 49 3 * * * /root/backup-site-data.sh >> /var/log/backup-site-data.log 2>&1
# 备份矩阵：GitHub git 历史（主）+ 本机滚动快照（防误推/回滚源）+ friends.db 同款机制
set -e
WEBROOT=/www/wwwroot/julyyunna.art
DIR=/root/backups/site-data
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M)
tar -czf "$DIR/site-data-$STAMP.tar.gz" -C "$WEBROOT" data content
# 完整性自检：tar 必须能列出内容
tar -tzf "$DIR/site-data-$STAMP.tar.gz" >/dev/null
ls -1t "$DIR"/site-data-*.tar.gz | tail -n +15 | xargs -r rm -f
echo "$(date -Is) backup ok ($(du -h "$DIR/site-data-$STAMP.tar.gz" | cut -f1))"
