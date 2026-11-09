# Commander portrait art

Original fictional officer illustrations generated for Rouge with the built-in
OpenAI image generation tool on 2026-11-10. These are cosmetic portraits only;
they do not change leader IDs, saved preferences or gameplay statistics.

- `warden.webp`: silver-haired veteran in a dark teal coat.
- `vanguard.webp`: female field officer in a green uniform and cap.
- `steward.webp`: bespectacled quartermaster in a plum coat with a ledger.

All three use a consistent painterly-realism treatment, warm upper-left light,
cool rim light and transparent background. No real insignia or sourced likenesses
were requested. Exact generation prompts are in `PROMPTS.json`.

Runtime assets are 720 × 900 transparent WebP images (quality 88), converted from
the generated PNGs without redrawing or changing their contents. Vite bundles and
fingerprints them; no external image service is needed at runtime.
