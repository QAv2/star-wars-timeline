"""Assemble docs/data/archive.json from parsed records, resolved places and the curated overlays.

Time axis: one number per moment; BBY negative, ABY positive, 0 = the Battle of Yavin's year.
A year Y occupies [Y, Y+1): "19 BBY" is -19 ≤ t < -18. Records sit inside their year in the order
Wookieepedia's in-universe media timeline gives them.
"""
import sys, os, re, json, glob, datetime, collections
sys.path.insert(0, os.path.dirname(__file__))
import wp, media_timeline as mt

ROOT = wp.ROOT
CUR = os.path.join(ROOT, "data", "curated")

# lane id, short label, full name, colour token
LANES = [
    ("HISTORY", "CHRONICLE", "Galactic history", "hist"),
    ("FILM", "FILMS", "The films", "film"),
    ("YJA", "YOUNG JEDI", "Young Jedi Adventures", "yja"),
    ("ACO", "ACOLYTE", "The Acolyte", "aco"),
    ("TALES", "TALES", "Tales of the Jedi, the Empire and the Underworld", "tales"),
    ("TCW", "CLONE WARS", "The Clone Wars", "tcw"),
    ("TBB", "BAD BATCH", "The Bad Batch", "tbb"),
    ("MSL", "MAUL", "Maul: Shadow Lord", "msl"),
    ("OWK", "KENOBI", "Obi-Wan Kenobi", "owk"),
    ("AND", "ANDOR", "Andor", "and"),
    ("REB", "REBELS", "Rebels", "reb"),
    ("FOD", "DESTINY", "Forces of Destiny", "fod"),
    ("MAN", "MANDALORIAN", "The Mandalorian", "man"),
    ("BOBF", "BOBA FETT", "The Book of Boba Fett", "bobf"),
    ("SKC", "SKELETON", "Skeleton Crew", "skc"),
    ("AHS", "AHSOKA", "Ahsoka", "ahs"),
    ("RES", "RESISTANCE", "Resistance", "res"),
    ("LEGENDS", "LEGENDS", "Legends continuity (layer)", "leg"),
]
NARROW = {"HISTORY": "HIST", "YJA": "YJA", "TCW": "TCW", "TBB": "TBB", "MAN": "MANDO", "BOBF": "BOBF", "SKC": "SKC",
          "RES": "RES", "FOD": "FOD", "ACO": "ACO"}
LANE_OF = {"FLM": "FILM", "TOTJ": "TALES", "TOTE": "TALES", "TOTU": "TALES",
           "CW03": "LEGENDS", "DRD": "LEGENDS", "EWK": "LEGENDS", "LFLM": "LEGENDS"}
SERIES = {
    "FLM": "Star Wars films", "TCW": "Star Wars: The Clone Wars", "REB": "Star Wars Rebels",
    "RES": "Star Wars Resistance", "TBB": "Star Wars: The Bad Batch", "MAN": "The Mandalorian",
    "BOBF": "The Book of Boba Fett", "OWK": "Obi-Wan Kenobi", "AND": "Andor", "AHS": "Ahsoka",
    "ACO": "The Acolyte", "SKC": "Skeleton Crew", "TOTJ": "Tales of the Jedi", "TOTE": "Tales of the Empire",
    "TOTU": "Tales of the Underworld", "MSL": "Maul: Shadow Lord", "YJA": "Young Jedi Adventures",
    "FOD": "Forces of Destiny", "CW03": "Star Wars: Clone Wars (2003, Legends)", "DRD": "Droids (Legends)",
    "EWK": "Ewoks (Legends)", "LFLM": "Legends films and specials",
}
REMOTE = {"holo", "voice", "vision", "ghost", "po"}


CANON_OF = {}  # Legends page → its canon counterpart, from the page's {{Top|canon=…}}


def load_canon_map(titles):
    f = os.path.join(wp.CACHE, "legends_canon.json")
    memo = json.load(open(f)) if os.path.exists(f) else {}
    todo = [t for t in dict.fromkeys(titles) if t.endswith("/Legends") and t not in memo]
    if todo:
        for t, rec in wp.wikitext_many(todo).items():
            m = re.search(r"\{\{Top\|[^}]*?canon=([^|}]+)", (rec["text"] or "")[:3000])
            memo[t] = m.group(1).strip() if m else None
        json.dump(memo, open(f, "w"), ensure_ascii=False)
    CANON_OF.update({k: v for k, v in memo.items() if v})


def key(title):
    """One key per person/place across continuities: a Legends page joins its canon counterpart
    (Palpatine/Legends → Darth Sidious); otherwise drop Wookieepedia's /Legends and /Canon suffixes."""
    t = (title or "").strip()
    if t in CANON_OF:
        return CANON_OF[t]
    return re.sub(r"/(Legends|Canon)$", "", t).strip()


def ytime(y, frac=None, lo=0.0):
    """Moment inside year y (frac = position within the year; default mid-year)."""
    if y is None:
        return None
    if isinstance(y, float) and y != int(y):
        return y
    return float(y) + (0.5 if frac is None else max(0.0, min(0.999, float(frac))))


def fmt_year(y):
    if y is None:
        return ""
    if isinstance(y, float) and y != int(y):
        return f"{abs(y):g} {'BBY' if y < 0 else 'ABY'}"
    y = int(y)
    return f"{-y:,} BBY" if y < 0 else f"{y:,} ABY"


def row_times(rows):
    """Row index → t: rank inside the row's start year, spread across [Y, Y+1)."""
    groups = collections.defaultdict(list)
    for r in rows:
        ys = mt.years(r["date"])
        if ys:
            groups[ys[0]].append(r["i"])
    out = {}
    for y, idxs in groups.items():
        n = len(idxs)
        for rank, i in enumerate(sorted(idxs)):
            out[i] = y if (isinstance(y, float) and y != int(y)) else y + (rank + 0.5) / n
    return out


SHORT = re.compile(r"^(Chapter \d+|Part [A-Z][a-z]+|Part [IVX]+|Episode \d+):\s*")


def load_json(path, default):
    try:
        return json.load(open(path))
    except (OSError, ValueError) as e:
        if os.path.exists(path):
            print("  !! bad json", path, e)
        return default


def main():
    R = json.load(open(os.path.join(ROOT, "build", "records.json")))
    P = load_json(os.path.join(ROOT, "build", "places.json"), {})
    ct = row_times(mt.canon_rows())
    lt = row_times(mt.legends_rows())
    loglines = {}
    for f in sorted(glob.glob(os.path.join(CUR, "loglines", "*.json"))):
        loglines.update(load_json(f, {}))

    # ── people: present / remote / flashback, merged across continuities ──
    res = wp.resolve_many(list({c[1] for r in R for c in r["chars"]}))
    load_canon_map([res.get(c[1]) or c[1] for r in R for c in r["chars"]] + [t for r in R for d, t, fl in r["locs"]])
    cnt = collections.Counter()
    for r in R:
        seen = set()
        for d, t, fl in r["chars"]:
            if "mo" in fl or "imo" in fl:
                continue
            k = key(res.get(t) or t)
            if k not in seen:
                seen.add(k); cnt[k] += 1
    people = [k for k, _ in sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))]
    pidx = {k: i for i, k in enumerate(people)}

    # ── places: planets (CelestialBody) and the sub-locations nested under them ──
    pl_cnt = collections.Counter()
    rec_planets = {}
    for r in R:
        found, stack = [], []
        for d, t, fl in r["locs"]:
            stack = [s for s in stack if s[0] < d]
            e = P.get(t) or {}
            if e.get("type") == "CelestialBody":
                stack.append((d, key(e["title"])))
                if "mo" not in fl and "imo" not in fl:
                    found.append(key(e["title"]))
            elif stack and "mo" not in fl and "imo" not in fl:
                found.append(stack[-1][1])
        found = list(dict.fromkeys(found))
        rec_planets[r["id"]] = found
        for k in found:
            pl_cnt[k] += 1
    planet_info = {}
    for t, e in P.items():
        if e.get("type") == "CelestialBody":
            k = key(e["title"])
            cur = planet_info.get(k)
            if not cur or (not cur.get("grid") and e.get("grid")) or e["title"] == k:
                planet_info[k] = e

    # ── records ──
    recs = []
    for r in R:
        leg = bool(r.get("leg"))
        if r["row"] is not None:
            t = (lt if leg else ct).get(r["row"])
        else:
            t = None
        if t is None:
            t = ytime(r["y"])
        lane = LANE_OF.get(r["s"], r["s"])
        c, cr, cf = [], [], []
        seen = set()
        for d, ti, fl in r["chars"]:
            if "mo" in fl or "imo" in fl:
                continue
            k = key(res.get(ti) or ti)
            if k in seen:
                continue
            seen.add(k)
            (cf if "flash" in fl else cr if set(fl) & REMOTE else c).append(pidx[k])
        lg = loglines.get(r["id"])
        sh = SHORT.sub("", r["ti"]) if SHORT.match(r["ti"]) else None
        rec = {
            "id": r["id"], "s": r["s"], "l": lane, "k": r["kind"], "ti": r["ti"], "n": r["n"] or None,
            "se": r["se"], "ep": r["ep"], "ad": r["ad"] or None, "t": round(t, 5), "tt": r["yText"] or fmt_year(r["y"]),
            "pr": "approx" if r["dag"] else ("order" if r["src"] in ("row", "lrow") else "infobox"),
            "lg": lg or r["blurb"] or r["lead"][:260], "lgs": "own" if lg else ("od" if r["blurb"] else "wp"),
            "wp": r["wp"], "c": c,
        }
        if sh and sh != r["ti"]:
            rec["sh"] = sh
        if cr:
            rec["cr"] = cr
        if cf:
            rec["cf"] = cf
        if leg:
            rec["leg"] = 1
        recs.append(rec)
    recs.sort(key=lambda x: (x["t"], x["id"]))
    rec_by_wp = {}
    for x in recs:
        rec_by_wp.setdefault(x["wp"], x)
    evs_of = {r["id"]: {key(t) for d, t, fl in r["evs"] if "mo" not in fl and "imo" not in fl} for r in R}
    objs_of = {r["id"]: {key(t) for d, t, fl in r["objs"] if "mo" not in fl and "imo" not in fl} for r in R}

    places = sorted(pl_cnt, key=lambda k: (-pl_cnt[k], k))
    place_idx = {k: i for i, k in enumerate(places)}
    for x in recs:
        pl = [place_idx[k] for k in rec_planets.get(x["id"], []) if k in place_idx]
        if pl:
            x["pl"] = pl
    places_out = []
    for k in places:
        e = planet_info.get(k, {})
        places_out.append({"k": k, "n": pl_cnt[k], "g": e.get("grid") or None, "r": key(e.get("region") or "") or None,
                           "sec": key(e.get("sector") or "") or None, "sys": key(e.get("system") or "") or None,
                           "cls": e.get("cls") or None})

    # ── curated overlays ──
    def src_recs(item, wp_title=None):
        ids = []
        for s in item.get("sources", []) or []:
            x = rec_by_wp.get(s)
            if x:
                ids.append(x["id"])
        if wp_title:
            k = key(wp_title)
            ids += [rid for rid, ev in evs_of.items() if k in ev]
        return list(dict.fromkeys(ids))

    def timed(item, legends=False):
        y = item.get("y")
        if y is None:
            return None
        item["t"] = round(ytime(y, item.get("frac")), 5)
        if item.get("y2") is not None and item["y2"] != y:
            item["t2"] = round(float(item["y2"]) + 0.999, 5) if item["y2"] > y else None
        item["tText"] = item.get("yText") or fmt_year(y)
        return item

    events, ids = [], set()
    for f in sorted(glob.glob(os.path.join(CUR, "events-e*.json"))):
        for e in load_json(f, []):
            if not isinstance(e, dict) or not timed(e):
                continue
            if e["id"] in ids:
                e["id"] = e["id"] + "-" + os.path.basename(f)[7:9]
            ids.add(e["id"])
            e["recs"] = src_recs(e, e.get("wp"))
            e["people"] = [key(p) for p in e.get("people", []) or []]
            e["places"] = [key(p) for p in e.get("places", []) or []]
            events.append(e)
    levents = []
    for f in sorted(glob.glob(os.path.join(CUR, "legends-events-*.json"))):
        for e in load_json(f, []):
            if not isinstance(e, dict) or not timed(e):
                continue
            if e["id"] in ids:
                e["id"] = e["id"] + "-l"
            ids.add(e["id"])
            e["leg"] = 1
            e["recs"] = src_recs(e)
            e["people"] = [key(p) for p in e.get("people", []) or []]
            e["places"] = [key(p) for p in e.get("places", []) or []]
            levents.append(e)
    events.sort(key=lambda e: e["t"]); levents.sort(key=lambda e: e["t"])

    visions = []
    for v in load_json(os.path.join(CUR, "visions.json"), []):
        legs = []
        for g in v.get("legs", []) or []:
            a, b = g.get("from") or {}, g.get("to") or {}
            if a.get("y") is None or b.get("y") is None:
                continue
            a["t"] = round(ytime(a["y"], a.get("frac")), 5); b["t"] = round(ytime(b["y"], b.get("frac")), 5)
            a["tText"] = a.get("yText") or fmt_year(a["y"]); b["tText"] = b.get("yText") or fmt_year(b["y"])
            legs.append(g)
        if not legs:
            continue
        v["legs"] = legs
        v["experiencers"] = [key(p) for p in v.get("experiencers", []) or []]
        v["reached"] = [key(p) for p in v.get("reached", []) or []]
        rec = rec_by_wp.get(v.get("record") or "")
        v["recs"] = list(dict.fromkeys(([rec["id"]] if rec else []) + src_recs(v)))
        visions.append(v)
    visions.sort(key=lambda v: v["legs"][0]["from"]["t"])

    def fix_points(obj):
        """Any {y, frac} dict nested in an overlay gains t/tText."""
        if isinstance(obj, dict):
            if "y" in obj and isinstance(obj.get("y"), (int, float)):
                obj["t"] = round(ytime(obj["y"], obj.get("frac")), 5)
                obj.setdefault("tText", obj.get("yText") or fmt_year(obj["y"]))
            for v in obj.values():
                fix_points(v)
        elif isinstance(obj, list):
            for v in obj:
                fix_points(v)
        return obj

    lineages = fix_points(load_json(os.path.join(CUR, "lineages.json"), {}))
    for e in lineages.get("apprenticeships", []) or []:
        e["master"], e["apprentice"] = key(e.get("master")), key(e.get("apprentice"))
    for ln in lineages.get("lines", []) or []:
        ln["members"] = [key(m) for m in ln.get("members", []) or []]
        for l in ln.get("links", []) or []:
            l["a"], l["b"] = key(l.get("a")), key(l.get("b"))
    for o in lineages.get("offices", []) or []:
        for h in o.get("holders", []) or []:
            h["who"] = key(h.get("who"))
    artifacts = fix_points(load_json(os.path.join(CUR, "artifacts.json"), []))
    for a in artifacts:
        k = key(a.get("wp") or "")
        a["recs"] = [rid for rid, ob in objs_of.items() if k and k in ob]
        for c in a.get("custody", []) or []:
            c["holder"] = key(c.get("holder") or "")
            rec = rec_by_wp.get(c.get("record") or "")
            if rec:
                c["rec"] = rec["id"]
    anomalies = fix_points(load_json(os.path.join(CUR, "anomalies.json"), []))
    for a in anomalies:
        a["recs"] = src_recs(a)
    personnel = fix_points(load_json(os.path.join(CUR, "personnel.json"), []))
    for d in personnel:
        d["wp"] = key(d.get("wp") or "")

    portraits = load_json(os.path.join(ROOT, "data", "portraits.json"), {})
    people_out = []
    for k in people:
        p = {"k": k, "n": cnt[k]}
        if k in portraits:
            p["im"] = portraits[k]
        people_out.append(p)

    A = {
        "meta": {"built": datetime.date.today().isoformat(), "records": len(recs), "people": len(people),
                 "source": "Wookieepedia (starwars.fandom.com), CC BY-SA 3.0"},
        "lanes": [{"id": i, "label": a, "sub": b, "tok": c, "nar": NARROW.get(i, a.split(" ")[0])} for i, a, b, c in LANES],
        "series": SERIES, "records": recs, "people": people_out, "places": places_out,
        "events": events, "levents": levents, "visions": visions, "lineages": lineages,
        "artifacts": artifacts, "anomalies": anomalies, "personnel": personnel,
    }
    os.makedirs(os.path.join(ROOT, "docs", "data"), exist_ok=True)
    out = os.path.join(ROOT, "docs", "data", "archive.json")
    json.dump(A, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"archive.json {os.path.getsize(out) / 1e6:.2f} MB · {len(recs)} records · {len(people)} people · "
          f"{len(places_out)} places ({sum(1 for p in places_out if p['g'])} gridded) · {len(events)} events · "
          f"{len(levents)} legends events · {len(visions)} visions · {len(artifacts)} artifacts · "
          f"{len(anomalies)} anomalies · {len(personnel)} dossiers · {sum(1 for x in recs if x['lgs'] == 'own')} own loglines")


if __name__ == "__main__":
    main()
