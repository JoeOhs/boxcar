import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  LayoutTemplate,
  SquareKanban,
  Library,
  ListTree,
  Palette,
  PenLine,
  Settings as SettingsIcon,
  SpellCheck,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type Screen } from "@/state/AppState";
import { Brand, ThemeToggle } from "@/components/Brand";
import { Manuscripts } from "@/screens/Manuscripts";
import { WorkspaceGate } from "@/screens/WorkspaceGate";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Button } from "@/components/ui/button";

/**
 * The book screens load the first time they are opened, so the app starts faster (F23).
 * The workspace gate and the Bookshelf, the first two screens anyone sees, stay in the
 * main bundle.
 */
const SCREEN_LOADERS = {
  roadmap: () => import("@/screens/Roadmap").then((m) => ({ default: m.Roadmap })),
  universe: () => import("@/screens/Universe").then((m) => ({ default: m.Universe })),
  write: () => import("@/screens/Write").then((m) => ({ default: m.Write })),
  edit: () => import("@/screens/Edit").then((m) => ({ default: m.Edit })),
  format: () => import("@/screens/Format").then((m) => ({ default: m.Format })),
  cover: () => import("@/screens/BookCover").then((m) => ({ default: m.BookCover })),
  export: () => import("@/screens/Export").then((m) => ({ default: m.Export })),
  translate: () => import("@/screens/Translate").then((m) => ({ default: m.Translate })),
  settings: () => import("@/screens/Settings").then((m) => ({ default: m.Settings })),
} satisfies Partial<Record<Screen, () => Promise<{ default: ComponentType }>>>;

const LAZY_SCREENS: Record<keyof typeof SCREEN_LOADERS, ComponentType> = {
  roadmap: lazy(SCREEN_LOADERS.roadmap),
  universe: lazy(SCREEN_LOADERS.universe),
  write: lazy(SCREEN_LOADERS.write),
  edit: lazy(SCREEN_LOADERS.edit),
  format: lazy(SCREEN_LOADERS.format),
  cover: lazy(SCREEN_LOADERS.cover),
  export: lazy(SCREEN_LOADERS.export),
  translate: lazy(SCREEN_LOADERS.translate),
  settings: lazy(SCREEN_LOADERS.settings),
};

/**
 * Downloads every screen in the background once the app is open. The service worker
 * caches what is downloaded, so this is what keeps screens never opened yet available
 * offline.
 */
function preloadScreens() {
  const run = () => Object.values(SCREEN_LOADERS).forEach((load) => void load().catch(() => {}));
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}

/** Remembers whether the left menu was left collapsed to icons. */
const SIDEBAR_KEY = "boxcar.sidebarCollapsed";

const NAV: { screen: Screen; label: string; icon: ReactNode }[] = [
  { screen: "manuscripts", label: "Bookshelf", icon: <Library /> },
  { screen: "roadmap", label: "Roadmap", icon: <SquareKanban /> },
  { screen: "universe", label: "Universe", icon: <ListTree /> },
  { screen: "write", label: "Write", icon: <PenLine /> },
  { screen: "edit", label: "Edit", icon: <SpellCheck /> },
  { screen: "format", label: "Format", icon: <LayoutTemplate /> },
  { screen: "cover", label: "Book Cover", icon: <Palette /> },
  { screen: "export", label: "Export", icon: <Download /> },
  { screen: "translate", label: "Translate", icon: <Languages /> },
];

/** Bookshelf and Settings are always open; the book screens need a book in the workspace. */
const OPEN_WITHOUT_BOOK: Screen[] = ["manuscripts", "settings"];

function CurrentScreen({ screen }: { screen: Screen }) {
  if (screen === "manuscripts") return <Manuscripts />;
  const Lazy = LAZY_SCREENS[screen];
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Opening...</div>}>
      <Lazy />
    </Suspense>
  );
}

function NavButton({ screen, label, icon, collapsed }: { screen: Screen; label: string; icon: ReactNode; collapsed: boolean }) {
  const { screen: current, navigate, manuscript } = useApp();
  const active = current === screen;
  const locked = !manuscript && !OPEN_WITHOUT_BOOK.includes(screen);
  const title = locked ? "Bring a manuscript to the workspace first" : collapsed ? label : undefined;
  return (
    <button
      onClick={() => navigate(screen)}
      disabled={locked}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={title}
      className={cn(
        "flex w-full items-center gap-3 rounded-md py-2 text-sm transition-colors [&_svg]:size-4",
        collapsed ? "justify-center px-0" : "px-3",
        locked
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {icon}
      {collapsed ? null : label}
    </button>
  );
}

export default function App() {
  const { loading, entered, online, screen, workspace } = useApp();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "yes");

  useEffect(() => {
    if (entered) preloadScreens();
  }, [entered]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_KEY, next ? "yes" : "no");
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Opening your library...</div>;
  }

  // The first screen: pick or create a workspace before anything else is shown.
  if (!entered || !workspace) return <WorkspaceGate />;

  const workspaceLabel = workspace.name || "No pen name yet";

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-muted/50 transition-[width] duration-150",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex items-center pt-4", collapsed ? "flex-col gap-3 px-2" : "justify-between gap-2 px-4")}>
          <Brand iconOnly={collapsed} className={collapsed ? undefined : "min-w-0"} />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand the menu" : "Collapse the menu to icons"}
            title={collapsed ? "Expand the menu" : "Collapse the menu to icons"}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>

        <div className={cn("space-y-2 pb-3 pt-3", collapsed ? "px-2" : "px-4")}>
          {collapsed ? (
            <div
              className="mx-auto flex size-10 items-center justify-center rounded-md bg-accent font-serif text-sm font-semibold"
              title={workspaceLabel}
            >
              {workspace.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          ) : (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workspace</p>
              <p className="truncate rounded-md bg-accent px-3 py-2 font-serif text-sm font-semibold" title={workspaceLabel}>
                {workspaceLabel}
              </p>
            </div>
          )}
        </div>

        <nav className={cn("flex-1 space-y-0.5 py-2", collapsed ? "px-2" : "px-3")}>
          {NAV.map((item) => (
            <NavButton key={item.screen} {...item} collapsed={collapsed} />
          ))}
        </nav>

        <div className={cn("space-y-1 border-t border-border py-3", collapsed ? "px-2" : "px-3")}>
          {!online ? (
            collapsed ? (
              <div className="flex justify-center py-1 text-muted-foreground" title="Offline. Your work is saved on this computer.">
                <WifiOff className="size-3.5" />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
                <WifiOff className="size-3.5" /> Offline. Your work is saved on this computer.
              </div>
            )
          ) : null}
          <WorkspaceSwitcher collapsed={collapsed} />
          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <div className={cn(!collapsed && "flex-1")}>
              <NavButton screen="settings" label="Settings" icon={<SettingsIcon />} collapsed={collapsed} />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <CurrentScreen screen={screen} />
      </main>
    </div>
  );
}
