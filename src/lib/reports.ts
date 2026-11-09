import { db, type EditStage, type Manuscript, type Suggestion } from "@/db/schema";
import { AGENT_LABEL } from "./ai";
import { chapterLabel, numberChapters, sortChapters } from "./chapters";
import { downloadBlob, fileSafeName } from "./download";
import { stageInfo, workflowOf } from "./editing";
import { formatDate } from "./utils";

/**
 * The reports the editor agents generate: the developmental editors' report,
 * and the line, copy and proofreading passes' notes and changes. The Reports
 * menu in the Edit screen lists them and exports any of them to the author's
 * local drive as a Markdown file.
 */

export interface StageReport {
  stage: EditStage;
  /** The report's name, e.g. "Developmental edit report". */
  title: string;
  /** Who wrote it, e.g. "Line editor". */
  agentLabel: string;
  /** Where the pass stands in the workflow. */
  statusLabel: "Not started" | "In progress" | "Finished";
  /** The agent's items for the whole book, oldest first. */
  items: Suggestion[];
}

export const REPORT_TITLE: Record<EditStage, string> = {
  developmental: "Developmental edit report",
  line: "Line editing report",
  copy: "Copy editing report",
  proofread: "Proofreading report",
};

/** Everything one pass produced for the book, for the Reports menu and the export. */
export async function collectStageReport(manuscript: Manuscript, stage: EditStage): Promise<StageReport> {
  const workflow = workflowOf(manuscript);
  const rows = await db.suggestions.where("manuscriptId").equals(manuscript.id).toArray();
  // Items made before the workflow existed carry no pass; they belong to the pass being worked on.
  const items = rows
    .filter((s) => s.source === "ai" && (s.stage === stage || (s.stage === undefined && stage === workflow.stage)))
    .sort((a, b) => a.createdAt - b.createdAt);
  const info = stageInfo(stage);
  return {
    stage,
    title: REPORT_TITLE[stage],
    agentLabel: stage === "developmental" ? "The developmental editors" : AGENT_LABEL[info.role],
    statusLabel: workflow.completed.includes(stage) ? "Finished" : workflow.stage === stage ? "In progress" : "Not started",
    items,
  };
}

function statusWord(s: Suggestion): string {
  if (s.kind === "note") return s.status === "accepted" ? "Addressed" : s.status === "rejected" ? "Dismissed" : "Open";
  return s.status === "accepted" ? "Accepted" : s.status === "rejected" ? "Rejected" : "Open";
}

/** The report as a Markdown document, grouped by editor (developmental) or by chapter. */
export function stageReportMarkdown(
  manuscript: Manuscript,
  authorName: string,
  report: StageReport,
  chapterTitleOf: (chapterId: string) => string,
): string {
  const head = [
    `# ${report.title} — ${manuscript.title.trim() || "Untitled"}`,
    `By ${authorName.trim() || "the author"} · Written by ${report.agentLabel} · Pass ${report.statusLabel.toLowerCase()} · Exported ${formatDate(Date.now())}`,
    "",
  ];

  if (report.stage === "developmental") {
    const agents = [...new Set(report.items.map((s) => s.agent).filter((a): a is string => Boolean(a)))];
    for (const agent of agents) {
      const notes = report.items.filter((s) => s.agent === agent);
      head.push(`## ${agent} (${notes.length})`, "");
      notes.forEach((note, i) => {
        const wholeBook = note.comment.startsWith("Whole book:");
        const where = wholeBook ? "the whole book" : chapterTitleOf(note.chapterId);
        head.push(`${i + 1}. **${statusWord(note)}** — on ${where}: ${note.comment.replace(/^Whole book:\s*/, "")}`);
      });
      head.push("");
    }
    return head.join("\n");
  }

  const chapterIds = [...new Set(report.items.map((s) => s.chapterId))];
  for (const chapterId of chapterIds) {
    const items = report.items.filter((s) => s.chapterId === chapterId);
    head.push(`## ${chapterTitleOf(chapterId)} (${items.length})`, "");
    items.forEach((s, i) => {
      if (s.kind === "note") {
        head.push(`${i + 1}. **${statusWord(s)}**${s.original ? ` — on “${s.original}”` : ""} — ${s.comment}`);
      } else {
        head.push(`${i + 1}. **${statusWord(s)}**`);
        head.push(`   - Was: “${s.original}”`);
        head.push(`   - Now: “${s.replacement || "(removed)"}”`);
        if (s.comment) head.push(`   - Why: ${s.comment}`);
      }
    });
    head.push("");
  }
  return head.join("\n");
}

/** The file name of an exported report, e.g. my-novel-line-report.md. */
export function reportFileName(manuscript: Manuscript, stage: EditStage): string {
  return `${fileSafeName(manuscript.title)}-${stage}-report.md`;
}

/** Writes the pass's report as a Markdown file on the author's local drive. Returns the file name. */
export async function exportStageReport(manuscript: Manuscript, authorName: string, stage: EditStage): Promise<string> {
  const report = await collectStageReport(manuscript, stage);
  if (report.items.length === 0) {
    throw new Error("This report is empty. The agent has not written anything for this pass yet.");
  }
  const chapters = await db.chapters.where("manuscriptId").equals(manuscript.id).toArray();
  const numbers = numberChapters(sortChapters(chapters));
  const chapterTitleOf = (chapterId: string): string => {
    const chapter = chapters.find((c) => c.id === chapterId);
    return chapter ? chapterLabel(chapter, numbers.get(chapter.id), "numbered-with-title") : "Chapter";
  };
  const markdown = stageReportMarkdown(manuscript, authorName, report, chapterTitleOf);
  const filename = reportFileName(manuscript, stage);
  downloadBlob(new Blob([markdown], { type: "text/markdown" }), filename);
  return filename;
}
