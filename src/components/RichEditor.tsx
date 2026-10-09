import { useLayoutEffect, useRef, type ClipboardEvent, type ReactNode } from "react";
import { Bold, Heading2, Italic, List, ListOrdered, Minus, Quote, Redo2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function Tool({ label, command, value, children }: { label: string; command: string; value?: string; children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      // Keep the text selection while the toolbar is used.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => document.execCommand(command, false, value)}
    >
      {children}
    </Button>
  );
}

/** Formatting buttons (bold, italic, headings, quotes, lists, scene breaks). They act on the text field that has focus. */
export function EditorToolbar() {
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-4 py-1.5">
      <Tool label="Bold" command="bold"><Bold /></Tool>
      <Tool label="Italic" command="italic"><Italic /></Tool>
      <Tool label="Heading" command="formatBlock" value="h2"><Heading2 /></Tool>
      <Tool label="Quote" command="formatBlock" value="blockquote"><Quote /></Tool>
      <Tool label="Normal paragraph" command="formatBlock" value="p"><span className="text-xs font-semibold">P</span></Tool>
      <Tool label="Bulleted list" command="insertUnorderedList"><List /></Tool>
      <Tool label="Numbered list" command="insertOrderedList"><ListOrdered /></Tool>
      <Tool label="Scene break" command="insertHorizontalRule"><Minus /></Tool>
      <div className="mx-1 h-5 w-px bg-border" />
      <Tool label="Undo" command="undo"><Undo2 /></Tool>
      <Tool label="Redo" command="redo"><Redo2 /></Tool>
    </div>
  );
}

interface Props {
  /** The text the field starts with. Give it a `key` to switch documents. */
  initialHtml: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  className?: string;
}

/** One editable block of manuscript text. */
export function EditableHtml({ initialHtml, onChange, onFocus, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    document.execCommand("defaultParagraphSeparator", false, "p");
    // Runs once per document: the parent re-mounts this component with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    // Paste as plain text so pasted fonts and colours never leak into the book.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-hint="Start writing..."
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      onFocus={onFocus}
      onPaste={handlePaste}
      className={cn("editor-surface prose-manuscript min-h-24", className)}
    />
  );
}
