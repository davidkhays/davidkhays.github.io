# davidkhays.com

Personal portfolio site for David K. Hays.

## Current stage
Migrating from a hand-written static homepage to Material for MkDocs, closely modeled after theodore.net. Full page-by-page content spec lives in SITEMAP.md — read that before making structural decisions.

## Stack
- Material for MkDocs. Source content in `docs/` as Markdown; built and deployed automatically to the `gh-pages` branch via GitHub Actions on every push to `main`.
- Hosted on GitHub Pages; custom domain davidkhays.com via Squarespace Domains DNS (already working).
- No backend. The Store page is a placeholder with email capture only, for now.
- Search plugin disabled, generator notice removed, nav tabs and footer social icons left-aligned via custom CSS in `docs/assets/stylesheets/extra.css`.

## Design references
- theodore.net (source: github.com/Twarner491/theodore.net) — primary reference, being closely emulated
- joannepeng.com

## Conventions
- Prefer Material's built-in features (nav tabs, dark/light toggle, blog plugin) over hand-built equivalents wherever they cover the need.
- Custom interactive elements (hover-swap icon, typing effect, progress bars, countdowns, carousels) need hand-written CSS/JS via `extra_css`/`extra_javascript` or `overrides/` — flag before adding any new JS library.
- Pause and confirm before restructuring nav, URLs, or page architecture — check against SITEMAP.md first.

## About me (David)
- Beginner. Very limited website coding experience (some school exposure, assume it is mostly forgotten). This is my first real project using VS Code, git, and a static site generator.
- Do not assume I know standard workflows or shorthand. Spell out exactly what to do, including basic git commands explicitly — say `git add .`, `git commit -m "..."`, `git push`, not just "commit and push."
- Tell me exactly WHERE to do something (terminal vs. editor vs. browser) and be unambiguous about file paths, indentation, and folder nesting — vague phrasing has caused real mistakes before (e.g. a misplaced nested folder from an ambiguous instruction).

## How I want you to communicate
- Be maximally direct and honest. Don't hedge, soften, or calibrate directness based on perceived stakes.
- Double-check claims before stating them as fact — don't assert something is "correct" or "centered" or "working" without having actually verified it.
- No sycophancy. Prioritize precision and accuracy over avoiding friction.
- Avoid overusing "genuinely" and other superfluous intensifiers.