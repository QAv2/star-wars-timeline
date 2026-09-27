# Brief: the contested register

Read `research/briefs/_common.md` first.

**Output:** `data/curated/anomalies.json`: a JSON list of 35–50 entries, sorted by `y`.

The console's "contested" mode lists places where the record disagrees with itself. In a Jedi Archives reading,
these are the files a careful archivist flags: records erased from the archive, histories rewritten by whoever
held power, witnesses whose accounts don't agree, dates the sources can't settle, and places where the saga
changed its own story.

## Kinds
- `in-universe-erasure`: records removed or suppressed inside the story (Kamino missing from the Jedi Archives;
  the Empire scrubbing the Jedi from history; memory wipes).
- `propaganda`: an in-universe official story that differs from what happened (the "Jedi rebellion" of Order 66;
  the Empire's account of Alderaan or Ghorman; the First Order's).
- `unreliable-account`: characters who tell it differently, or wrongly (Luke's accounts of the night the Temple
  fell; Obi-Wan's "certain point of view"; the Brendok night as the Jedi and the twins each tell it).
- `dating-conflict`: sources that put the same thing in different years.
- `retcon`: the saga revising its own earlier story (Maul survives; Palpatine returns; Rey's parents).
- `contradiction`: sources that state incompatible facts and nothing reconciles them.

## Fold in the flags already on the stacks
The chronicle and the visions already carry 32 one-line disagreements: every entry with a non-null `conflict` in
`data/curated/events-e*.json` and `data/curated/visions.json` (plus Barriss Offee's fate in `personnel-2.json`).
Every one of them should be covered by a register entry. Group related flags into one entry where they share a
cause (the Rogue One / A New Hope 0 BBY → 1 BBY shift covers the Scarif, Alderaan and Yavin flags; the two
"Qui-Gon speaks in 16 BBY" flags are one question) and list the covered ids in `events`. Then add the in-universe
erasures, propaganda, unreliable accounts and retcons that make up the rest.

## Schema (per entry)
```
{
  "id": "<kebab-case>" (unique),
  "title": ≤8 words, own words,
  "kind": one of the six kinds above,
  "y", "yText", "frac": when the contested thing happens in-universe,
  "summary": ≤60 words: what is contested and why it matters,
  "accounts": 2–4 × {"claim": ≤30 words, own words, "source": the work or speaker making it},
  "resolution": ≤50 words: where it stands (which account the sources now follow, or that it stays open),
  "events": ids from events-e*.json / visions.json / legends-events-*.json this entry covers ([] if none),
  "sources": 2–8 exact titles, screen works first,
  "weight": 1 | 2 | 3 (3 = a reader would expect it in any account of the saga's contested history)
}
```

## Method
Wookieepedia's "Behind the scenes" sections and the conflict notes on each article are the best leads
(`wp.py section "Title" "Behind the scenes"`). Keep claims to what the works say; name the work or the speaker on
each side. Out-of-universe statements (a director, the Story Group, an author) are fair accounts; cite where
Wookieepedia cites them.
