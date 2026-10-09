import type { ReactNode } from "react";

export function ScreenHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3">
      <div className="min-w-0">
        <h1 className="truncate font-serif text-xl font-semibold">{title}</h1>
        {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
