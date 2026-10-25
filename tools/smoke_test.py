"""Smoke test for the published site in docs/: catches a broken build or an empty archive.

  python3 tools/smoke_test.py               # static checks (stdlib only)
  python3 tools/smoke_test.py --browser     # + load every skin in headless Chromium (needs `pip install playwright`)

Static: docs/data/archive.json parses and is not empty, record ids are unique, every record sits in a known lane,
every portrait it names exists under docs/img/p/, every skin has its skin.css + skin.js, and every local file
index.html and the CSS point at exists.
Browser: serves docs/ on a free port, opens each skin, and fails on a console error, an uncaught exception,
a failed or 4xx/5xx request, a gate that never opens, or empty section counts.
Set CHROMIUM=/path/to/chrome to use a browser other than Playwright's own.
"""
import sys, os, re, json, glob, threading, functools, http.server

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
SKINS = ["jedi", "resistance", "imperial", "whills"]
MIN = {"records": 600, "people": 1000, "places": 100, "events": 100, "levents": 50, "visions": 20,
       "artifacts": 5, "anomalies": 10, "personnel": 50, "routes": 3}
fails = []


def check(ok, msg):
    if not ok:
        fails.append(msg)


def static():
    A = json.load(open(os.path.join(DOCS, "data", "archive.json")))
    for k, n in MIN.items():
        check(len(A.get(k) or []) >= n, f"archive.json: {k} has {len(A.get(k) or [])}, expected at least {n}")
    ids = [r["id"] for r in A["records"]]
    check(len(ids) == len(set(ids)), "archive.json: duplicate record ids")
    lanes = {l["id"] for l in A["lanes"]}
    bad = [r["id"] for r in A["records"] if r.get("l") not in lanes or not isinstance(r.get("t"), (int, float))]
    check(not bad, f"archive.json: records with no lane or time: {bad[:5]}")
    ims = {p["im"] for p in A["people"] if p.get("im")}
    gone = [h for h in ims if not os.path.exists(os.path.join(DOCS, "img", "p", h + ".jpg"))]
    check(not gone, f"{len(gone)} portraits missing from docs/img/p: {gone[:5]}")
    for s in SKINS:
        for f in ("skin.css", "skin.js"):
            check(os.path.exists(os.path.join(DOCS, "skins", s, f)), f"missing docs/skins/{s}/{f}")
    for f in [os.path.join(DOCS, "index.html")] + glob.glob(os.path.join(DOCS, "**", "*.css"), recursive=True):
        s = open(f).read()
        for ref in re.findall(r"""url\(['"]?([^'")]+)""", s) + re.findall(r"""(?:src|href)=["']([^"'#]+)""", s):
            if ref.startswith(("http:", "https:", "data:")):
                continue
            check(os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), ref))),
                  f"{os.path.relpath(f, ROOT)}: broken reference {ref}")
    print(f"static: {len(A['records'])} records, {len(A['people'])} people, {len(ims)} portraits, built {A['meta']['built']}")


def browser():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        fails.append("--browser needs Playwright: pip install playwright && playwright install chromium")
        return
    handler = functools.partial(type("Quiet", (http.server.SimpleHTTPRequestHandler,),
                                     {"log_message": lambda *a: None}), directory=DOCS)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}/"
    with sync_playwright() as p:
        b = p.chromium.launch(**({"executable_path": os.environ["CHROMIUM"]} if os.environ.get("CHROMIUM") else {}))
        for skin in SKINS:
            pg = b.new_page()
            errs = []
            pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
            pg.on("pageerror", lambda e: errs.append("exception: " + str(e)))
            pg.on("requestfailed", lambda r: errs.append(f"failed: {r.url}"))
            pg.on("response", lambda r: r.status >= 400 and errs.append(f"{r.status}: {r.url}"))
            pg.goto(f"{base}?skin={skin}&legends=1", wait_until="networkidle")
            try:
                pg.wait_for_selector("#gate-go:not([disabled])", timeout=15000)
                pg.click("#gate-go")
                for mode in ("visions", "lineages", "relics", "personnel", "map", "records", "anomalies", "continuum"):
                    pg.click(f'.navbtn[data-mode="{mode}"]')
                pg.wait_for_timeout(500)
            except Exception as e:
                errs.append(f"interaction: {e}")
            nums = pg.eval_on_selector_all(".navbtn .num", "ns => ns.map(n => n.textContent).filter(Boolean)")
            check(len(nums) >= 7, f"{skin}: section counts missing ({nums})")
            check(not errs, f"{skin}: " + "; ".join(errs[:5]))
            print(f"browser: {skin} loaded, section counts {nums}, {len(errs)} errors")
            pg.close()
        b.close()
    srv.shutdown()


if __name__ == "__main__":
    static()
    if "--browser" in sys.argv:
        browser()
    for f in fails:
        print("FAIL", f)
    print("smoke test", "FAILED" if fails else "passed")
    sys.exit(1 if fails else 0)
