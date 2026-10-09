import type { ReactNode } from "react";
import {
  BookOpen,
  Download,
  LayoutTemplate,
  Library,
  ListTree,
  Moon,
  Palette,
  PenLine,
  Settings as SettingsIcon,
  SpellCheck,
  Sun,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type Screen } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Manuscripts } from "@/screens/Manuscripts";
import { WorkspaceGate } from "@/screens/WorkspaceGate";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Outline } from "@/screens/Outline";
import { Write } from "@/screens/Write";
import { Edit } from "@/screens/Edit";
import { BookCover } from "@/screens/BookCover";
import { Format } from "@/screens/Format";
import { Export } from "@/screens/Export";
import { Settings } from "@/screens/Settings";

const NAV: { screen: Screen; label: string; icon: ReactNode }[] = [
  { screen: "manuscripts", label: "Manuscripts", icon: <Library /> },
  { screen: "outline", label: "Outline", icon: <ListTree /> },
  { screen: "write", label: "Write", icon: <PenLine /> },
  { screen: "edit", label: "Edit", icon: <SpellCheck /> },
  { screen: "format", label: "Format", icon: <LayoutTemplate /> },
  { screen: "cover", label: "Book Cover", icon: <Palette /> },
  { screen: "export", label: "Export", icon: <Download /> },
];

function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case "manuscripts":
      return <Manuscripts />;
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
    case "settings":
      return <Settings />;
  }
}

function NavButton({ screen, label, icon }: { screen: Screen; label: string; icon: ReactNode }) {
  const { screen: current, navigate } = useApp();
  const active = current === screen;
  return (
    <button
      onClick={() => navigate(screen)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors [&_svg]:size-4",
        active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default function App() {
  const { loading, entered, online, screen, workspace, theme, toggleTheme } = useApp();

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Opening your library...</div>;
  }

  // The first screen: pick or create a workspace before anything else is shown.
  if (!entered || !workspace) return <WorkspaceGate />;

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/50">
        <div className="flex items-center gap-2 px-5 pb-3 pt-5">
          <BookOpen className="size-5" />
          <span className="font-serif text-lg font-semibold tracking-tight">Boxcar Studio</span>
        </div>

        <div className="space-y-2 px-4 pb-3">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workspace</p>
            <p className="truncate rounded-md bg-accent px-3 py-2 font-serif text-sm font-semibold" title={workspace.name}>
              {workspace.name}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV.map((item) => (
            <NavButton key={item.screen} {...item} />
          ))}
        </nav>

        <div className="space-y-1 border-t border-border px-3 py-3">
          {!online ? (
            <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
              <WifiOff className="size-3.5" /> Offline. Your work is saved on this computer.
            </div>
          ) : null}
          <WorkspaceSwitcher />
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <NavButton screen="settings" label="Settings" icon={<SettingsIcon />} />
            </div>
            <Button variant="ghost" size="icon" title={theme === "dark" ? "Light theme" : "Dark theme"} onClick={toggleTheme}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <CurrentScreen screen={screen} />
      </main>
    </div>
  );
}
