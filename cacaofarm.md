# cacaofarm (subproject of davidkhays.com)

Personal webapp to track ~28 planted cacao seeds across 2 physical areas, with photo history and status per pot. Lives at davidkhays.com/cacaofarm — not linked in the main site nav for now, may be added as a linked project later.

## Important: this subfolder has different rules than the rest of the site
The root CLAUDE.md's "keep dependencies at zero" convention does NOT apply inside docs/cacaofarm/ — this tool legitimately needs the Firebase SDK. Nothing else about the site (MkDocs, theodore.net emulation, etc.) is affected by this subproject.

## Location & deployment
- Lives at docs/cacaofarm/ in this same repo, as a self-contained set of static files — not processed as Markdown/MkDocs content, just carried through as-is (MkDocs copies non-Markdown files in docs/ untouched).
- Deployed via the exact same pipeline as the rest of the site: git push to main → existing GitHub Action → gh-pages. Confirm the built site actually serves davidkhays.com/cacaofarm/ correctly before considering this done.
- Not added to mkdocs.yml's nav — reachable only by direct URL for now.

## Stack
- Static HTML/CSS/vanilla JS — no framework, no build step, no npm, no Node.
- Firebase JS SDK loaded via CDN `<script type="module">` imports.
- Firestore only — for both pot/area data AND photos (stored as compressed base64 JPEG strings within pot documents, not Cloud Storage). Deliberate decision to keep this on Firebase's free Spark plan permanently — no Blaze, no billing account, ever. Do not add Cloud Storage or any product requiring Blaze without asking me first.
- Firebase Authentication (email/password, single user — me).

## Access model — important, read carefully
- Public, unauthenticated READS are intentional: anyone with the URL can view all pot data — status, photos, notes, everything. This is not a bug or an oversight to "fix" later.
- WRITES must be restricted to my authenticated UID only. No one else, authenticated or not, can create, edit, or delete anything.
- The app itself must NOT have a full-page login gate. It should load and display pot data for anyone, immediately, no sign-in required. A small, unobtrusive sign-in control (not a blocking screen) reveals edit controls once I'm authenticated — everyone else sees a read-only view with no visible edit affordances at all.
- I'll provide the Firebase config values (apiKey, etc.). Fine for these to be visible in client-side code — normal for Firebase; the actual security boundary is the rules, not hiding these values.
- A working reference prototype (layout, interactions, data model) exists as a Claude.ai artifact from an earlier conversation — ask me for it if useful. It used browser-only storage that doesn't carry over, but the UI/UX should be replicated closely.

## Data model
- Area: id, name.
- Pot: id, areaId, size (small/medium), x/y position (% within a 3:4 area box), plantedDate, parentPod (text), soilType, status (thriving/good/watch/critical/dead — each a specific color), notes.
- Photos: per-pot history, stored as a subcollection of small documents nested under each pot (not an array field on the pot document itself) — each holding one upload date and one compressed base64 JPEG string. This avoids ever approaching Firestore's 1 MiB per-document limit as photo history accumulates over a pot's lifetime.

## Current pot layout (source of truth for seeding real data)
- Area 1: 19 small pots, staggered rows of 3/4/4/4/4.
- Area 2: 5 small pots (clustered) + 4 medium pots (2x2 grid below).

## Conventions
- First priority: security rules confirmed to actually enforce the access model above (test as a logged-out visitor: can read, cannot write) before building out remaining features.
- Ask before adding any dependency beyond the Firebase SDK itself, and especially before adding anything that would require upgrading off the free Spark plan.