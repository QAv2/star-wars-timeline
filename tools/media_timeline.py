"""Parse Wookieepedia's in-universe media timelines into ordered rows.

canon_rows(): "Timeline of canon media" — {{MediaRow|TYPE|class|date=...}} then `|| title` and `|| release`.
Each row: {i (order), type, cls, date (raw wikitext, blank rows inherit the previous date), title,
           tmpl (series template or None), release, dagger (exact placement unknown), adaptation, unpublished}.
"""
import re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import wp

FILM_ROMAN = {
    "I": "Star Wars: Episode I The Phantom Menace", "II": "Star Wars: Episode II Attack of the Clones",
    "III": "Star Wars: Episode III Revenge of the Sith", "IV": "Star Wars: Episode IV A New Hope",
    "V": "Star Wars: Episode V The Empire Strikes Back", "VI": "Star Wars: Episode VI Return of the Jedi",
    "VII": "Star Wars: Episode VII The Force Awakens", "VIII": "Star Wars: Episode VIII The Last Jedi",
    "IX": "Star Wars: Episode IX The Rise of Skywalker",
}


def cell_title(cell):
    """Return (title, template) for a title cell, or (None, None)."""
    cell = cell.strip()
    m = re.search(r"\{\{CW\|(\d+)\}\}", cell)
    if m:
        return f"Chapter {m.group(1)} (Star Wars: Clone Wars)", "CW"
    m = re.search(r"\{\{Film\|([IVX]+)\}\}", cell)
    if m:
        return FILM_ROMAN.get(m.group(1)), "Film"
    m = re.match(r"\{\{([A-Za-z0-9]+)\|", cell)
    if m and m.group(1) not in ("StoryCite", "InsiderCite"):
        end = wp._balanced(cell, 0)
        p = wp.split_params(cell[2 + len(m.group(1)):end - 2])
        t = p.get("1") or p.get("story") or ""
        return (t.strip() or None), m.group(1)
    m = re.search(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", cell)
    if m:
        return m.group(1).strip(), None
    return None, None


def canon_rows():
    text = wp.page("Timeline of canon media")["text"]
    rows, last_date = [], ""
    for m in re.finditer(r"\{\{MediaRow\|", text):
        end = wp._balanced(text, m.start())
        p = wp.split_params(text[m.start() + 2:end - 2])
        after = text[end:end + 2000].split("\n")
        cells = [l for l in after[1:6] if l.startswith("||")]
        if not cells:
            continue
        date = p.get("date", "")
        if not wp.clean(date).strip():
            date = last_date
        else:
            last_date = date
        title, tmpl = cell_title(cells[0][2:])
        rel = cells[1][2:].strip() if len(cells) > 1 else ""
        rows.append({"i": len(rows), "type": p.get("2"), "cls": p.get("3"),
                     "date": date, "title": title, "tmpl": tmpl,
                     "release": rel if re.match(r"\d{4}-\d\d-\d\d", rel) else "",
                     "dagger": "&dagger;" in cells[0], "adaptation": p.get("adaptation") == "1",
                     "unpublished": p.get("unpublished") == "1"})
    return rows


YEAR_RE = re.compile(r"\[\[((?:\d[\d,]*)?\.?\d+) (BBY|ABY)(?:/Legends)?(?:\|[^\]]*)?\]\]|((?:\d[\d,]*)?\.?\d+)\s*(BBY|ABY)")


def years(date_wikitext):
    """All years mentioned, in order, as signed ints (BBY negative). Handles '[[32 BBY|32]]–[[19 BBY]]'."""
    s = re.sub(r"<ref[^>/]*/>", "", date_wikitext or "")
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    out = []
    for m in YEAR_RE.finditer(s):
        n, era = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        v = float(n.replace(",", ""))
        v = int(v) if v == int(v) else v
        out.append(-v if era == "BBY" else v)
    return out


def date_text(date_wikitext):
    s = wp.clean(date_wikitext).replace("&ndash;", "–").replace("&mdash;", "—")
    s = re.sub(r"\s*[–—]\s*", " – ", s)                     # spaced dash between two full dates
    s = re.sub(r"\b(\d[\d,]*) – (\d[\d,]*) (BBY|ABY)", r"\1–\2 \3", s)  # "32 – 19 BBY" → "32–19 BBY"
    return re.sub(r"\s+", " ", s).strip()


if __name__ == "__main__":
    import collections
    rows = canon_rows()
    print(len(rows), "rows")
    c = collections.Counter((r["type"], r["tmpl"]) for r in rows if r["type"] in ("TV", "F"))
    for k, v in c.most_common():
        print(v, k)
    for r in rows:
        if r["type"] in ("F",):
            print(r["i"], r["title"], "|", date_text(r["date"]), years(r["date"]), r["release"], "UNPUB" if r["unpublished"] else "")


LROW = re.compile(r'^\|\s*(.*?)\s*\|\|-\s*class="([\w-]+)"\s*\|\s*([A-Z]+)\s*\|\|\s*(.*)$')


def legends_rows():
    """'Timeline of Legends media' rows: '| [[date]] ||- class="tv" | TV || Title' then '|| release'."""
    text = wp.page("Timeline of Legends media")["text"]
    L = text.splitlines()
    rows, last_date = [], ""
    for i, l in enumerate(L):
        m = LROW.match(l)
        if not m:
            continue
        date, cls, typ, cell = m.groups()
        if not wp.clean(date).strip():
            date = last_date
        else:
            last_date = date
        title, tmpl = cell_title(cell)
        rel = ""
        for nxt in L[i + 1:i + 4]:
            if nxt.startswith("||"):
                rel = nxt[2:].strip(); break
        rows.append({"i": len(rows), "type": typ, "cls": cls, "date": date, "title": title, "tmpl": tmpl,
                     "release": rel if re.match(r"\d{4}-\d\d-\d\d", rel) else "", "dagger": "&dagger;" in cell,
                     "adaptation": False, "unpublished": False})
    return rows
