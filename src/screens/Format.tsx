import { useMemo, useState, type ReactNode } from "react";
import { DEFAULT_FORMAT, type FormatSettings, type HeadingStyle, type Manuscript, type ParagraphStyle, type TrimSize } from "@/db/schema";
import { AgentChat } from "@/components/AgentChat";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { buildPreviewDocument, FONT_CHOICES, TRIM_SIZES } from "@/lib/epub";
import { useChapters } from "@/lib/hooks";
import { patchManuscript } from "@/lib/store";
import { useApp } from "@/state/AppState";

const SCENE_BREAKS = ["* * *", "***", "---", "~", "◆"];

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FormatBody({ manuscript }: { manuscript: Manuscript }) {
  const { workspace } = useApp();
  const chapters = useChapters(manuscript.id);
  // Settings are kept locally while the author drags a control, and written through to the manuscript.
  const [fmt, setFmt] = useState<FormatSettings>(manuscript.format);
  const [showAi, setShowAi] = useState(false);

  function change(changes: Partial<FormatSettings>) {
    const next = { ...fmt, ...changes };
    setFmt(next);
    void patchManuscript(manuscript.id, { format: next });
  }

  const preview = useMemo(
    () => buildPreviewDocument(manuscript, workspace?.name ?? "", chapters ?? [], fmt),
    [manuscript, workspace?.name, chapters, fmt],
  );

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Format"
        description="How the book looks. The preview is built the same way as the exported epub."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => change({ ...DEFAULT_FORMAT })}>
              Reset to defaults
            </Button>
            <Button variant={showAi ? "secondary" : "outline"} size="sm" onClick={() => setShowAi((v) => !v)}>
              Formatter
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-r border-border p-5">
          <Field label="Font" htmlFor="f-font">
            <Select id="f-font" value={fmt.fontFamily} onChange={(e) => change({ fontFamily: e.target.value })}>
              {FONT_CHOICES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Text size: ${fmt.fontSizePercent}%`} htmlFor="f-size">
            <input
              id="f-size"
              type="range"
              min={80}
              max={140}
              step={5}
              value={fmt.fontSizePercent}
              onChange={(e) => change({ fontSizePercent: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </Field>
          <Field label={`Line spacing: ${fmt.lineHeight.toFixed(1)}`} htmlFor="f-line">
            <input
              id="f-line"
              type="range"
              min={1.2}
              max={2}
              step={0.1}
              value={fmt.lineHeight}
              onChange={(e) => change({ lineHeight: Math.round(Number(e.target.value) * 10) / 10 })}
              className="w-full accent-primary"
            />
          </Field>
          <Field label="Paragraphs" htmlFor="f-para">
            <Select id="f-para" value={fmt.paragraphStyle} onChange={(e) => change({ paragraphStyle: e.target.value as ParagraphStyle })}>
              <option value="indent">Indented first line (novels)</option>
              <option value="block">Space between paragraphs</option>
            </Select>
          </Field>
          <Field label="Chapter headings" htmlFor="f-heading">
            <Select id="f-heading" value={fmt.headingStyle} onChange={(e) => change({ headingStyle: e.target.value as HeadingStyle })}>
              <option value="plain">Title only</option>
              <option value="numbered">Chapter number only</option>
              <option value="numbered-with-title">Chapter number and title</option>
            </Select>
          </Field>
          <Field label="Scene break" htmlFor="f-scene">
            <div className="flex gap-2">
              <Input id="f-scene" value={fmt.sceneBreak} onChange={(e) => change({ sceneBreak: e.target.value })} className="w-28" />
              <Select
                aria-label="Scene break presets"
                value=""
                onChange={(e) => e.target.value && change({ sceneBreak: e.target.value })}
              >
                <option value="">Presets</option>
                {SCENE_BREAKS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fmt.dropCaps} onChange={(e) => change({ dropCaps: e.target.checked })} className="size-4 accent-primary" />
            Drop caps at the start of chapters
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fmt.includeTableOfContents}
              onChange={(e) => change({ includeTableOfContents: e.target.checked })}
              className="size-4 accent-primary"
            />
            Table of contents in the book
          </label>
          <Field label="Page size for the preview" htmlFor="f-trim">
            <Select id="f-trim" value={fmt.trimSize} onChange={(e) => change({ trimSize: e.target.value as TrimSize })}>
              {(Object.keys(TRIM_SIZES) as TrimSize[]).map((t) => (
                <option key={t} value={t}>
                  {TRIM_SIZES[t].label}
                </option>
              ))}
            </Select>
          </Field>
        </aside>

        <section className="min-w-0 flex-1 bg-muted/40">
          <iframe title="Book preview" sandbox="" srcDoc={preview} className="h-full w-full border-0" />
        </section>

        {showAi ? (
          <aside className="w-80 shrink-0 border-l border-border">
            <AgentChat
              manuscriptId={manuscript.id}
              role="formatter"
              getContext={() =>
                `Title: ${manuscript.title}\nChapters: ${chapters?.length ?? 0}\nCurrent format settings:\n${JSON.stringify(fmt, null, 2)}`
              }
              quickPrompts={[
                { label: "Review my format", prompt: "Review my current format settings for an Amazon KDP ebook and suggest improvements." },
              ]}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function Format() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <FormatBody key={manuscript.id} manuscript={manuscript} />;
}
