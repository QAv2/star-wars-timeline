"""Parse cached screen-record pages → build/records.json (placement inputs, cast, locations, blurbs)."""
import sys, os, re, json, datetime, collections
sys.path.insert(0, os.path.dirname(__file__))
import wp, media_timeline as mt

ROOT = wp.ROOT
FILM_IDS = {
    "Star Wars: Episode I The Phantom Menace": ("tpm", "Episode I", 1),
    "Star Wars: Episode II Attack of the Clones": ("aotc", "Episode II", 2),
    "Star Wars: The Clone Wars (film)": ("tcwf", "The Clone Wars", None),
    "Star Wars: Episode III Revenge of the Sith": ("rots", "Episode III", 3),
    "Solo: A Star Wars Story": ("solo", "Solo", None),
    "Rogue One: A Star Wars Story": ("r1", "Rogue One", None),
    "Star Wars: Episode IV A New Hope": ("anh", "Episode IV", 4),
    "Star Wars: Episode V The Empire Strikes Back": ("esb", "Episode V", 5),
    "Star Wars: Episode VI Return of the Jedi": ("rotj", "Episode VI", 6),
    "Star Wars: The Mandalorian and Grogu": ("mag", "The Mandalorian and Grogu", None),
    "Star Wars: Episode VII The Force Awakens": ("tfa", "Episode VII", 7),
    "Star Wars: Episode VIII The Last Jedi": ("tlj", "Episode VIII", 8),
    "Star Wars: Episode IX The Rise of Skywalker": ("tros", "Episode IX", 9),
}
FILM_TITLES = {  # display titles
    "tpm": "The Phantom Menace", "aotc": "Attack of the Clones", "tcwf": "The Clone Wars", "rots": "Revenge of the Sith",
    "solo": "Solo: A Star Wars Story", "r1": "Rogue One: A Star Wars Story", "anh": "A New Hope",
    "esb": "The Empire Strikes Back", "rotj": "Return of the Jedi", "mag": "The Mandalorian and Grogu",
    "tfa": "The Force Awakens", "tlj": "The Last Jedi", "tros": "The Rise of Skywalker"}
WORDNUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
FLAGMAP = {"Mo": "mo", "mo": "mo", "Imo": "imo", "Hologram": "holo", "Ho": "holo", "Holocron": "holo", "Flash": "flash",
           "Voice": "voice", "Vo": "voice", "Vision": "vision", "Corpse": "corpse", "Ghost": "ghost", "Po": "po",
           "Del": "del", "Wreck": "wreck", "Unborn": "unborn", "AD": "ad", "Ret": "ret",
           "1st": "1st", "1stm": "1stm", "1stID": "1stid", "1stp": "1stp", "1stc": "1stc", "1stcm": "1stcm", "ID": "id"}


def num(v):
    v = wp.clean(v or "")
    m = re.search(r"\d+", v)
    if m:
        return int(m.group())
    w = re.search(r"[A-Za-z]+", v)
    return WORDNUM.get(w.group().lower()) if w else None


def iso(v):
    s = wp.clean((v or "").split("\n")[0]).lstrip("*").strip()
    s = re.sub(r"\s*\(.*?\)", "", s).strip()
    for fmt in ("%B %d, %Y", "%d %B %Y", "%B %Y", "%Y"):
        try:
            return datetime.datetime.strptime(s.split(" {")[0].strip(" ,"), fmt).date().isoformat()
        except ValueError:
            pass
    m = re.search(r"([A-Z][a-z]+ \d{1,2}), (\d{4})", s)
    if m:
        try:
            return datetime.datetime.strptime(m.group(1) + ", " + m.group(2), "%B %d, %Y").date().isoformat()
        except ValueError:
            pass
    return ""


def app_list(block):
    """'*[[T|x]] {{Mo}}' lines → [(depth, title, [flags])] (unlinked lines dropped)."""
    out = []
    for line in (block or "").splitlines():
        m = re.match(r"^(\*+)\s*(.*)$", line.strip())
        if not m:
            continue
        depth, rest = len(m.group(1)), m.group(2)
        lk = re.search(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]", rest)
        if not lk or rest.find("[[") > 3 and not rest.startswith(("''", '"')):
            continue
        t = lk.group(1).strip()
        if t.startswith(("File:", "Category:")):
            continue
        fl = sorted({FLAGMAP[f] for f in re.findall(r"\{\{([A-Za-z0-9]+)(?:\|[^{}]*)?\}\}", rest) if f in FLAGMAP})
        out.append((depth, t[0].upper() + t[1:], fl))
    return out


def blurb(txt):
    od = wp.clean(wp.section(txt, "Official description")).strip()
    od = re.sub(r"\s+", " ", od)
    return od if len(od) > 25 else ""


LFLM_IDS = {"The Star Wars Holiday Special": "holiday", "The Story of the Faithful Wookiee": "faithful-wookiee",
            "Caravan of Courage: An Ewok Adventure": "caravan", "Ewoks: The Battle for Endor": "endor",
            "The Great Heep": "great-heep"}


def legends_record(code, title, rec, txt, row):
    ib = wp.infobox(txt)
    apps = list(wp.template_blocks(txt, r"App"))
    ap = wp.split_params(apps[0][1]) if apps else {}
    se, ep = num(ib.get("season")), num(ib.get("episode"))
    if code == "CW03":
        ep = int(re.search(r"Chapter (\d+)", title).group(1)); se = 1 if ep <= 20 else 2
        ti = f"Chapter {ep}"
    else:
        ti = wp.clean(ib.get("title", "")).strip('"“”') or re.sub(r" \((episode|film)\)$", "", title)
    kind = "film" if ib.get("_type") == "Movie" or code == "LFLM" else "ep"
    if code == "LFLM" or kind == "film":
        rid = "lf-" + LFLM_IDS.get(title, re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:28]); n = ""
    else:
        n = f"{se}x{ep:02d}" if se and ep is not None else (f"{ep:02d}" if ep is not None else "")
        rid = code.lower() + "-" + (n or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:28])
    ys = mt.years(row["date"]) if row else []
    tl = ib.get("timeline", "")
    return {"id": rid, "s": code, "ti": re.sub(r"\s+", " ", ti), "kind": kind, "wp": rec["title"], "se": se, "ep": ep,
            "n": n, "ad": iso(ib.get("airdate") or ib.get("release date")), "row": row["i"] if row else None,
            "dag": bool(row and row["dagger"]), "y": ys[0] if ys else None, "y2": ys[-1] if len(ys) > 1 else None,
            "yText": mt.date_text(row["date"]) if row else mt.date_text(tl), "src": "lrow" if ys else "",
            "tlText": mt.date_text(tl), "leg": True,
            "chars": app_list(ap.get("l-characters") or ap.get("characters") or ""),
            "locs": app_list(ap.get("l-locations") or ap.get("locations") or ""),
            "blurb": blurb(txt), "lead": wp.lead(txt)[:600],
            "evs": app_list(ap.get("l-events") or ap.get("events") or ""),
            "objs": [x for k in ("technology", "vehicles", "miscellanea", "l-technology", "l-vehicles", "l-miscellanea")
                     for x in app_list(ap.get(k) or "")]}


def main():
    pages = json.load(open(os.path.join(wp.CACHE, "pagelist.json")))
    rows = mt.canon_rows()
    lrows = mt.legends_rows()
    LEG = {"CW03", "DRD", "EWK", "LFLM"}
    lby = {}
    for r in lrows:
        if r["title"] and r["title"] not in lby:
            lby[r["title"]] = r
    by_title = {}
    listed = {t for _, t in pages}
    for r in rows:
        if r["title"] and r["title"] not in by_title:
            by_title[r["title"]] = r
            if r["title"] in listed:  # rows name pages by template arg; key them by resolved title too
                by_title.setdefault(wp.page(r["title"])["title"], r)
    out, skipped, seen = [], [], set()
    for code, title in pages:
        rec = wp.page(title)
        txt = rec["text"] or ""
        if " / " in title and code == "YJA" or rec["title"] in seen:
            skipped.append(title); continue
        seen.add(rec["title"])
        if code in LEG:
            lr = legends_record(code, title, rec, txt, lby.get(title))
            if lr["chars"]:  # compilation films carry no App section: skip them
                out.append(lr)
            continue
        if not (by_title.get(title) or by_title.get(rec["title"])):
            skipped.append(title); continue  # not on the in-universe timeline: specials, unreleased
        if re.match(r"Star Wars Forces of Destiny: Volume \d", rec["title"]):
            skipped.append(title); continue  # DVD compilations of shorts already on record
        cats = re.findall(r"\[\[Category:([^\]|]+)(?:\|([^\]]*))?\]\]", txt)
        short = any(c.endswith(" shorts") for c, _ in cats)
        ib = wp.infobox(txt)
        apps = list(wp.template_blocks(txt, r"App"))
        ap = wp.split_params(apps[0][1]) if apps else {}
        ch = ap.get("c-characters") or ap.get("characters") or ""
        lo = ap.get("c-locations") or ap.get("locations") or ""
        row = by_title.get(title) or by_title.get(rec["title"])
        if code == "FLM":
            fid, short, epno = FILM_IDS[title]
            rid, se, ep, n = "film-" + fid, None, epno, short
            ti = FILM_TITLES[fid]
            ad = iso(ib.get("release date"))
        else:
            se, ep = num(ib.get("season")), num(ib.get("episode"))
            prod = wp.clean(ib.get("production", ""))
            seg = ""
            sraw = wp.clean(ib.get("season", ""))
            if code == "TCW" and re.search(r"Seven|Final Season", sraw):
                se = 7
            elif code == "TCW" and "Legacy" in sraw:
                se = "L"
            if code == "YJA":
                m = re.search(r"(\d)(\d\d)([AB])", prod)
                if m:
                    se, ep, seg = int(m.group(1)), int(m.group(2)), m.group(3).lower()
            if se is None and code not in ("OWK", "ACO", "SKC", "BOBF", "TOTJ", "TOTE", "TOTU"):
                se = 1 if code not in ("TCW",) else None
            ti = wp.clean(ib.get("title", "")).strip('"“”') or re.sub(r" \((episode|short|.*?)\)$", "", title)
            ti = re.sub(r"\s+", " ", ti)
            if se == "L" and ep is None:
                ep = {"A Death on Utapau": 1, "In Search of the Crystal": 2, "Crystal Crisis": 3, "The Big Bang": 4}.get(title)
            if short:
                se, n = "S", f"s{ep:02d}" if ep is not None else ""
            else:
                n = (f"{se}x{ep:02d}{seg}" if se not in (None, "L") and ep is not None else
                     (f"L{ep}" if se == "L" and ep else (f"{ep:02d}" if ep is not None else "")))
            rid = code.lower() + "-" + (n or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-"))
            ad = iso(ib.get("airdate"))
        tl = ib.get("timeline", "")
        ys = mt.years(row["date"]) if row else []
        src = "row" if ys else ""
        if not ys:
            ys = mt.years(tl.split("\n")[0]) or mt.years(tl); src = "ib" if ys else ""
        out.append({
            "id": rid, "s": code, "ti": ti, "kind": "film" if code == "FLM" else ("short" if short or code == "FOD" else "ep"), "wp": rec["title"], "se": se, "ep": ep, "n": n, "ad": ad,
            "row": row["i"] if row else None, "dag": bool(row and row["dagger"]),
            "y": ys[0] if ys else None, "y2": ys[-1] if len(ys) > 1 else None,
            "yText": mt.date_text(row["date"]) if row and src == "row" else mt.date_text(tl.split("\n")[0]),
            "src": src, "tlText": mt.date_text(tl),
            "chars": app_list(ch), "locs": app_list(lo), "blurb": blurb(txt), "lead": wp.lead(txt)[:600],
            "evs": app_list(ap.get("c-events") or ap.get("events") or ""),
            "objs": [x for k in ("technology", "vehicles", "miscellanea", "c-technology", "c-vehicles", "c-miscellanea")
                     for x in app_list(ap.get(k) or "")],
        })
    yja = collections.defaultdict(list)  # YJA: two segments share an episode number; letter them by in-universe order
    for r in out:
        if r["s"] == "YJA" and r["n"] and r["n"][-1].isdigit():
            yja[r["n"]].append(r)
    for k, rs in yja.items():
        if len(rs) > 1:
            for j, r in enumerate(sorted(rs, key=lambda r: (r["ad"], r["row"] or 0))):
                r["n"] += "ab"[j] if j < 2 else str(j); r["id"] = "yja-" + r["n"]
    ids = collections.Counter(r["id"] for r in out)
    dup = [i for i, c in ids.items() if c > 1]
    for r in out:
        if r["id"] in dup:
            r["id"] += "-" + re.sub(r"[^a-z0-9]+", "-", r["wp"].lower()).strip("-")[:24]
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, "build", "records.json"), "w"), ensure_ascii=False)
    c = collections.Counter(r["src"] or "NONE" for r in out)
    print(len(out), "records;", "skipped", len(skipped), "combined pages; placement src:", dict(c))
    print("dup ids fixed:", dup[:8])
    print("no date:", [(r["s"], r["wp"]) for r in out if r["y"] is None][:20])
    print("no chars:", [(r["s"], r["wp"]) for r in out if not r["chars"]][:20])


if __name__ == "__main__":
    main()
