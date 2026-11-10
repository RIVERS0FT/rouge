# Muted historical political-map palette

The visual direction is Victoria 3's muted nineteenth-century political-map presentation: dusty blue, faded brick, old ochre, violet, sage and rose over warm neutral land and a slate sea. This is an original palette, not an exact recreation, country-color mapping or extracted game asset.

Public screenshot references inspected for overall style:
- [PC Gamer: Creating utopias and dystopias by gaslight in Victoria 3](https://www.pcgamer.com/creating-utopias-and-dystopias-by-gaslight-in-victoria-3/)
- [GameWatcher: Victoria 3 review](https://www.gamewatcher.com/reviews/victoria-3-review/13351)

## Implementation and boundaries

- `src/game/factionColors.ts` is the shared source for map, units, HUD swatches and lobby. Twelve curated inks precede a deterministic golden-angle extension. Generated HSL saturation is 20–30.5%, replacing 58%; lightness varies as well as hue, with no four-faction cap.
- Neutral land and its HUD swatch share the same low-chroma parchment grey. Ownership does not inherit modern or historical countries.
- The sea, coastlines, administrative boundaries and selection gold use restrained companion colors. Selection retains its outline and bounded inward glow without recoloring the land interior.
- Flags remain exactly as selected or drawn, including bright custom colors. Flags are cosmetic and do not set map colors. Saves and LAN rules are unchanged.
- Small faction names use a lighter derivative on the dark HUD. Dispatches have an opaque dark panel so pale neutral land cannot wash out their small text. Written owner names, faction numbers and neutral labels remain available on desktop and touch. This is not a dedicated color-blind mode: color alone cannot distinguish hundreds of factions or every color-vision deficiency. Select a province to confirm its written owner.

## Verification after deployment

Follow the repository's release order: squash PR, build/deploy main, then test that deployed commit. No new PR test gate is introduced.

- Palette unit coverage checks 512 unique deterministic colors, saturation/lightness bounds, neutral fallback, high IDs and small-text contrast. Existing simulation/save/LAN tests cover unlimited-roster compatibility.
- Browser coverage uses a valid 16-faction saved game and samples owners 0, 3, 12, 15 and neutral land; compares actual vertex fill with the shared ink, tests close zoom and selection glow, checks written owner names an unchanged bright-red custom flag and the actual dark dispatch background.
- Run desktop 1440×960, touch portrait 390×844 and touch landscape 844×390. Retain screenshots in `artifacts/` and check large land areas, border legibility, selected light/dark regions and HUD swatches. Existing selection, flags, touch and main acceptance suites must continue to run.
- Manual visual review should include normal, grayscale and red/green color-vision simulation. Do not infer perceptual distinguishability from unique hex values alone.
