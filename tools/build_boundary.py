# -*- coding: utf-8 -*-
# 中国边界统一构建脚本（单一数据源：frykit 天地图官方数据）
# 用法：pip install frykit[data] shapely
#       python tools/build_boundary.py
# 产出：data/china-boundary.json（国界514多边形 + 渤海/黄海/东海海域 + 南海十段线海域）
# 版图范围：陆地+全部岛屿 / 渤海内海 / 黄海至朝鲜海岸 / 东海至中日边界方向(日朝韩陆地裁切) / 南海十段线内
from __future__ import annotations

import json
import math
import os
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")

from frykit.conf import config

config.data_source = "tianditu"

from frykit.shp import get_cn_border, get_cn_line  # noqa: E402
from shapely.geometry import MultiLineString, MultiPolygon, Point, Polygon, mapping  # noqa: E402
from shapely.ops import unary_union  # noqa: E402
from shapely.prepared import prep  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "china-boundary.json")
TMP = tempfile.gettempdir()
NEIGHBORS = ["VNM", "PHL", "MYS", "BRN", "IDN", "KHM", "THA", "KOR", "PRK", "JPN"]

# ---------- 1. frykit 天地图数据 ----------
mp = get_cn_border()
land_polys = list(mp.geoms)
print(f"frykit 天地图国界: {len(land_polys)} 多边形")

line = get_cn_line("九段线")
dash = list(line.geoms) if line.geom_type == "MultiLineString" else [line]

# ---------- 2. 主环拓扑简化（shapely preserve_topology，无自交） ----------
def simplify_poly(g: Polygon) -> Polygon:
    if len(g.exterior.coords) < 2000:
        return g
    for tol in (0.0015, 0.001, 0.0007):
        s = g.simplify(tol, preserve_topology=True)
        if s.is_valid and s.geom_type == "Polygon":
            return s
    return g

land = [simplify_poly(g) for g in land_polys]

# ---------- 3. 邻国裁切参照 ----------
nbr = []
for code in NEIGHBORS:
    with open(os.path.join(TMP, f"ne_{code}.json"), encoding="utf-8") as f:
        j = json.load(f)
    for feat in j["features"]:
        g = feat["geometry"]
        if g["type"] == "Polygon":
            nbr.append(Polygon(g["coordinates"][0]))
        else:
            for p in g["coordinates"]:
                nbr.append(Polygon(p[0]))
land_union = unary_union(land)
nbr_union = unary_union(nbr)
print(f"裁切参照: 邻国 {len(nbr)} 块")

# ---------- 4. 十段线 V 形链（frykit 九段线 + 台湾以东第十段） ----------
segs = []
for p in dash:
    b = p.bounds
    segs.append({"line": list(p.coords), "cx": (b[0] + b[2]) / 2, "cy": (b[1] + b[3]) / 2,
                 "miny": b[1], "maxy": b[3]})
east = sorted([s for s in segs if s["cx"] >= 114 or s["maxy"] < 5], key=lambda s: -s["cy"])
west = sorted([s for s in segs if not (s["cx"] >= 114 or s["maxy"] < 5)], key=lambda s: s["cy"])

def orient(d, head_high):
    return d if (d[0][1] >= d[-1][1]) == head_high else list(reversed(d))

chain = [(122.83, 24.6), (122.72, 23.6)]  # 第十段（台湾以东，标准地图位置）
for s in east:
    chain += orient(s["line"], True)
chain.append(west[0]["line"][0] if west[0]["line"][0][1] <= west[0]["line"][-1][1] else west[0]["line"][-1])
for s in west:
    chain += orient(s["line"], False)
print(f"十段线链: {len(chain)} 点 首{chain[0]} 尾{chain[-1]}")

# ---------- 5. 海域构建（shapely difference，洞自动正确） ----------
SCS_RING = chain + [
    (106.6, 6.9), (105.3, 7.6), (104.9, 8.0),
    (104.6, 9.0), (105.2, 9.5), (106.6, 10.0), (107.6, 11.5), (107.8, 13.5), (107.4, 15.5),
    (107.0, 17.5), (106.6, 19.5), (106.3, 21.0),
    (107.5, 22.0), (109.5, 22.2), (111.5, 22.8), (113.5, 23.3), (115.5, 23.8), (117.0, 24.6), (118.5, 25.3),
    (120.0, 25.9), (121.4, 25.7),
    (121.9, 25.3), (121.6, 24.8), (121.2, 24.2), (120.9, 23.4), (120.8, 22.6), (120.85, 21.95),
    (121.3, 22.3), (121.8, 23.5), (122.2, 24.2),
    chain[0],
]
ECS_RING = [
    (122.83, 24.6),
    (124.5, 25.8), (126.5, 27.5), (128.5, 29.8), (130.2, 31.5),
    (131.2, 32.6), (132.2, 33.8),
    (130.2, 34.6), (129.6, 36.2), (128.7, 38.2), (127.9, 40.0), (126.2, 41.6),
    (124.4, 39.9),
    (122.5, 40.3), (120.0, 40.5), (118.0, 39.3), (117.3, 38.0), (117.6, 37.2),
    (119.0, 37.2), (120.5, 37.6), (121.5, 38.5),
    (120.0, 35.0), (119.2, 32.3), (118.8, 29.5), (119.0, 27.0), (119.8, 25.2),
    (121.0, 24.5), (122.2, 24.2),
    (122.83, 24.6),
]

def build_sea(ring, min_area):
    # 仅减邻国陆地；中国陆地不减——最终 unary_union 布尔并集天然消除双覆盖，
    # 国界凹陷水域（杭州湾等）由海域面包入
    g = Polygon(ring).difference(nbr_union)
    if g.is_empty:
        return []
    polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
    return [p for p in polys if p.area > min_area and p.geom_type == "Polygon"]

scs = build_sea(SCS_RING, 20)
ecs = build_sea(ECS_RING, 1)
print(f"南海海域: {len(scs)} 块; 渤海+黄海+东海海域: {len(ecs)} 块")

china = unary_union([*land, *scs, *ecs])
print(f"合并后: {china.geom_type}, {len(china.geoms) if hasattr(china,'geoms') else 1} 块")

# ---------- 6. 断言 ----------
prepared = prep(china)
checks = [
    ("钓鱼岛", 123.47, 25.74, True), ("台湾", 121.0, 23.8, True), ("海南", 109.7, 19.2, True),
    ("渤海", 120.8, 39.0, True), ("黄海", 122.5, 36.5, True), ("东海", 125.5, 30.5, True),
    ("南海中心", 113.0, 15.0, True), ("永兴岛", 112.34, 16.83, True), ("黄岩岛", 117.75, 15.25, True),
    ("长江口", 122.4, 31.5, True), ("杭州湾", 121.2, 30.55, True), ("平潭", 119.8, 25.5, True),
    ("日本海", 129.5, 39.0, False), ("对马海峡东口", 132.5, 34.5, False),
    ("菲律宾海", 126.0, 21.0, False), ("泰国湾", 101.5, 8.0, False),
]
fail = 0
for name, x, y, expect in checks:
    got = prepared.covers(Point(x, y))
    ok = (got == expect)
    fail += (not ok)
    print(("✓" if ok else "✗"), name, "" if ok else f"期望{'内' if expect else '外'}实际{'内' if got else '外'}")

# 全图扫描：中国范围内（主环内）不得有遮罩（covers=真 即无遮罩，因 china 即完整中国区域）
main = max(land, key=lambda g: g.area)
pmain = prep(main)
bad = scan_n = 0
lat = 18.0
while lat < 54:
    lon = 73.0
    while lon < 136:
        p = Point(lon, lat)
        if pmain.covers(p) and not prepared.covers(p):
            bad += 1
            if bad <= 5:
                print("遮罩漏洞:", round(lon, 2), round(lat, 2))
        scan_n += 1
        lon += 0.1
    lat += 0.1
print(f"国界内扫描 {scan_n} 点，遮罩漏洞 {bad}")
if fail or bad:
    raise SystemExit("校验未通过")

# ---------- 7. 写出 ----------
def coords_of(g: Polygon):
    return [[list(c) for c in g.exterior.coords]] + [[list(c) for c in r.coords] for r in g.interiors]

polys = [coords_of(g) for g in china.geoms] if china.geom_type == "MultiPolygon" else [coords_of(china)]
out = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {
    "name": "中华人民共和国", "source": "tianditu(frykit)", "level": "country"},
    "geometry": {"type": "MultiPolygon", "coordinates": polys}}]}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f)
print(f"完成: {len(polys)} 多边形, {os.path.getsize(OUT)//1024}KB → {OUT}")
