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
    (107.8, 17.5), (106.8, 19.5), (107.8, 21.5), (109.5, 23.0),
    (112.0, 24.0), (116.0, 24.6), (120.0, 24.9), (122.5, 24.6),
    chain[0],
]
ECS_RING = [
    (122.83, 24.6),
    (124.5, 25.8), (126.5, 27.5), (128.5, 29.8), (130.2, 31.5),
    (131.2, 32.6), (132.2, 33.8),
    (130.2, 34.6), (129.6, 36.2), (128.7, 38.2), (127.9, 40.0), (126.2, 41.6),
    (124.4, 39.9),
    (122.5, 40.3), (120.0, 40.5), (118.0, 39.3), (117.3, 38.0),
    (117.3, 36.2), (118.8, 36.2), (120.3, 36.6), (121.5, 37.5),  # 渤海南：锚线深入山东内陆
    (117.8, 34.5), (117.3, 31.5), (117.0, 28.5), (117.2, 26.0), (118.0, 24.8),
    (120.5, 24.3), (122.2, 24.2),  # 华东/华南：锚线深入湘桂内陆，闽粤湾水全纳入
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
# 内水（海湾/湖泊）= 主环内部 − 陆地：主环追踪海岸线时把湾水留在环外，差集取出显式并入
main_ring = max(land, key=lambda g: g.area)
bays = Polygon(main_ring.exterior).difference(land_union)
print(f"南海海域: {len(scs)} 块; 渤海+黄海+东海海域: {len(ecs)} 块; 内水: {bays.geom_type}")

sea_parts = [*scs, *ecs]
if not bays.is_empty:
    sea_parts += list(bays.geoms) if bays.geom_type == "MultiPolygon" else [bays]

china = unary_union([*land, *sea_parts])
print(f"合并后: {china.geom_type}, {len(china.geoms) if hasattr(china,'geoms') else 1} 块")
# 海陆微缝填充：微外扩（约1km）后简化，消除岸缘微缝并控制文件大小
china = china.buffer(0.008).simplify(0.0008, preserve_topology=True)
if china.geom_type == "GeometryCollection":
    china = unary_union([g for g in china.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
print(f"微扩后: {china.geom_type}")

# ---------- 6. 断言 ----------
prepared = prep(china)
checks = [
    ("钓鱼岛", 123.47, 25.74, True), ("台湾", 121.0, 23.8, True), ("海南", 109.7, 19.2, True),
    ("渤海", 120.8, 39.0, True), ("黄海", 122.5, 36.5, True), ("东海", 125.5, 30.5, True),
    ("南海中心", 113.0, 15.0, True), ("永兴岛", 112.34, 16.83, True), ("黄岩岛", 117.75, 15.25, True),
    ("长江口", 122.4, 31.5, True), ("杭州湾", 121.2, 30.55, True), ("平潭", 119.8, 25.5, True),
    ("花莲外", 121.9, 24.0, True), ("台东近海", 121.95, 23.2, True), ("台湾东北", 122.1, 24.8, True),
    ("苏北浅滩", 119.7, 35.5, True), ("渤海湾", 118.6, 37.8, True), ("莱州湾", 119.3, 37.2, True),
    ("青岛外海", 120.8, 35.8, True), ("大连外海", 121.5, 38.8, True),
    ("巴士海峡", 121.5, 21.3, True), ("北部湾", 108.5, 20.5, True),
    ("天津外海", 117.7, 39.0, True), ("胶州湾", 120.25, 36.1, True),
    ("辽东湾", 121.0, 40.4, True), ("湄洲湾", 118.95, 24.95, True),
    ("日本海", 129.5, 39.0, False), ("对马海峡东口", 132.5, 34.5, False),
    ("菲律宾海", 126.0, 21.0, False), ("泰国湾", 101.5, 8.0, False), ("西太平洋", 128.0, 24.0, False),
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

# ---------- 7. 写出（OGC 规范环方向：外环逆时针(正)、洞顺时针(负)；配合渲染端 nonzero 规则） ----------
from shapely.geometry.polygon import orient

china = orient(china, sign=1.0)  # 外环 CCW、洞 CW
if china.geom_type == "MultiPolygon":
    china = [orient(g, sign=1.0) for g in china.geoms]
else:
    china = [orient(china, sign=1.0)]

def coords_of(g: Polygon):
    return [[list(c) for c in g.exterior.coords]] + [[list(c) for c in r.coords] for r in g.interiors]

polys = [coords_of(g) for g in china]
out = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {
    "name": "中华人民共和国", "source": "tianditu(frykit)", "level": "country"},
    "geometry": {"type": "MultiPolygon", "coordinates": polys}}]}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f)
print(f"完成: {len(polys)} 多边形, {os.path.getsize(OUT)//1024}KB → {OUT}")

# ---------- 8. 陆地版（世界模式遮罩专用） ----------
# 世界模式"中国区域灰白"若直接用上面的合并区域，会把主张海域一起盖住（视觉上海被遮）。
# 这里额外输出一份"纯陆地"国界，供世界模式遮罩只盖陆地、不动海域。
OUT_LAND = os.path.join(ROOT, "data", "china-land.json")

land_only = unary_union(land)
if land_only.geom_type == "GeometryCollection":
    land_only = unary_union([g for g in land_only.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
# 遮罩只做灰白底色，不需要小岛：按面积过滤（>0.05°²，约 500km² 以上）再简化，控制体积
_land_parts = list(land_only.geoms) if land_only.geom_type == "MultiPolygon" else [land_only]
_kept = [g for g in _land_parts if g.area > 0.05]
print(f"陆地版：{len(_land_parts)} 块 → 保留 {len(_kept)} 块（面积 >0.05°²）")
land_only = unary_union(_kept).buffer(0.008).simplify(0.01, preserve_topology=True)
if land_only.geom_type == "GeometryCollection":
    land_only = unary_union([g for g in land_only.geoms if g.geom_type in ("Polygon", "MultiPolygon")])

# 陆地版断言：陆地必须在，海域必须在外面
pl = prep(land_only)
land_checks = [
    ("台湾", 121.0, 23.8, True), ("海南", 109.7, 19.2, True),
    ("北京", 116.4, 39.9, True), ("乌鲁木齐", 87.6, 43.8, True), ("拉萨", 91.1, 29.65, True),
    ("南海中心", 113.0, 15.0, False), ("黄岩岛", 117.75, 15.25, False),
    ("渤海", 120.8, 39.0, False), ("黄海", 122.5, 36.5, False), ("东海", 125.5, 30.5, False),
    ("胶州湾", 120.25, 36.1, False), ("湄洲湾", 118.95, 24.95, False), ("杭州湾", 121.2, 30.55, False),
    ("台湾海峡", 119.5, 24.5, False), ("北部湾", 108.5, 20.5, False),
]
lfail = 0
for name, x, y, expect in land_checks:
    got = pl.covers(Point(x, y))
    good = (got == expect)
    lfail += (not good)
    print(("✓" if good else "✗"), "陆地版", name, "" if good else f"期望{'内' if expect else '外'}实际{'内' if got else '外'}")
if lfail:
    raise SystemExit("陆地版校验未通过")

land_geoms = list(land_only.geoms) if land_only.geom_type == "MultiPolygon" else [land_only]
land_geoms = [orient(g, sign=1.0) for g in land_geoms]  # 外环 CCW、洞 CW
out_land = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {
    "name": "中华人民共和国（陆地）", "source": "tianditu(frykit)", "level": "country-land"},
    "geometry": {"type": "MultiPolygon", "coordinates": [coords_of(g) for g in land_geoms]}}]}
with open(OUT_LAND, "w", encoding="utf-8") as f:
    json.dump(out_land, f)
print(f"完成: 陆地版 {len(land_geoms)} 多边形, {os.path.getsize(OUT_LAND)//1024}KB → {OUT_LAND}")
