# Rounds

## Round 1: built from the brief

- Outcome: finished, and the checks passed
- Commit: dc4142cb6d
- Cost: $2.86

- Data model: I wrote `src/db/schema.ts` and `docs/data-model.md`. I haven't type-checked either, because no dependencies are installed. (2 files)
- UI shell: The UI shell is written and all the listed deliverables exist, but I couldn't install dependencies or run a typecheck, so none of it has been compiled. I checked types by reading the code. There are no TODOs or stubs. `ganger/reports/data-model.md` was already there from the earlier attempt and I left it alone. (41 files)
- Integration: Every must-have already had real code from the earlier journeymen, so I only fixed and wired a few things. I couldn't install dependencies or run `tsc`, so nothing has been compiled or run. I read the code through for type and logic errors instead. (15 files)

## Round 2: a revision

What the person asked for: Changes pinned on the running app:
1. In "Edit and revisions" (src/screens/Edit.tsx · Edit): I want the very first screen a user see's to be the "Create a workspace screen" instead of going directly to  the left menu, nest all of the sections (outline, write, edit, etc.) into one workspace for each created authors workspace.
If a user wants to switch to a different workspace or create a workspace there should be a  "Workspaces" button at the bottom of the left hand menu that reveals an option to add new workspace or select an already made workspace
2. In "Writing desk" (src/screens/Write.tsx · Write), the header "Write Respect: 4 words of 500" on /: Each chapter should be modular. An author needs the ability to segment their chapters by dragging and dropping within the chapter, both in the menu and in the writing block. Segments in the writing block can be added manually and selectable.
3. In "Edit and revisions" (src/screens/Edit.tsx · Edit), the header "Edit Review the text, accept or reject suggestions, and k..." on /: There needs to be a workflow to editing. The editing process should begin with Developmental or Structural Editing: The first pass focuses on the "big picture," including plot, narrative arc, character consistency, and overall organization. Editors and authors collaborate to finesse the story structure or argument logic. 
Line Editing: This stage refines the prose, improving sentence flow, voice, and style while removing redundancies and tightening paragraphs.
Copy Editing: A "fine-toothed comb" review for grammar, punctuation, spelling, and consistency with a specific style guide.
Proofreading: The final check to catch typos, formatting errors, and layout issues before publication.
Each editing phase should utilize a different model chosen by the user.
4. In "Book format and preview" (src/screens/Format.tsx · Format), the header "Format How the book looks. The preview is built the same ..." on /: There needs to be an option to have AI choose the formatting preset
Add to the plan: yes

- Outcome: finished, and the checks passed
- Cost: $2.39

- Integration: All four changes from the feedback are in. `tsc --noEmit` passes and `vite build` succeeds. I haven't run the app in a browser, so drag and drop and the AI calls are untested at runtime. (22 files)

Written by Ganger from the build's rounds. A round's own commit is the one that contains its entry here.
