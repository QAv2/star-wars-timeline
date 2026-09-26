# Star Wars timeline — the archive console

A navigable, zoomable timeline of the whole Star Wars saga, built as an in-universe archive console.
Every canon film and series episode sits at its in-universe date; around them run the galactic chronicle,
Force visions and crossings, lineages (master and apprentice, families, offices), relics and their chains
of custody, a galaxy map lens on the Standard Galactic Grid, contested records, and a toggleable Legends layer.

Live: https://qav2.github.io/star-wars-timeline/

## Four archives, one record

The console is skinned: the same record can be read through four different archives, each with its own look,
vocabulary, gate and voice. One arrives per build.

| skin | status | look |
|---|---|---|
| Jedi Archives (`skins/jedi`) | open | holocron light and bronze on midnight; the Jocasta Nu gate |
| Resistance intelligence (`skins/resistance`) | sealed | vector-CRT war room, 35 ABY vantage |
| Imperial archive, Scarif (`skins/imperial`) | sealed | clearance scans, redactions, tape banks |
| Journal of the Whills (`skins/whills`) | sealed | outside time; every moment a doorway |

A skin is `docs/skins/<id>/skin.css` (tokens under `:root[data-skin="<id>"]`, ornament, gate art) plus
`docs/skins/<id>/skin.js` (vocabulary, gate text and steps, audio voices). Register it in `docs/skins/registry.js`
(`ready: true`) and in the allow-list at the top of `docs/index.html`. The engine reads every colour from the
skin's CSS tokens (`--c-*` canvas tokens, `--l-*` lanes, `--v-*` vision kinds), so a skin never touches `app/`.

## Build

```
python3 tools/fetch_records.py        # canon films + episodes, Legends screen media → cache/wp (Wookieepedia API)
python3 tools/parse_records.py        # infoboxes, App sections (who / where / what), in-universe order → build/records.json
python3 tools/places.py               # every location → planets with region / sector / system / grid square
python3 tools/build.py                # + data/curated/* → docs/data/archive.json
python3 tools/fetch_portraits.py resolve && python3 tools/fetch_portraits.py download
```

Placement follows Wookieepedia's "Timeline of canon media" (in-universe order of every canon work) and
"Timeline of Legends media". Curated overlays in `data/curated/` are compiled by research passes over
Wookieepedia and written in the archive's own words, with sources.

Serve `docs/` over HTTP to test (`python3 -m http.server -d docs`). `?dbg` logs errors, `?legends=1` opens the
Legends layer, `?skin=<id>` picks an archive.

## Credits

Unofficial fan reference, not affiliated with Lucasfilm or Disney. Star Wars and its characters are trademarks
of Lucasfilm Ltd. Data from Wookieepedia (starwars.fandom.com), CC BY-SA 3.0; portraits are Wookieepedia lead
images. Fonts: Cinzel, Barlow, Barlow Semi Condensed (SIL OFL 1.1); Aurebesh by SilvinoR (SIL OFL 1.1).
d3-zoom (ISC).
