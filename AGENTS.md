<!-- ganger:brain:start -->
# About this project

boxcar-studio: I want to create a desktop app for writing books. The idea is that the app is an entire publishing company from draft to ebook - with each role of the company filled by AI agents. The app should be minimalistic and elegant but full of features that you would find in Reedsy or Scrivener. I want to employ workspaces for each author/pen name, so that manuscripts are organized by their respective author/pen name, and I want a built in outline workshop feature that facilitates an environment for building the bones of their manuscript.

It must do these on day one:
- outline
- write
- edit
- format
- and export
- a separate workspace for each author or pen name, chosen or created on the first screen
- a Book Cover workshop for designing book covers with image-generating AI (needs a compatible API key)
- a genre guide (fiction and non-fiction) when creating a new manuscript

Stack: Content / publishing, fully offline: no backend, no accounts, data in IndexedDB (Dexie). 6 override(s) and one correction, each with its reason, are in ganger/brain/decisions.md.

Latest Ganger rounds (Ganger no longer runs rounds on this project; see below):
- Round 15: asked for "Changes pinned on the running app:"; finished, and the checks passed
- Round 16: asked for "Changes pinned on the running app:"; finished, and the checks passed

Before you start, read ganger/brain/CONSTITUTION.md, mission.md, decisions.md and rounds.md, and AUDIT_REPORT.md for known findings. The constitution is what the app is supposed to be; its must-have ids (MH-1 to MH-8) are the features that must keep working.

## Who maintains this project now

Ganger generated this app and ran rounds 1–16, but it no longer runs rounds here (confirmed by the Ganger team, 2026-11-15). The project is maintained directly in this repo.

- ganger/brain/ is now the project's own record. Change it only by amendment: add an entry to the amendments list in constitution.json and CONSTITUTION.md, or a dated entry in decisions.md, saying what changed and why. Never rewrite history in rounds.md.
- Any change to something a docs/ file describes must update that file in the same change.

## Tests

Nothing runs tests automatically anymore. Run them yourself before every commit:

- `npm test`: Vitest unit tests in tests/unit (jsdom + fake-indexeddb; network mocked at `fetch`)
- `npm run test:e2e`: Playwright browser flows in tests/e2e (run `npx playwright install chromium` once)
- `npm run build`: type check and production build

Keep tests passing, and never weaken or delete a test to make it pass: fix the code.

**`BUG-*` tests use `it.fails`.** Each one reproduces a known, still-open defect from AUDIT_REPORT.md. `it.fails` passes while the bug exists and fails once the bug is fixed. So when you fix one of those bugs and its `BUG-*` test turns red, that is expected: rename the test (drop the `BUG-` prefix, cite the finding id) and switch it from `it.fails` to `it`. Never change the code back to make it pass again.
<!-- ganger:brain:end -->
