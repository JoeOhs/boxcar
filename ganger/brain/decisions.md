# Decisions

## The stack

Backend: yes. People sign in, so something has to store accounts and their data.
Archetype: Content / publishing (content-publishing). Publishing apps are read-heavy with a small set of writers; a standard hosted web stack with realtime-capable data covers drafts, publishing, and readers.
- framework: Vite + React (overridden) - A local desktop writing app needs a fast, dependency-light shell that ships as one bundle.
- styling: Tailwind CSS - Utility CSS keeps generated components consistent without a design system to learn.
- ui: shadcn/ui - Copy-in components on top of Tailwind; easy for later agents to modify in place.
- data: IndexedDB (Dexie) (overridden) - Keeps manuscripts, pen names, and outlines stored locally and offline on the user's machine.
- auth: none (overridden) - The app runs on one person's desktop, so there is nothing to log into.
- realtime: none (overridden) - A single-user offline app has no second party to sync with.
- deploy: static bundle (PWA-ready) (overridden) - Ships as a self-contained, installable desktop-ready app with no server to run.
- integrations: none - No domain-specific integrations required by default.

## Overrides

### data: Convex -> Convex + local cache (Dexie)

- **Why:** The wizard answer for connectivity is "offline-capable", so reads must survive an outage.
- **By:** rule:offline-capable-needs-local-cache
- **When:** 2026-10-09T02:23:57.176Z

### framework: Next.js -> Vite + React

- **Why:** A local desktop writing app needs a fast, dependency-light shell that ships as one bundle.
- **By:** recommender
- **When:** 2026-10-09T02:23:57.178Z

### data: Convex + local cache (Dexie) -> IndexedDB (Dexie)

- **Why:** Keeps manuscripts, pen names, and outlines stored locally and offline on the user's machine.
- **By:** recommender
- **When:** 2026-10-09T02:23:57.178Z

### auth: Clerk -> none

- **Why:** The app runs on one person's desktop, so there is nothing to log into.
- **By:** recommender
- **When:** 2026-10-09T02:23:57.178Z

### realtime: Convex -> none

- **Why:** A single-user offline app has no second party to sync with.
- **By:** recommender
- **When:** 2026-10-09T02:23:57.178Z

### deploy: Vercel -> static bundle (PWA-ready)

- **Why:** Ships as a self-contained, installable desktop-ready app with no server to run.
- **By:** recommender
- **When:** 2026-10-09T02:23:57.178Z

Written by Ganger from the stack decision and every override, with its reason.
