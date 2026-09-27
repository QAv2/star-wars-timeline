# Brief: Legends chronicle

Read `research/briefs/_common.md` first.

**Source:** Wookieepedia "Timeline of galactic history/Legends". Your launch message names your line range and
output file. Read the range with `python3 tools/wp.py lines "Timeline of galactic history/Legends" START END`
(in chunks of ~150 lines), then open the linked event articles for dates, people, places and citations.
**Model:** `data/curated/legends-events-1.json` (87 events, the dawn of the galaxy to Ruusan). Match its shape,
length and tone. Its ids are taken; don't reuse them.

## What to pick
- The Legends layer sits under the canon chronicle as its own lane. It should read as the Legends history of the
  galaxy: the wars, falls, foundings, discoveries, deaths and turning points a reader of the Expanded Universe
  would expect to find, plus the texture that gives each era its character.
- **Saga years (32 BBY → 4 ABY) are Legends-distinct only.** The canon chronicle already carries the films' and
  the canon series' events (`data/curated/events-e2.json` … `e4.json`). In those years, add an event only if it
  doesn't exist in canon or the Legends version is materially different (a different battle, outcome or cast).
  Check with `grep -il "<keyword>" data/curated/events-e*.json` before adding. Before 32 BBY and after 4 ABY,
  almost everything in Legends is distinct; pick on merit.
- `weight`: 3 = era-defining (on a one-page history of the era), 2 = significant, 1 = texture.
  Aim for roughly 55% weight 1, 33% weight 2, 12% weight 3.

## Schema (per event)
```
{
  "id": "leg-<kebab-case>" (unique; not in legends-events-1.json),
  "title": ≤8 words, own words,
  "y", "yText", "frac", "y2", "y2Text" (end of a span, e.g. a war; else null),
  "confidence", "note" (dating note or null),
  "category": one of battle, war, jedi, sith, politics, founding, fall, death, birth, disaster, technology,
              exploration, discovery, crime, treaty, culture, force, rebellion, mandalore, era,
  "polity": the main actor ("Galactic Republic", "Jedi Order", "Empire", "New Republic", "Yuuzhan Vong",
            "Fel Empire", "One Sith", "Hutts", "galactic", ...),
  "summary": ≤60 words, own words,
  "wp": the event's own article (exact title, `/Legends` where needed), or the closest article that covers it,
  "places": exact titles, "people": exact titles (principal actors only, up to 5),
  "sources": 2–6 exact titles of the works cited,
  "conflict": null or one or two sentences,
  "weight": 1 | 2 | 3
}
```
