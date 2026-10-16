import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, setSetting, type Id, type Manuscript, type Workspace } from "@/db/schema";
import { useOnline } from "@/lib/hooks";

export type Screen = "manuscripts" | "roadmap" | "outline" | "write" | "edit" | "format" | "cover" | "export" | "settings";
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
  /** Manuscripts of the active workspace. */
  manuscripts: Manuscript[];
  /** The book being worked on. */
  manuscript: Manuscript | undefined;
  /** The chapter shared by the Write and Edit screens. */
  chapterId: Id | null;
  setChapterId: (id: Id | null) => void;
  /** Opens a workspace: makes it the active one and leaves the first screen. */
  selectWorkspace: (id: Id) => void;
  selectManuscript: (id: Id) => void;
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
  const online = useOnline();

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
      return rows.sort((a, b) => a.title.localeCompare(b.title));
    },
    [workspace?.id],
  );
  const manuscripts = useMemo(() => manuscriptRows ?? [], [manuscriptRows]);
  const manuscript = manuscripts.find((m) => m.id === activeManuscriptId) ?? manuscripts[0];

  const theme: Theme = savedTheme === "light" ? "light" : "dark";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const selectWorkspace = useCallback((id: Id) => {
    void setSetting("activeWorkspaceId", id);
    setPickedId(id);
    setChapterId(null);
    setEntered(true);
  }, []);
  const selectManuscript = useCallback((id: Id) => {
    void setSetting("activeManuscriptId", id);
    setChapterId(null);
  }, []);
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
    selectWorkspace,
    selectManuscript,
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
