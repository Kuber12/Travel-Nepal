"""
Generate src/data/board.full.json from waypoints traced off the printed board.

All waypoints are in the photo's pixel space (the Instagram screenshot of the
board), so the 3D layout keeps the printed board's geography: Mountain
Expedition top-right, Himalayan Village top-middle, Western Hillside top-left,
Pokhara centre-left, Nepal Mandal centre, Eastern Trip right, Lumbini and the
Western Terai bottom-left, Chitwan bottom-centre.

Main road (counter-clockwise from the airport):
  Airport -> Nepal Mandal -> Chitwan -> Lumbini -> Pokhara -> top road ->
  Kathmandu approach -> Departure (back at the airport)
Five gated trips hang off junctions on that road and loop back to them.
"""
import json, math, sys

# photo px -> world units. 35 px between printed tiles ~= 2.2 world units.
S = 0.063
OX, OY = 680, 775
def world(p):
    x, y = p
    # x is mirrored: the camera looks north (+z), so screen-right is -x.
    return [round((OX - x) * S, 2), 0, round((OY - y) * S, 2)]

nodes = []
def add(id, section, kind, p, label=None, **extra):
    n = {"id": id, "section": section, "kind": kind, "next": [], "pos": world(p), "_px": p}
    if label: n["label"] = label
    n.update(extra)
    nodes.append(n)
    return n

def chain(prefix, section, pts, specials=None, first_extra=None):
    """Add a run of path tiles; specials maps index -> (kind, label, extra)."""
    out = []
    specials = specials or {}
    for i, p in enumerate(pts):
        kind, label, extra = specials.get(i, ("path", None, {}))
        extra = dict(extra)
        if i == 0 and first_extra: extra.update(first_extra)
        out.append(add(f"{prefix}-{i+1:02d}", section, kind, p, label, **extra))
    return out

def link(seq):
    for a, b in zip(seq, seq[1:]):
        if b["id"] not in a["next"]:
            a["next"].append(b["id"])

def row(x0, x1, y, step=35):
    n = max(1, round(abs(x1 - x0) / step))
    return [(round(x0 + (x1 - x0) * i / n), y) for i in range(n + 1)]
def col(x, y0, y1, step=35):
    n = max(1, round(abs(y1 - y0) / step))
    return [(x, round(y0 + (y1 - y0) * i / n)) for i in range(n + 1)]

CP = "checkpoint"; TC = "ticket-counter"; JN = "junction"

# ---------------------------------------------------------------- main road
# Traced tile-by-tile off the printed board. Direction of travel: out of the
# airport heading west, through Nepal Mandal and its red ticket lane, down to
# Chitwan, west along Lumbini, up the far-left road into Pokhara, round the
# lake, up through the Himalayan villages, across the top, and back down the
# Kathmandu road to the airport.
P = lambda kind, label=None, **extra: (kind, label, extra)

def seq(prefix, section, items):
    """items: list of (x, y) or ((x, y), (kind, label, extra))."""
    out = []
    for i, it in enumerate(items):
        if isinstance(it[0], tuple):
            p, (kind, label, extra) = it
        else:
            p, kind, label, extra = it, "path", None, {}
        out.append(add(f"{prefix}-{i+1:02d}", section, kind, p, label, **extra))
    return out

air = add("AIR-00", "airport", "start", (912, 712), "Tribhuvan International Airport")

nm = seq("NM", "nepalmandal", [
    (878, 712), (845, 712), (812, 712), (779, 712), (746, 712), (713, 712),
    (690, 742), (692, 770),
    (662, 794), (629, 794), (596, 794), (562, 794), (527, 794),
    (517, 830), (552, 842), (588, 842),
    ((624, 842), P(TC, "Asan Ticket Counter")),
    ((660, 840), P(CP, "Thamel Checkpoint", ticketReward="mountain")),
])
# The red lane: every red square sells the entry ticket printed on it.
red = seq("RED", "nepalmandal", [
    ((694, 836), P(TC, "Ticket: Mountain Expedition", ticketReward="mountain")),
    ((729, 836), P(TC, "Ticket: Eastern Trip", ticketReward="eastern")),
    ((764, 836), P(TC, "Ticket: Western Terai Trip", ticketReward="westernterai")),
    ((799, 836), P(TC, "Ticket: Western Hillside Trip", ticketReward="westernhillside")),
    ((834, 838), P(TC, "Ticket: Mountain Expedition", ticketReward="mountain")),
    ((858, 864), P(TC, "Ticket: Eastern Trip", ticketReward="eastern")),
    ((860, 898), P(TC, "Ticket: Western Terai Trip", ticketReward="westernterai")),
    ((860, 932), P(TC, "Ticket: Western Hillside Trip", ticketReward="westernhillside")),
])
thankot = add("NM-CP2", "nepalmandal", CP, (872, 964), "Thankot Checkpoint", ticketReward="eastern")

cht_a = seq("CHT", "chitwan", [(908, 963), (944, 962), (980, 961)])
j_east = add("CHT-JN", "chitwan", JN, (1016, 960), "Chitwan Junction")
cht_b = seq("CHT2", "chitwan",
    [(1046, 990)] + [(x, 1001) for x in (1008, 970, 932, 894)] +
    [((856, 1001), P(CP, "Sauraha Checkpoint"))] +
    [(x, 1001) for x in (818, 780, 743, 706)] + [(672, 994), (660, 962)])
narayangadh = add("CHT-CP2", "chitwan", CP, (660, 922), "Narayangadh Checkpoint", ticketReward="westernterai")

lum_a = seq("LUM", "lumbini",
    [(x, 884) for x in (626, 590, 554, 518, 482)] +
    [((446, 884), P(TC, "Butwal Ticket Counter"))] +
    [(x, 884) for x in (410, 374)] + [(338, 900)])
j_terai = add("LUM-JN", "lumbini", JN, (338, 938), "Lumbini Junction")
lum_b = seq("LUM2", "lumbini",
    [(340, 975), (318, 1013), (288, 1000), (291, 965), (293, 930), (296, 894), (300, 858)])
tansen = add("LUM-CP", "lumbini", CP, (308, 822), "Tansen Checkpoint", ticketReward="westernhillside")

pok_a = seq("POK", "pokhara",
    [(332, 778), (365, 776), (398, 776), (431, 776), (462, 772), (481, 745)])
j_hill = add("POK-JN", "pokhara", JN, (481, 711), "Syangja Junction")
pok_b = seq("POK2", "pokhara", [
    (482, 677), (520, 672), (556, 670),
    ((592, 668), P(TC, "Lakeside Ticket Counter")),
    (626, 664), (648, 640),
    (618, 632), (585, 634), (551, 636), (517, 637), (487, 628),
])
sarangkot = add("POK-CP", "pokhara", CP, (490, 596), "Sarangkot Checkpoint", ticketReward="mountain")

him = seq("HIM", "himalayan",
    [(470, 563), (436, 556), (402, 549), (368, 541), (338, 520)] +
    [(x, 507 + (x - 368) * 12 // 300) for x in (368, 401, 434, 467, 500, 533, 566, 599, 632)] +
    [(664, 519)])
him[0]["label"] = "Himalayan Village Trip"
j_mtn = add("HIM-JN", "himalayan", JN, (697, 531), "Dhulikhel Junction")
him_b = seq("HIM2", "himalayan", [(703, 570)])

ktm = seq("KTM", "nepalmandal", [
    ((700, 607), P(CP, "Sanga Checkpoint")),
    (696, 643), (722, 673), (756, 674), (790, 674),
    ((824, 674), P(TC, "Bhaktapur Ticket Counter")),
    (858, 674),
])
departure = add("AIR-END", "airport", "terminus", (900, 672), "Departure — Thank you for visiting")

main = ([air] + nm + red + [thankot] + cht_a + [j_east] + cht_b + [narayangadh] +
        lum_a + [j_terai] + lum_b + [tansen] + pok_a + [j_hill] + pok_b +
        [sarangkot] + him + [j_mtn] + him_b + ktm + [departure])
link(main)

# ---------------------------------------------------------------- gated trips
def trip(prefix, section, pts, junction, name, rejoin):
    t = chain(prefix, section, pts, first_extra={"requiresTicket": section})
    t[0]["label"] = name
    junction["next"].insert(0, t[0]["id"])
    link(t)
    t[-1]["next"].append(rejoin["id"])
    return t

# Eastern Trip: IN arrow points up the outer column; round the tea hills and
# back out beside the arrow.
trip("EAS", "eastern",
     [(1047, 925), (1040, 888), (1032, 851), (1024, 814), (1016, 779),
      (1006, 746), (973, 742), (940, 749), (908, 762),
      (902, 795), (900, 829), (899, 863), (898, 897),
      (927, 918), (960, 916), (990, 914)],
     j_east, "Eastern Trip", rejoin=j_east)

# Western Terai Trip: IN arrow east along the upper row, round, back west.
trip("WTR", "westernterai",
     [(380, 925), (416, 925), (452, 925), (488, 925), (524, 925), (560, 925), (596, 927),
      (616, 958), (614, 992),
      (597, 1030), (562, 1029), (527, 1024), (492, 1017), (457, 1009), (420, 1002), (384, 994)],
     j_terai, "Western Terai Trip", rejoin=lum_b[0])

# Western Hillside Trip: IN arrow west along the bottom, up, east, down.
trip("WHL", "westernhillside",
     [(446, 724), (414, 737), (382, 739), (349, 737), (318, 727),
      (316, 694), (317, 661), (317, 628), (319, 596),
      (348, 576), (381, 579), (414, 585), (445, 600),
      (451, 633), (453, 664)],
     j_hill, "Western Hillside Trip", rejoin=pok_b[0])

# Mountain Expedition: IN arrow east along the top, down, back west, up.
trip("MTN", "mountain",
     [(743, 533)] + [(x, 532) for x in (777, 811, 845, 879, 913, 947)] + [(980, 535),
      (1004, 563), (1006, 597), (1000, 628)] +
     [(x, 637) for x in (968, 935, 902, 869, 836, 803, 770)] + [(738, 620), (740, 585)],
     j_mtn, "Mountain Expedition", rejoin=him_b[0])

# ---------------------------------------------------------------- checks
ids = {n["id"] for n in nodes}
assert len(ids) == len(nodes), "duplicate ids"
for n in nodes:
    for nx in n["next"]:
        assert nx in ids, (n["id"], nx)

# crowding report: non-linked tiles closer than 30 px
adj = {(n["id"], m) for n in nodes for m in n["next"]}
bad = []
for i, a in enumerate(nodes):
    for b in nodes[i+1:]:
        d = math.dist(a["_px"], b["_px"])
        linked = (a["id"], b["id"]) in adj or (b["id"], a["id"]) in adj
        if d < (24 if linked else 31):
            bad.append((round(d), a["id"], b["id"]))
for b in sorted(bad): print("close:", b, file=sys.stderr)
long_edges = []
byid = {n["id"]: n for n in nodes}
for n in nodes:
    for m in n["next"]:
        d = math.dist(n["_px"], byid[m]["_px"])
        if d > 62: long_edges.append((round(d), n["id"], m))
for e in sorted(long_edges): print("long edge:", e, file=sys.stderr)

print(f"{len(nodes)} nodes, main road {len(main)} tiles", file=sys.stderr)

out = {"id": "full", "startNode": "AIR-00", "nodes": []}
for n in nodes:
    n = {k: v for k, v in n.items() if k != "_px"}
    out["nodes"].append(n)

# one node per line, like the hand-written slice
lines = ['{', '  "id": "full",', '  "startNode": "AIR-00",', '  "nodes": [']
lines += ["    " + json.dumps(n, ensure_ascii=False) + ("," if i < len(out["nodes"]) - 1 else "")
          for i, n in enumerate(out["nodes"])]
lines += ['  ]', '}']
open(sys.argv[1] if len(sys.argv) > 1 else "board.full.json", "w").write("\n".join(lines) + "\n")

# preview overlay
if len(sys.argv) > 2:
    from PIL import Image, ImageDraw
    img = Image.open(sys.argv[2]).convert("RGB")
    d = ImageDraw.Draw(img)
    col_for = {"path": (40, 40, 200), "checkpoint": (220, 0, 0), "junction": (255, 120, 0),
               "ticket-counter": (140, 0, 200), "start": (0, 160, 0), "terminus": (0, 160, 0)}
    for n in nodes:
        for m in n["next"]:
            d.line([tuple(n["_px"]), tuple(byid[m]["_px"])], fill=(0, 0, 0), width=2)
    for n in nodes:
        x, y = n["_px"]
        c = (0, 150, 150) if n.get("requiresTicket") else col_for[n["kind"]]
        d.ellipse([x-9, y-9, x+9, y+9], outline=c, width=3)
    img.crop((270, 470, 1090, 1070)).save(sys.argv[3])
