# Brief: principal dossiers (archive files)

Read `research/briefs/_common.md` first.

**Input:** a slice of `build/principals-1.json` (your launch message names it). Each item: `wp` (Wookieepedia
title), `entries` (screen entries they appear in), `series`, `first`/`last` (years of their first and last
screen appearance).
**Output:** the file your launch message names, `data/curated/personnel-1a.json` or `-1b.json`: a JSON list, one
dossier per principal, in input order.
**Model:** `data/curated/personnel-2.json` (88 finished dossiers). Match its shape, length and tone exactly.

## Schema (per dossier)
```
{
  "wp": exact title from the input (unchanged; the build keys on it),
  "name": the name the archive files them under, as people know them ("Shmi Skywalker" for Shmi Skywalker Lars,
          "Padmé Amidala", "Lando Calrissian", "Thrawn"),
  "short": what running text calls them ("Shmi", "Lando", "the Grand Inquisitor"),
  "aliases": other names and titles they are known by, up to 5 ([] if none),
  "species": "Human", "Wookiee", "Astromech droid", ...,
  "homeworld": exact planet title or null,
  "affiliation": main allegiances in order, joined by " → " ("Jedi Order → Galactic Empire (Inquisitorius)"),
  "born": {"y", "yText", "confidence"} or null (droids: activation/manufacture if known),
  "died": {"y", "yText", "confidence"} or null (alive at their last appearance, or unknown),
  "summary": ≤60 words: who they are and the arc of their story across the screen works,
  "posts": 3–8 turning points in order: {"from", "to", "fromText", "toText", "text" (≤14 words)},
           e.g. offices held, allegiances changed, what they did at the pivots. from/to are y numbers; a single
           moment has from == to,
  "sources": 3–8 exact titles, screen works first,
  "conflict": null, or ≤50 words where sources disagree about their dates or fate
}
```

## Method
For each principal: `wp.py lead` for the infobox (born/died/homeworld/species/affiliation), then skim the
biography sections (`wp.py get "Title" --head 400` or `section`) for the arc and the dates. Dates of birth and
death follow the infobox and its citations. A character who dies and returns (Palpatine, Maul) gets the final
death in `died` and the return in `posts`.

Posts should read as a service record: the positions, allegiances and turning points a reader would scan for,
not a plot recap.
