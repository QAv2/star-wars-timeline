"""Portraits for people: Wookieepedia lead images → square crops hosted at docs/img/p/<hash>.jpg.

  python3 tools/fetch_portraits.py resolve    # pageimages for everyone worth a portrait → cache/wp/pageimages.json
  python3 tools/fetch_portraits.py download   # fetch + crop + write data/portraits.json {person key: hash}
"""
import sys, os, json, hashlib, io, time, concurrent.futures as cf
import requests
sys.path.insert(0, os.path.dirname(__file__))
import wp

ROOT = wp.ROOT
OUT = os.path.join(ROOT, "docs", "img", "p")
PI = os.path.join(wp.CACHE, "pageimages.json")
MAP = os.path.join(ROOT, "data", "portraits.json")
PINS = os.path.join(ROOT, "data", "portrait_pins.json")   # {person key: explicit File: title} overrides


def wanted():
    A = json.load(open(os.path.join(ROOT, "docs", "data", "archive.json")))
    keys = [p["k"] for p in A["people"] if p["n"] >= 2]
    for d in A.get("personnel", []):
        keys.append(d["wp"])
    for v in A.get("visions", []):
        keys += v.get("experiencers", []) + v.get("reached", [])
    L = A.get("lineages") or {}
    for e in L.get("apprenticeships", []):
        keys += [e.get("master"), e.get("apprentice")]
    for o in L.get("offices", []):
        keys += [h.get("who") for h in o.get("holders", [])]
    for a in A.get("artifacts", []):
        keys += [c.get("holder") for c in a.get("custody", [])]
    return [k for k in dict.fromkeys(keys) if k]


def resolve():
    memo = json.load(open(PI)) if os.path.exists(PI) else {}
    todo = [k for k in wanted() if k not in memo]
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        d = wp._get({"action": "query", "prop": "pageimages", "piprop": "thumbnail|name", "pithumbsize": "240",
                     "redirects": "1", "titles": "|".join(chunk)})
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {n["from"]: n["to"] for n in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for k in chunk:
            r = redir.get(norm.get(k, k), norm.get(k, k))
            p = pages.get(r) or {}
            memo[k] = {"src": (p.get("thumbnail") or {}).get("source"), "file": p.get("pageimage")}
        time.sleep(0.3)
    json.dump(memo, open(PI, "w"))
    print(len(memo), "resolved;", sum(1 for v in memo.values() if v["src"]), "with images")


def crop(data):
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    s = min(w, h)
    left = (w - s) // 2
    top = 0 if h > w * 1.15 else (h - s) // 2   # tall portraits: keep the head (top), not the torso
    im = im.crop((left, top, left + s, top + s)).resize((128, 128), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=80, optimize=True, progressive=True)
    return b.getvalue()


def download():
    memo = json.load(open(PI))
    pins = json.load(open(PINS)) if os.path.exists(PINS) else {}
    os.makedirs(OUT, exist_ok=True)
    S = requests.Session(); S.headers["User-Agent"] = wp.UA
    out = json.load(open(MAP)) if os.path.exists(MAP) else {}
    jobs = []
    for k, v in memo.items():
        src = v.get("src")
        if k in pins:
            f = pins[k]
            if not f:
                out.pop(k, None); continue
            d = wp._get({"action": "query", "titles": f if f.startswith("File:") else "File:" + f, "prop": "imageinfo",
                         "iiprop": "url", "iiurlwidth": "240"})
            ii = (d["query"]["pages"][0].get("imageinfo") or [{}])[0]
            src = ii.get("thumburl") or ii.get("url")
        if not src:
            continue
        h = hashlib.sha1(src.encode()).hexdigest()[:10]
        if os.path.exists(os.path.join(OUT, h + ".jpg")):
            out[k] = h; continue
        jobs.append((k, src, h))

    def one(job):
        k, src, h = job
        for i in range(3):
            try:
                r = S.get(src, timeout=40)
                if r.status_code == 200:
                    open(os.path.join(OUT, h + ".jpg"), "wb").write(crop(r.content))
                    return k, h
            except Exception:
                time.sleep(1 + i)
        return k, None

    fails = 0
    with cf.ThreadPoolExecutor(4) as ex:
        for k, h in ex.map(one, jobs):
            if h:
                out[k] = h
            else:
                fails += 1
    json.dump(out, open(MAP, "w"), ensure_ascii=False, indent=0, sort_keys=True)
    print(len(out), "portraits;", len(jobs), "downloaded now;", fails, "failed")


if __name__ == "__main__":
    {"resolve": resolve, "download": download}[sys.argv[1]]()
