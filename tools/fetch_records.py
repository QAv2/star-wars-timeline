"""Fetch every screen record (canon films + series episodes, Legends screen media) into cache/wp.

Canon order/dates come from "Timeline of canon media"; the page list is its TV/F rows for the series we
carry, unioned with each series' episode category so nothing the timeline omits is lost.
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(__file__))
import wp, media_timeline as mt

# timeline template -> (series code, episode category)
SERIES = {
    "TCW": ("TCW", "Star Wars: The Clone Wars episodes"),
    "Rebels": ("REB", "Star Wars Rebels episodes"),
    "Resistance": ("RES", "Star Wars Resistance episodes"),
    "TBB": ("TBB", "Star Wars: The Bad Batch episodes"),
    "TheMandalorian": ("MAN", "Star Wars: The Mandalorian episodes"),
    "BOBF": ("BOBF", "Star Wars: The Book of Boba Fett episodes"),
    "Kenobi": ("OWK", "Star Wars: Obi-Wan Kenobi episodes"),
    "Andor": ("AND", "Star Wars: Andor episodes"),
    "Ahsoka": ("AHS", "Star Wars: Ahsoka episodes"),
    "Acolyte": ("ACO", "Star Wars: The Acolyte episodes"),
    "SkeletonCrew": ("SKC", "Star Wars: Skeleton Crew episodes"),
    "TOTJ": ("TOTJ", "Star Wars: Tales of the Jedi episodes"),
    "TOTE": ("TOTE", "Star Wars: Tales of the Empire episodes"),
    "TOTU": ("TOTU", "Star Wars: Tales of the Underworld episodes"),
    "MSL": ("MSL", "Star Wars: Maul - Shadow Lord episodes"),
    "YJA": ("YJA", "Young Jedi Adventures episodes"),
    "FOD": ("FOD", "Star Wars Forces of Destiny episodes"),
}
FILMS = ["Star Wars: Episode I The Phantom Menace", "Star Wars: Episode II Attack of the Clones",
         "Star Wars: The Clone Wars (film)", "Star Wars: Episode III Revenge of the Sith",
         "Solo: A Star Wars Story", "Rogue One: A Star Wars Story", "Star Wars: Episode IV A New Hope",
         "Star Wars: Episode V The Empire Strikes Back", "Star Wars: Episode VI Return of the Jedi",
         "Star Wars: The Mandalorian and Grogu", "Star Wars: Episode VII The Force Awakens",
         "Star Wars: Episode VIII The Last Jedi", "Star Wars: Episode IX The Rise of Skywalker"]

if __name__ == "__main__":
    refresh = "--refresh" in sys.argv
    if refresh:
        wp.wikitext_many(["Timeline of canon media", "Timeline of Legends media"], refresh=True)
    rows = mt.canon_rows()
    catf = os.path.join(wp.CACHE, "categories.json")
    cats = json.load(open(catf)) if os.path.exists(catf) and not refresh else {}
    for tm, (code, cat) in SERIES.items():
        if code not in cats:
            cats[code] = wp.category_members("Category:" + cat)
    json.dump(cats, open(catf, "w"), indent=1)
    pages = [("FLM", t) for t in FILMS]
    seen = set(FILMS)
    for r in rows:
        if r["type"] == "TV" and r["tmpl"] in SERIES and r["title"] and r["title"] not in seen:
            pages.append((SERIES[r["tmpl"]][0], r["title"])); seen.add(r["title"])
    for tm, (code, cat) in SERIES.items():
        for t in cats[code]:
            if t not in seen:
                pages.append((code, t)); seen.add(t)
    # Legends-only screen media (the Legends layer): 2003 Clone Wars, Droids, Ewoks, the Holiday Special, Ewok films
    lrows = [r for r in mt.legends_rows() if r["type"] in ("TV", "F") and r["title"]]
    lgot = wp.wikitext_many([r["title"] for r in lrows], refresh=refresh)
    for r in lrows:
        rec = lgot[r["title"]]
        ib = wp.infobox(rec["text"] or "")
        ser = wp.clean(ib.get("series", ""))
        code = ("CW03" if r["tmpl"] == "CW" else "DRD" if "Droids" in ser else "EWK" if ser.startswith("Ewoks") else
                "LFLM" if ib.get("_type") in ("Movie", "Media") and "saga" not in ser and "Clone Wars" not in rec["title"] else None)
        if code and r["title"] not in seen:
            pages.append((code, r["title"])); seen.add(r["title"])
    got = wp.wikitext_many([t for _, t in pages], refresh=refresh)
    miss = [t for _, t in pages if not got[t]["text"]]
    json.dump(pages, open(os.path.join(wp.CACHE, "pagelist.json"), "w"), indent=1)
    import collections
    print(len(pages), "pages;", len(miss), "missing:", miss[:10])
    print(collections.Counter(c for c, _ in pages))
