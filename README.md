[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/endg9/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/endg9/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

# Vice City Cover Maker

A GTA 6-style cover art maker web app — build a neon cover from your own photos,
entirely in the browser. Nothing uploads: every photo stays local.

Built for the [make.fun gta6-cover-art-01 bounty](https://make.fun/bounty/gta6-cover-art-01).

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## What it does

- Load photos (file picker, drag & drop, or the two built-in sample photos).
- 6 layouts: 4-panel grid, hero + 3, full-bleed single, 9-panel grid, tilted
  snapshots, portrait + title block.
- 5 colour grades: Vice Sunset, Neon Night, Dusk Purple, Mono Chrome, Teal Coast.
- Per-panel photo controls: click a panel to select it, drag to reposition,
  zoom slider, photo cycling, Reset crop.
- Editable caption (Anton title + Pacifico subtitle) and an invented badge
  ribbon. Undo/redo included.
- Export PNG at 1920×1080, 1080×1350, and 1080×1080 — each size recomposes
  the layout for its ratio instead of stretching.

## Fonts

Anton and Pacifico are bundled under the SIL Open Font License
(see `app/fonts/OFL-Anton.txt` and `app/fonts/OFL-Pacifico.txt`).

## License

MIT. Sample photos ship with the make.fun starter kit and are free to use.
