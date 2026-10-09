# Constitution

What this app is supposed to be. Written by Ganger from the brief; changed only by amendment.
Journeymen: build to this. Every must-have id below is what Ganger's checks verify against.

## Purpose
I want to create a desktop app for writing books. The idea is that the app is an entire publishing company from draft to ebook - with each role of the company filled by AI agents. The app should be minimalistic and elegant but full of features that you would find in Reedsy or Scrivener. I want to employ workspaces for each author/pen name, so that manuscripts are organized by their respective author/pen name, and I want a built in outline workshop feature that facilitates an environment for building the bones of their manuscript.

## Principles
- Built for: Authors (from the brief's audience)
- Signing in is optional: the app is usable without an account. (from the brief's auth)
- It keeps working without a connection and catches up when one returns. (from the brief's connectivity)

## Must-haves
### MH-1: outline
- [ ] A person using the app can: outline
- [ ] Ganger's coverage check finds the file and function that do it, in an app that builds, starts and has no placeholders left.

### MH-2: write
- [ ] A person using the app can: write
- [ ] Ganger's coverage check finds the file and function that do it, in an app that builds, starts and has no placeholders left.

### MH-3: edit
- [ ] A person using the app can: edit
- [ ] Ganger's coverage check finds the file and function that do it, in an app that builds, starts and has no placeholders left.

### MH-4: format
- [ ] A person using the app can: format
- [ ] Ganger's coverage check finds the file and function that do it, in an app that builds, starts and has no placeholders left.

### MH-5: and export
- [ ] A person using the app can: and export
- [ ] Ganger's coverage check finds the file and function that do it, in an app that builds, starts and has no placeholders left.

## Non-goals
- (none)

## Stack
Backend: yes. People sign in, so something has to store accounts and their data.
Tested combination: Content / publishing.
- framework: Vite + React (by recommender)
- styling: Tailwind CSS
- ui: shadcn/ui
- data: IndexedDB (Dexie) (by recommender)
- auth: none (by recommender)
- realtime: none (by recommender)
- deploy: static bundle (PWA-ready) (by recommender)
- integrations: none

## Open questions
Never resolved silently: ask the person.
- (none)

## Amendments
- v1, 2026-10-09, by Ganger: Written from the brief and the stack decision, before any journeyman ran.
