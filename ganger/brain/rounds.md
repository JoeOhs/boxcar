# Rounds

This is an export: its files without their git history. The commits named below are in the project's own history in Ganger; to send the history too, use "Push to git" on the build instead of exporting.

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
- Commit: 22271338f3
- Cost: $2.39

- Integration: All four changes from the feedback are in. `tsc --noEmit` passes and `vite build` succeeds. I haven't run the app in a browser, so drag and drop and the AI calls are untested at runtime. (22 files)

## Round 3: a revision

What the person asked for: Changes pinned on the running app:
1. In "Create or choose a workspace" (src/screens/WorkspaceGate.tsx · WorkspaceGate), the div "Boxcar Studio Start by creating a workspace for an author..." on /: There needs to be a option for selecting an already created workspace just below the "create a workspace" section. If a user has created a workspace/s already, they should see a list of workspaces below the "create a workspace" section
2. On /, the label "MANUSCRIPT": Theres no need to have multiple manuscript options. remove the manuscript drop-down menu.
3. On /, the div "This workspace Author / pen name About this author Delete...": an authors list of manuscripts should be listed on the left hand side of the workspace and selecting a manuscript opens the options on the right
4. On /, the button "Workspaces": move this above the settings and dark/light mode
5. In "Writing desk" (src/screens/Write.tsx · Write), the button "Segment 1 0" on /: change the use of "Segments" to "Scenes"
6. On /, the div "respect 0 words Stage Outlining Drafting Editing Formatti...": When creating a new manuscript there should be a menu that gives the user the ability to guide the manuscript by genre both fiction and non-fiction
7. On /, the menu "Manuscripts Outline Write Edit Format Export": I want to add a section for "Book Cover", that opens up a workshop for developing book covers, utilizing image generating AI models. Must have an image generating compatible API key.
Add to the plan: yes

- Outcome: finished, and the checks passed
- Commit: 91f1f085e3
- Cost: $2.05

- Integration: All seven changes from the feedback are done. `tsc --noEmit` passes and `vite build` succeeds. I haven't run the app in a browser, and the image calls to OpenAI and Google are untested against the real services. (20 files)

## Round 4: a revision

What the person asked for: Changes pinned on the running app:
1. On /, the div "AI staff The outliner, editor, proofreader and formatter ...": Stored API keys need to be encrypted and listed when a user inputs their keys. There needs to be options for users to revoke and delete stored keys
2. In "Writing desk" (src/screens/Write.tsx · Write), the header "Write respect: 0 words" on /: add a button that activates a "Ghostwriter", the ghostwriter section should open a menu on the right that lets the user interact with their ghostwriter
Add to the plan: yes

- Outcome: finished, and the checks passed
- Commit: 2efbab16a4
- Cost: $1.00

- Integration: Both changes are in. `tsc --noEmit` passes and `vite build` succeeds. I haven't run the app in a browser, so the encryption and the Ghostwriter chat are untested at runtime. I haven't tried a real provider call either. (11 files)

## Round 5: a revision

What the person asked for: Changes pinned on the running app:
1. In "Create or choose a workspace" (src/screens/WorkspaceGate.tsx · WorkspaceGate), the div "Boxcar Studio Choose the author or pen name you are worki..." on /: Default to dark mode on app launch and add the light/dark mode button to the workspace creation screen
2. In "Create or choose a workspace" (src/screens/WorkspaceGate.tsx · WorkspaceGate), the heading "Boxcar Studio" on /: I want to change the name of the app to boxcar (the main name for the app), but also add "Publishing Studio" as the sub-name underneath it.
3. On /, the div "JOE'S MANUSCRIPTS New manuscript": we need to integrate a way to import manuscripts.
4. On /, the section "blah 0 words of 80,000 Open Stage Outlining Drafting Edit...": keep the + New Manuscript card for the creation/inception of a new manuscript but once a manuscript is created it should take you to a Kanban style roadmap for the manuscript from outline to publish
5. In "Outline workshop" (src/screens/Outline.tsx · Outline), the header "Outline The bones of blah. Build acts, chapters, scenes a..." on /: add a feature that intelligently imports outlines/frameworks for manuscripts
6. In "Edit and revisions" (src/screens/Edit.tsx · Edit), the header "Edit Four passes in order: developmental, line, copy and ..." on /: add an export button that will export a draft for traditional human editing
7. In "Writing desk" (src/screens/Write.tsx · Write), the aside "FRONT MATTER None yet CHAPTERS None yet BACK MATTER None yet" on /: Add a research repository that can be accessed without leaving the main writing screen, and the ghostwrite has access to for context
8. In "Writing desk" (src/screens/Write.tsx · Write), the div "Nothing written yet Add your first chapter, or open an it..." on /: integrate a dictionary and thesaurus feature that can be utilized by selecting a word, as well as spell check
9. On /, the div "Export epub": remove epub, just leaving "Export" for the button
10. In "Book format and preview" (src/screens/Format.tsx · Format), the field on /: this scene break text box allows letters and numbers, which is not suitable for manuscript export. remove the box and just leave the preset dropdown menu, and add "None" as a preset option
11. On /, the div "Provider OpenAI Anthropic": add compatability with hugging face and ollama
Add to the plan: yes

- Outcome: finished, and the checks passed
- Commit: 591ba2c64d
- Cost: $2.32

- Integration: All of Round 5's open items are now wired and the project type-checks and builds. I have not run the app in a browser, so the drag and drop, the lookup card, and the file pickers are untested at runtime. (18 files)

## Round 6: a revision

What the person asked for: Changes pinned on the running app:
1. In "Edit and revisions" (src/screens/Edit.tsx · Edit), the button "Ask the AI" on /: Change this button to "Ask the Editor"
2. In "Edit and revisions" (src/screens/Edit.tsx · Edit), the heading "Ask the AI for a developmental pass on this chapter" on /: Change "Ask the AI..." to "Ask the Editor..."
3. In "Writing desk" (src/screens/Write.tsx · Write), the list "Chapter status" on /: chapter status dropdown menu should be hard-coded to the status of the kanban and editing stages
4. In "Genre guide for new manuscripts" (src/components/GenrePicker.tsx · GenrePicker), the list "No genre yet Fantasy Science fiction Mystery and crime Th..." on /: genres in the manuscript do not match genres listed in the formatting section - pull genres from a source like Reedsy.com to have a more complete genre list and make sure the genre selected is cohesive with each section of the app
5. In "Writing desk" (src/screens/Write.tsx · Write), the button "Open the Ghostwriter" on /: test whether the ghostwriter agent can work directly from an outline by creating a test outline and manuscript
Add to the plan: yes

- Outcome: finished, and the checks passed
- Cost: $0.18

- Integration: All five Round 6 changes are in. `tsc --noEmit` and `vite build` both pass. I have not run the app in a browser, so the UI behaviour is checked by reading the code only. (11 files)

Written by Ganger from the build's rounds. A round's own commit is the one that contains its entry here.
