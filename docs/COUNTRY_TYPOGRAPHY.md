# Country names

Country typography follows the country labels measured in
[Shanhe Shapan](https://shanheshapan.us.ci/) on 2026-11-14:

- Noto Serif SC, weight 700, with Songti SC / STSong / SimSun serif fallbacks.
- Country-colour ink darkened to 42%, then mixed 30% toward RGB(24, 18, 14),
  with 88% opacity. ROUGE retains its own country palette.
- RGB(250, 244, 228) outline at 40% opacity, round joins, painted before fill.
- Centered stroke width in CSS pixels: `clamp(0.9 + fontPixels * 0.05, 1.4, 4.2)`.
  Its visible exterior is half that width; DPR scales the physical-pixel width.

`countryTypography.ts` shares these values between the SVG fallback and GPU
distance-field renderer. The existing land-contained curves, complete country
names, upright rotation and world-space anchoring remain in use.

The 700-weight font is bundled locally (5,905,016-byte WOFF2), so the result
does not depend on the user's installed Chinese fonts or a Google Fonts request.
Source: Google Fonts CSS API, Noto Serif SC v36, weight 700:
`https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7RlrCWv.ttf`.
The original was losslessly converted to WOFF2 with fontTools 4.68.0 / Brotli 1.2.1.
The SIL Open Font License is included beside the asset as `NotoSerifSC-OFL.txt`.

The same loaded font supplies SVG layout metrics and canvas glyph masks.
SVG-image decoding cannot access the document's web fonts, so masks are painted
from SVG's actual per-character baseline positions and rotations. A worker
constructs a distance field once per text/curve; zoom changes the projection and
outline width without replacing the glyph texture. Country ownership geometry
also runs in a worker. The visible SVG is hidden after the GPU texture is ready.

Browser checks cover Chinese/English, desktop/phone, complete glyph containment,
upright angles and inverse-projected glyph positions throughout zoom. Screenshots
are written to `artifacts/country-style-{desktop,mobile}-zh.png`.
