"""Resolve every location named in records (and curated overlays) → build/places.json.

Planets are pages with a {{CelestialBody}} infobox: region / sector / system / grid square (Standard Galactic Grid).
Sub-locations (cities, bases) resolve to their planet through the App-section nesting in each record.
"""
import sys, os, re, json, glob, collections
sys.path.insert(0, os.path.dirname(__file__))
import wp

ROOT = wp.ROOT


def grid(v):
    m = re.search(r"\b([A-Z])-?(\d{1,2})\b", wp.clean(v or ""))
    return f"{m.group(1)}-{int(m.group(2))}" if m else ""


def first_link(v):
    m = re.search(r"\[\[([^\]|#]+)", v or "")
    return m.group(1).strip() if m else wp.clean(v or "").split("\n")[0].strip("* ")


def main():
    R = json.load(open(os.path.join(ROOT, "build", "records.json")))
    titles = collections.Counter()
    for r in R:
        for d, t, fl in r["locs"]:
            titles[t] += 1
    for f in glob.glob(os.path.join(ROOT, "data", "curated", "*.json")):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        items = d if isinstance(d, list) else [x for v in d.values() if isinstance(v, list) for x in v]
        for it in items:
            if isinstance(it, dict):
                for t in it.get("places", []) or []:
                    titles[t] += 1
    got = wp.wikitext_many(list(titles))
    out = {}
    for t, rec in got.items():
        ib = wp.infobox(rec["text"] or "")
        typ = ib.get("_type") or ""
        e = {"title": rec["title"], "type": typ}
        if typ == "CelestialBody":
            e.update(region=first_link(ib.get("region")), sector=first_link(ib.get("sector")),
                     system=first_link(ib.get("system")), grid=grid(ib.get("coordinates")),
                     cls=wp.clean(ib.get("class", "")).split("\n")[0][:40])
        out[t] = e
    json.dump(out, open(os.path.join(ROOT, "build", "places.json"), "w"), ensure_ascii=False, indent=0)
    c = collections.Counter(e["type"] or "none" for e in out.values())
    pl = [e for e in out.values() if e["type"] == "CelestialBody"]
    print(len(out), "locations;", c.most_common(12))
    print(len(pl), "celestial bodies;", sum(1 for e in pl if e["grid"]), "with grid;",
          collections.Counter(e["region"] for e in pl).most_common(12))
    g = [e["grid"] for e in pl if e["grid"]]
    print("grid cols", sorted({x.split('-')[0] for x in g}), "rows", sorted({int(x.split('-')[1]) for x in g}))


if __name__ == "__main__":
    main()
