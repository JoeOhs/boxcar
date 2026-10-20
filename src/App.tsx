import { useState, type ReactNode } from "react";
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
import { Roadmap } from "@/screens/Roadmap";
import { WorkspaceGate } from "@/screens/WorkspaceGate";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Outline } from "@/screens/Outline";
import { Write } from "@/screens/Write";
import { Edit } from "@/screens/Edit";
import { BookCover } from "@/screens/BookCover";
import { Format } from "@/screens/Format";
import { Export } from "@/screens/Export";
import { Translate } from "@/screens/Translate";
import { Settings } from "@/screens/Settings";
import { Button } from "@/components/ui/button";

/** Remembers whether the left menu was left collapsed to icons. */
const SIDEBAR_KEY = "boxcar.sidebarCollapsed";

const NAV: { screen: Screen; label: string; icon: ReactNode }[] = [
  { screen: "manuscripts", label: "Manuscripts", icon: <Library /> },
  { screen: "roadmap", label: "Roadmap", icon: <SquareKanban /> },
  { screen: "outline", label: "Outline", icon: <ListTree /> },
  { screen: "write", label: "Write", icon: <PenLine /> },
  { screen: "edit", label: "Edit", icon: <SpellCheck /> },
  { screen: "format", label: "Format", icon: <LayoutTemplate /> },
  { screen: "cover", label: "Book Cover", icon: <Palette /> },
  { screen: "export", label: "Export", icon: <Download /> },
  { screen: "translate", label: "Translate", icon: <Languages /> },
];

function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case "manuscripts":
      return <Manuscripts />;
    case "roadmap":
      return <Roadmap />;
    case "outline":
      return <Outline />;
    case "write":
      return <Write />;
    case "edit":
      return <Edit />;
    case "format":
      return <Format />;
    case "cover":
      return <BookCover />;
    case "export":
      return <Export />;
    case "translate":
      return <Translate />;
    case "settings":
      return <Settings />;
  }
}

function NavButton({ screen, label, icon, collapsed }: { screen: Screen; label: string; icon: ReactNode; collapsed: boolean }) {
  const { screen: current, navigate } = useApp();
  const active = current === screen;
  return (
    <button
      onClick={() => navigate(screen)}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md py-2 text-sm transition-colors [&_svg]:size-4",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
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
