"""Tiny Wookieepedia (starwars.fandom.com) MediaWiki client with an on-disk cache (cache/wp/).

Library use: wikitext_many(titles), category_members(cat), infobox(text), clean(text), lead(text).
CLI (research agents use this; everything is cached, so repeat calls are free):
  python3 tools/wp.py get "Title" [--grep REGEX] [--head N]   wikitext (resolved title on line 1)
  python3 tools/wp.py lead "Title" ...                       infobox fields + first paragraph, cleaned
  python3 tools/wp.py section "Title" "Heading"               one section, cleaned
  python3 tools/wp.py exists "Title" ...                      OK/MISSING + resolved title per line
  python3 tools/wp.py search "words" [N]                      full-text search, top N titles
  python3 tools/wp.py lines "Title" START END [--clean]       raw wikitext lines START..END (1-based, inclusive)
"""
import json, os, re, sys, time, hashlib
import requests

API = "https://starwars.fandom.com/api.php"
UA = "GalacticArchiveBuilder/0.1 (personal fan timeline; github.com/qav2)"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache", "wp")
S = requests.Session()
S.headers["User-Agent"] = UA


def _get(params, tries=5):
    params = dict(params, format="json", formatversion="2")
    for i in range(tries):
        try:
            r = S.get(API, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
        except (requests.RequestException, ValueError):
            pass
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"WP API failed: {params}")


def _cpath(title):
    h = hashlib.sha1(title.encode()).hexdigest()[:10]
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", title)[:80]
    return os.path.join(CACHE, "pages", f"{safe}.{h}.json")


def wikitext_many(titles, refresh=False):
    """Return {requested_title: {"title": resolved, "text": wikitext|None}}."""
    os.makedirs(os.path.join(CACHE, "pages"), exist_ok=True)
    out, todo = {}, []
    for t in dict.fromkeys(titles):
        p = _cpath(t)
        if not refresh and os.path.exists(p):
            out[t] = json.load(open(p))
        else:
            todo.append(t)
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        d = _get({"action": "query", "prop": "revisions", "rvprop": "content",
                  "rvslots": "main", "redirects": "1", "titles": "|".join(chunk)})
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {n["from"]: n["to"] for n in q.get("redirects", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in chunk:
            r = norm.get(t, t)
            r = redir.get(r, r)
            p = pages.get(r)
            text = None
            if p and not p.get("missing") and p.get("revisions"):
                text = p["revisions"][0]["slots"]["main"]["content"]
            rec = {"title": r, "text": text}
            json.dump(rec, open(_cpath(t), "w"))
            out[t] = rec
        time.sleep(0.4)
    return out


def resolve_many(titles):
    """Canonical titles through redirects (no page content), cached in cache/wp/resolve.json."""
    f = os.path.join(CACHE, "resolve.json")
    memo = json.load(open(f)) if os.path.exists(f) else {}
    todo = [t for t in dict.fromkeys(titles) if t and t not in memo]
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        d = _get({"action": "query", "redirects": "1", "titles": "|".join(chunk)})
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {n["from"]: n["to"] for n in q.get("redirects", [])}
        missing = {p["title"] for p in q.get("pages", []) if p.get("missing")}
        for t in chunk:
            r = norm.get(t, t)
            r = redir.get(r, r)
            memo[t] = None if r in missing else r
        if i % 1000 == 0:
            json.dump(memo, open(f, "w"))
        time.sleep(0.2)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(memo, open(f, "w"))
    return {t: memo.get(t) for t in titles}


def page(title, refresh=False):
    return wikitext_many([title], refresh)[title]


def category_members(cat, ns="0", types="page"):
    out, cont = [], {}
    while True:
        d = _get(dict({"action": "query", "list": "categorymembers", "cmtitle": cat,
                       "cmlimit": "500", "cmnamespace": ns, "cmtype": types}, **cont))
        out += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" in d:
            cont = d["continue"]
        else:
            return out


def search(q, n=10):
    d = _get({"action": "query", "list": "search", "srsearch": q, "srlimit": str(n)})
    return [s["title"] for s in d["query"]["search"]]


# ---------- wikitext helpers ----------

def _balanced(text, start):
    """Index just past the '}}' closing the '{{' at text[start]."""
    depth, i = 0, start
    while i < len(text) - 1:
        two = text[i:i + 2]
        if two == "{{":
            depth += 1; i += 2; continue
        if two == "}}":
            depth -= 1; i += 2
            if depth == 0:
                return i
            continue
        i += 1
    return len(text)


def template_blocks(text, name_re):
    """Yield (name, body) for top-level-ish templates whose name matches name_re."""
    for m in re.finditer(r"\{\{\s*(" + name_re + r")\s*(?=[|\n}])", text):
        end = _balanced(text, m.start())
        yield m.group(1), text[m.end():end - 2]


def split_params(body):
    """Split a template body on top-level '|' → {key: value} (positional as '1','2',…)."""
    parts, depth, cur, i = [], 0, [], 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1; cur.append(two); i += 2; continue
        if two in ("}}", "]]"):
            depth -= 1; cur.append(two); i += 2; continue
        if body[i] == "|" and depth == 0:
            parts.append("".join(cur)); cur = []; i += 1; continue
        cur.append(body[i]); i += 1
    parts.append("".join(cur))
    out, pos = {}, 0
    for p in parts[1:] if parts and not parts[0].strip() else parts:
        if "=" in p and re.match(r"^\s*[\w \-]+\s*=", p):
            k, v = p.split("=", 1)
            out[k.strip()] = v.strip()
        else:
            pos += 1
            out[str(pos)] = p.strip()
    return out


INFOBOX_RE = (r"TelevisionEpisode|Movie|Film|CelestialBody|StarSystem|Sector|Character|Individual|Droid|Planet|Battle|Mission|Event|War|"
              r"Organization|Government|Weapon|Lightsaber|Artifact|Device|Ship|Starship|Vehicle|Species|"
              r"Book|Novel|ComicBook|Comic|Game|VideoGame|Holocron|Location|City|System|Sector|Region|"
              r"Religion|Title|Position|Treaty|Law|Duel|Campaign|Holiday|Era|Media|Television|Series|Short story")


def infobox(text):
    for name, body in template_blocks(text or "", INFOBOX_RE):
        if "\n|" in body or "\n |" in body:
            d = split_params(body)
            d["_type"] = name
            return d
    return {}


def clean(s):
    """Wikitext → plain-ish text (drops refs/templates, keeps link labels)."""
    if not s:
        return ""
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"</?[a-z][^>]*>", "", s)
    for _ in range(3):  # a few simple templates keep their meaning
        s = re.sub(r"\{\{Film\|(\w+)\}\}", lambda m: f"Star Wars: Episode {m.group(1)}", s)
        s = re.sub(r"\{\{C\|([^{}]*)\}\}", r"(\1)", s)
        s = re.sub(r"\{\{(?:Mo|Imo|1st|1stm|1stID|Hologram|Flash|Vision|Voice|Dream|Po|Echo|Fantasy|Imo)\}\}",
                   "", s)
        s = re.sub(r"\{\{[A-Za-z]+\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:File|Image|Category):[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", s)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def lead(text):
    """First prose paragraph after the infobox/quotes."""
    body = text or ""
    for block in re.split(r"\n\s*\n", body):
        b = block.strip()
        if not b or b.startswith(("{{", "|", "}}", "[[File", "[[Image", "==", "*", "<")):
            # a paragraph may start after a template on the same block
            m = re.search(r"\n([^{|}\n=*<][^\n]{60,})", "\n" + b)
            if m and "'''" in m.group(1):
                return clean(m.group(1))
            continue
        if len(b) > 60:
            return clean(b)
    return ""


def section(text, heading):
    m = re.search(r"^(=+)\s*" + re.escape(heading) + r"\s*\1\s*$", text or "", flags=re.M | re.I)
    if not m:
        return ""
    lvl = len(m.group(1))
    rest = text[m.end():]
    n = re.search(r"^={1,%d}[^=].*?=+\s*$" % lvl, rest, flags=re.M)
    return rest[:n.start()] if n else rest


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(0)
    cmd, args = a[0], a[1:]
    if cmd == "get":
        grep = head = None
        if "--grep" in args:
            i = args.index("--grep"); grep = args[i + 1]; del args[i:i + 2]
        if "--head" in args:
            i = args.index("--head"); head = int(args[i + 1]); del args[i:i + 2]
        for t, rec in wikitext_many(args).items():
            print(f"### {rec['title'] if rec['text'] else 'MISSING: ' + t}")
            txt = rec["text"] or ""
            lines = txt.splitlines()
            if grep:
                lines = [f"{i+1}: {l}" for i, l in enumerate(lines) if re.search(grep, l, re.I)]
            print("\n".join(lines[:head] if head else lines))
    elif cmd == "lead":
        for t, rec in wikitext_many(args).items():
            print(f"### {rec['title'] if rec['text'] else 'MISSING: ' + t}")
            ib = infobox(rec["text"] or "")
            for k, v in ib.items():
                cv = clean(v)
                if cv and not k.startswith(("image", "imagebg")):
                    print(f"  {k}: {cv[:300]}")
            print(lead(rec["text"] or "")[:1500])
    elif cmd == "section":
        rec = page(args[0])
        print(clean(section(rec["text"] or "", args[1]))[:20000])
    elif cmd == "exists":
        for t, rec in wikitext_many(args).items():
            print(("OK      " if rec["text"] else "MISSING ") + t + ("" if rec["title"] == t else f"  ->  {rec['title']}"))
    elif cmd == "lines":
        rec = page(args[0]); lo, hi = int(args[1]), int(args[2])
        for i, l in enumerate((rec["text"] or "").splitlines()[lo - 1:hi], lo):
            print(f"{i}: {clean(l) if '--clean' in args else l}")
    elif cmd == "search":
        for t in search(args[0], int(args[1]) if len(args) > 1 else 10):
            print(t)
    else:
        print(__doc__)
