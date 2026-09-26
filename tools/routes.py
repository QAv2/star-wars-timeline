"""The great hyperspace lanes for the star map: each route's infobox lists its worlds in order
(endpoints / transitpoints / otherobjects); every waypoint with a grid square becomes a point.
Writes build/routes.json [{name, pts: [[col, row, world], …]}]."""
import sys, os, re, json
sys.path.insert(0, os.path.dirname(__file__))
import wp

ROUTES = ["Perlemian Trade Route", "Hydian Way", "Corellian Run", "Corellian Trade Spine", "Rimma Trade Route",
          "Triellus Trade Route", "Braxant Run", "Gordian Reach", "Shipwrights' Trace", "Kessel Run", "Sisar Run", "Great Hydian Way"]


def names(v):
    v = re.sub(r"<ref[^>/]*/>", "", v or ""); v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    out = []
    for part in re.split(r"\s+-\s+|\n\*+|<br\s*/?>|^\*+", v):
        m = re.search(r"\[\[([^\]|#]+)", part)
        name = m.group(1).strip() if m else wp.clean(part).strip("* ")
        if name and len(name) < 60:
            out.append(name)
    return out


def waypoints(text):
    """Ordered along the lane: `otherobjects` runs from one end outward; the endpoints cap it."""
    ib = wp.infobox(text)
    ends, mid = names(ib.get("endpoints")), names(ib.get("transitpoints")) + names(ib.get("otherobjects"))
    seq = list(dict.fromkeys(mid))
    if ends:
        if ends[0] not in seq[:1]:
            seq = [ends[0]] + [w for w in seq if w != ends[0]]
        if len(ends) > 1 and ends[-1] not in seq[-1:]:
            seq = [w for w in seq if w != ends[-1]] + [ends[-1]]
    return seq


def main():
    got = wp.wikitext_many(ROUTES)
    lists = {}
    for r in ROUTES:
        rec = got[r]
        if rec["text"]:
            lists[rec["title"]] = waypoints(rec["text"])
    allw = [w for ws in lists.values() for w in ws]
    pages = wp.wikitext_many(allw)
    grid = {}
    for w in allw:
        ib = wp.infobox(pages[w]["text"] or "")
        m = re.search(r"\b([A-Z])-?(\d{1,2})\b", wp.clean(ib.get("coordinates", "")))
        if ib.get("_type") == "CelestialBody" and m:
            grid[w] = (ord(m.group(1)) - 64, int(m.group(2)))
    out = []
    for name, ws in lists.items():
        pts = [[grid[w][0], grid[w][1], w] for w in ws if w in grid]
        # same-square repeats collapse; then walk nearest-neighbour from the first endpoint so the lane never zigzags
        seen, uniq = set(), []
        for p in pts:
            if (p[0], p[1]) not in seen:
                seen.add((p[0], p[1])); uniq.append(p)
        if uniq:
            chain, rest = [uniq[0]], uniq[1:]
            while rest:
                last = chain[-1]
                j = min(range(len(rest)), key=lambda i: (rest[i][0] - last[0]) ** 2 + (rest[i][1] - last[1]) ** 2)
                chain.append(rest.pop(j))
            pts = chain
        if len(pts) >= 3:
            out.append({"name": name, "pts": pts})
        print(f"{name}: {len(ws)} waypoints, {len(pts)} on the grid")
    os.makedirs(os.path.join(wp.ROOT, "build"), exist_ok=True)
    json.dump(out, open(os.path.join(wp.ROOT, "build", "routes.json"), "w"), ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main()
