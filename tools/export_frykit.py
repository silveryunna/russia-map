# -*- coding: utf-8 -*-
# frykit 天地图官方数据导出（单一版图数据源）
# 用法：pip install frykit[data] shapely
#       python tools/export_frykit.py
# 产出（%TEMP%）：frykit_tdt.json = 中国国界 514 多边形；frykit_dash.json = 九段线 9 段
import json
import os
import tempfile

from frykit.conf import config

config.data_source = "tianditu"

from frykit.shp import get_cn_border, get_cn_line  # noqa: E402

mp = get_cn_border()
polys = [
    [list(g.exterior.coords)]
    + [[list(c) for c in ring.coords] for ring in g.interiors]
    for g in mp.geoms
]
tmp = tempfile.gettempdir()
with open(os.path.join(tmp, "frykit_tdt.json"), "w") as f:
    json.dump({"type": "MultiPolygon", "coordinates": polys}, f)
print("国界:", len(polys), "多边形")

line = get_cn_line("九段线")
parts = list(line.geoms) if line.geom_type == "MultiLineString" else [line]
dash = [[list(c) for c in p.coords] for p in parts]
with open(os.path.join(tmp, "frykit_dash.json"), "w") as f:
    json.dump(dash, f)
print("九段线:", len(dash), "段")
