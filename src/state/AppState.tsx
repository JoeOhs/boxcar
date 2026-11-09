import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, setSetting, type Id, type Manuscript, type Workspace } from "@/db/schema";
import { useOnline } from "@/lib/hooks";

export type Screen =
  | "manuscripts"
  | "roadmap"
  | "universe"
  | "write"
  | "edit"
  | "format"
  | "cover"
  | "export"
  | "translate"
  | "settings";
export type Theme = "light" | "dark";

interface AppState {
  /** True until the saved choices have been read from the local database. */
  loading: boolean;
  /** True once a workspace has been chosen or created in this session. Until then the app shows only the workspace screen. */
  entered: boolean;
  online: boolean;
  screen: Screen;
  navigate: (screen: Screen) => void;
  workspaces: Workspace[];
  /** The author / pen name being worked in. */
  workspace: Workspace | undefined;
  /** The books of the active workspace (series containers are not books, so they are left out). */
  manuscripts: Manuscript[];
  /** The book brought to the workspace. Undefined until the author brings one, which keeps the book screens greyed out. */
  manuscript: Manuscript | undefined;
  /** The chapter shared by the Write and Edit screens. */
  chapterId: Id | null;
  setChapterId: (id: Id | null) => void;
  /** Saves unfinished typing; the Write screen registers its autosave here. */
  setFlusher: (run: (() => Promise<void>) | null) => void;
  /** Opens a workspace: makes it the active one and leaves the first screen. */
  selectWorkspace: (id: Id) => void;
  /** Brings a book to the workspace, after saving whatever work was open in the previous one. */
  selectManuscript: (id: Id) => void;
  /** A note a developmental flag was pushed to the writing space with. */
  pushedNote: { chapterId: Id; text: string } | null;
  setPushedNote: (note: { chapterId: Id; text: string } | null) => void;
  theme: Theme;
  toggleTheme: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("manuscripts");
  const [chapterId, setChapterId] = useState<Id | null>(null);
  const [entered, setEntered] = useState(false);
  // The workspace picked in this session; it wins over the saved choice while the saved one is still being written.
  const [pickedId, setPickedId] = useState<Id | null>(null);
  const [pushedNote, setPushedNote] = useState<{ chapterId: Id; text: string } | null>(null);
  const online = useOnline();
  // The Write screen keeps its unsaved draft here, so bringing another book to
  // the workspace saves the old one first.
  const flusher = useRef<(() => Promise<void>) | null>(null);
  const setFlusher = useCallback((run: (() => Promise<void>) | null) => {
    flusher.current = run;
  }, []);
  const flush = useCallback(async () => {
    try {
      await flusher.current?.();
    } catch {
      // Saving is retried when the editor is unmounted; a failure here must not block the switch.
    }
  }, []);

  // undefined = still loading, null = nothing saved yet.
  const activeWorkspaceId = useLiveQuery(async () => (await getSetting<Id>("activeWorkspaceId")) ?? null, []);
  const activeManuscriptId = useLiveQuery(async () => (await getSetting<Id>("activeManuscriptId")) ?? null, []);
  // The app opens in dark mode; the light/dark button saves the author's choice.
  const savedTheme = useLiveQuery(async () => (await getSetting<Theme>("theme")) ?? "dark", [], "dark");
  const workspaceRows = useLiveQuery(() => db.workspaces.orderBy("name").toArray(), []);

  const workspaces = useMemo(() => workspaceRows ?? [], [workspaceRows]);
  const workspace = workspaces.find((w) => w.id === (pickedId ?? activeWorkspaceId)) ?? workspaces[0];

  const manuscriptRows = useLiveQuery(
    async () => {
      if (!workspace) return [];
      const rows = await db.manuscripts.where("workspaceId").equals(workspace.id).toArray();
      return rows.filter((m) => m.type !== "series").sort((a, b) => a.title.localeCompare(b.title));
    },
    [workspace?.id],
  );
  const manuscripts = useMemo(() => manuscriptRows ?? [], [manuscriptRows]);
  // Only the book the author brought to the workspace is active. Nothing is
  // active by default, so the book screens stay greyed out until a choice is made.
  const manuscript = manuscripts.find((m) => m.id === activeManuscriptId);

  const theme: Theme = savedTheme === "light" ? "light" : "dark";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const selectWorkspace = useCallback(
    (id: Id) => {
      void (async () => {
        await flush();
        await setSetting("activeWorkspaceId", id);
        setPickedId(id);
        setChapterId(null);
        setPushedNote(null);
        setEntered(true);
      })();
    },
    [flush],
  );
  const selectManuscript = useCallback(
    (id: Id) => {
      void (async () => {
        await flush();
        await setSetting("activeManuscriptId", id);
        setChapterId(null);
        setPushedNote(null);
      })();
    },
    [flush],
  );
  const toggleTheme = useCallback(() => {
    void setSetting("theme", theme === "dark" ? "light" : "dark");
  }, [theme]);

  const stillReading =
    activeWorkspaceId === undefined ||
    activeManuscriptId === undefined ||
    workspaceRows === undefined ||
    manuscriptRows === undefined;
  // Only the first read counts as loading; later switches of workspace update in place.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!stillReading) setReady(true);
  }, [stillReading]);
  const loading = !ready;

  const value: AppState = {
    loading,
    entered,
    online,
    screen,
    navigate: setScreen,
    workspaces,
    workspace,
    manuscripts,
    manuscript,
    chapterId,
    setChapterId,
    setFlusher,
    selectWorkspace,
    selectManuscript,
    pushedNote,
    setPushedNote,
    theme,
    toggleTheme,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
