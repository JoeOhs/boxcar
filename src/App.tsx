import type { ReactNode } from "react";
import {
  BookOpen,
  Download,
  FolderOpen,
  LayoutTemplate,
  ListTree,
  Moon,
  PenLine,
  Settings as SettingsIcon,
  SpellCheck,
  Sun,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type Screen } from "@/state/AppState";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Workspaces } from "@/screens/Workspaces";
import { Outline } from "@/screens/Outline";
import { Write } from "@/screens/Write";
import { Edit } from "@/screens/Edit";
import { Format } from "@/screens/Format";
import { Export } from "@/screens/Export";
import { Settings } from "@/screens/Settings";

const NAV: { screen: Screen; label: string; icon: ReactNode }[] = [
  { screen: "workspaces", label: "Workspaces", icon: <FolderOpen /> },
  { screen: "outline", label: "Outline", icon: <ListTree /> },
  { screen: "write", label: "Write", icon: <PenLine /> },
  { screen: "edit", label: "Edit", icon: <SpellCheck /> },
  { screen: "format", label: "Format", icon: <LayoutTemplate /> },
  { screen: "export", label: "Export", icon: <Download /> },
];

function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case "workspaces":
      return <Workspaces />;
    case "outline":
      return <Outline />;
    case "write":
      return <Write />;
    case "edit":
      return <Edit />;
    case "format":
      return <Format />;
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
  const { loading, online, screen, workspaces, workspace, manuscripts, manuscript, selectWorkspace, selectManuscript, theme, toggleTheme } =
    useApp();

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/50">
        <div className="flex items-center gap-2 px-5 pb-3 pt-5">
          <BookOpen className="size-5" />
          <span className="font-serif text-lg font-semibold tracking-tight">Boxcar Studio</span>
        </div>

        <div className="space-y-2 px-4 pb-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="pen-name">
              Pen name
            </label>
            <Select
              id="pen-name"
              value={workspace?.id ?? ""}
              onChange={(e) => selectWorkspace(e.target.value)}
              disabled={workspaces.length === 0}
            >
              {workspaces.length === 0 ? <option value="">No workspaces</option> : null}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="manuscript">
              Manuscript
            </label>
            <Select
              id="manuscript"
              value={manuscript?.id ?? ""}
              onChange={(e) => selectManuscript(e.target.value)}
              disabled={manuscripts.length === 0}
            >
              {manuscripts.length === 0 ? <option value="">No manuscripts</option> : null}
              {manuscripts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
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
        {loading ? <div className="p-8 text-sm text-muted-foreground">Opening your library...</div> : <CurrentScreen screen={screen} />}
      </main>
    </div>
  );
}
