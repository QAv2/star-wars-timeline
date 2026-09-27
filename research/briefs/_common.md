# Research pass: shared rules

Every curated overlay in `data/curated/` is compiled by a research pass over Wookieepedia and written in the
archive's own words. These rules apply to every brief in this folder.

## Where things are
- Repo: `/home/joseph/star-wars-timeline`. Run commands from the repo root.
- Wookieepedia goes through `python3 tools/wp.py` only (cached on disk under `cache/wp/`, so repeat calls are free):
  - `get "Title" [--grep REGEX] [--head N]`: raw wikitext (resolved title on line 1)
  - `lead "Title" ...`: infobox fields and the first paragraph, cleaned
  - `section "Title" "Heading"`: one section, cleaned
  - `exists "Title" ...`: OK/MISSING plus the resolved title, one per line
  - `search "words" [N]`: full-text search, top N titles
  - `lines "Title" START END [--clean]`: raw wikitext lines START..END (1-based, inclusive)
- Don't use WebFetch or WebSearch on Wookieepedia/Fandom; the client handles caching and rate limits.
- Existing overlays to read for shape and tone: `data/curated/events-e*.json` (canon chronicle),
  `legends-events-1.json`, `visions.json`, `personnel-2.json`, `lineages.json`, `artifacts.json`.

## What you may touch
- Write ONLY the output file your brief names, plus your own progress file `build/wip/<output name>`.
- Don't edit any other file. Don't run `tools/build.py`, don't touch `docs/`, don't run git.
- **Save progress as you go.** Every 10 entries or so, rewrite `build/wip/<output name>` with everything done so far
  (valid JSON). If that progress file already exists when you start, load it and continue from where it stops
  rather than redoing the work. Write the final file to `data/curated/` only when the whole brief is done.

## Titles
- `wp`, `people`, `places`, `homeworld`, `holder`: exact Wookieepedia article titles. Check with `wp.py exists`
  and use the RESOLVED title it prints (redirects resolve to the real article).
- Legends articles that share a name with a canon article carry a `/Legends` suffix (`Ruusan/Legends`,
  `Darth Bane/Legends`). Use them in Legends work; the build joins them back to canon where the two match.
- `sources`: exact Wookieepedia titles of the works cited (films, episodes, novels, comics, reference books), taken
  from the article's `<ref>` citations. Screen episodes use their own article titles (`Part I`, `Rookies`,
  `A World Between Worlds`). The console links a source to its screen entry by exact title, so spell them as
  Wookieepedia does. 2–8 sources per entry, screen sources first when there are any.

## Time
- `y` is a number on the archive's axis: n BBY → -n, n ABY → +n, 0 BBY (the Battle of Yavin) → 0.
  Legends uses the same axis.
- `yText` is the date as the sources give it: "19 BBY", "c. 1000 BBY", "between 4 and 5 ABY".
- `frac` (0–1) places an entry within its year when the sources give an order (early/late in the year, before or
  after another event); otherwise null.
- `confidence`: `explicit` (a source states the year), `estimated` (a source says circa/about), `inferred` (you
  worked it out from other dates; say how in `note`).
- When sources disagree on a date or a fact, pick the one Wookieepedia's article follows and record the
  disagreement in `conflict` (one or two sentences naming the sources on each side). Otherwise `conflict` is null.

## Voice
- Every `summary`, `text`, `claim` and `title` is written fresh, in the archive's own words. Never copy or lightly
  reword a Wookieepedia sentence; read the article, then write what happened as you would explain it to someone.
- Plain register: concrete and declarative, present tense for what happens ("Kaan unleashes the thought bomb").
  No hype words (legendary, iconic, fateful, epic, shocking), no in-universe purple prose, no hedging filler.
- Keep to the word limits in your brief. Names in running text are the short forms people use.
- No spoilers are hidden: this is an archive, it states outcomes.

## Finish
- Validate before you finish: the file must load with `json.load`, every entry must carry every schema field,
  and ids must be unique. Print the count and a few sample entries.
- Your final message: the output path, the entry count, and anything you could not resolve (titles that were
  MISSING, dates you had to infer, decisions a human should check). Keep it short.
