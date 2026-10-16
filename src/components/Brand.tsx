import { BookOpen, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";

/** The app's name: "boxcar", with "Publishing Studio" underneath. */
export function Brand({ large = false, className }: { large?: boolean; className?: string }) {
  const Name = large ? "h1" : "p";
  return (
    <div className={cn("flex items-center gap-2.5", large && "flex-col gap-2 text-center", className)}>
      <BookOpen className={large ? "size-8" : "size-5"} />
      <div className="leading-tight">
        <Name className={cn("font-serif font-semibold tracking-tight", large ? "text-3xl" : "text-lg")}>boxcar</Name>
        <p
          className={cn(
            "uppercase text-muted-foreground",
            large ? "mt-1 text-xs tracking-[0.3em]" : "text-[10px] tracking-[0.2em]",
          )}
        >
          Publishing Studio
        </p>
      </div>
    </div>
  );
}

/** The light/dark mode button. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useApp();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
