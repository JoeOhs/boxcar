import { useLiveQuery } from "dexie-react-hooks";
import { getEditModels, type AgentRole, type AiProvider, type AiSettings, type EditModels, type EditStage, type EditWorkflow, type Manuscript } from "@/db/schema";
import { DEFAULT_MODEL, DEFAULT_STAGE_MODEL } from "./providers";
import { patchManuscript } from "./store";

/** One pass of the editing workflow. */
export interface StageInfo {
  id: EditStage;
  label: string;
  /** What the pass is for, shown to the author. */
  summary: string;
  /** The AI role that does the pass. */
  role: AgentRole;
  /** Who the AI is told it is for this pass. */
  persona: string;
  /** What the AI is asked to do with one chapter. */
  task: string;
  /** Developmental feedback is notes about the story; the later passes propose exact text changes. */
  output: "notes" | "changes";
}

/** The four passes, in the order they are done. */
export const EDIT_STAGES: StageInfo[] = [
  {
    id: "developmental",
    label: "Developmental",
    summary:
      'The first pass looks at the "big picture": plot, narrative arc, character consistency and overall organization. Editor and author work together to finesse the story structure or the logic of the argument.',
    role: "dev-editor",
    persona:
      "You are the Developmental Editor at a small publishing house (also known as a structural or substantive editor). Your focus is on the big-picture elements of a manuscript, such as plot, character development, pacing, argument clarity, and overall structure, rather than grammar or spelling. You give the author honest, specific feedback on pacing, voice, clarity and continuity, and you respect the author's style. You act as a collaborative partner to the author, providing a detailed editorial report that outlines strengths, weaknesses, and actionable suggestions for revision.\n\nKey responsibilities include:\n\n-Analyzing Structure: Identifying plot holes, inconsistent characterization, logical gaps, or poor organization.\n\n-Providing Feedback: Offering insights on tone, audience appeal, and thematic consistency to ensure the manuscript resonates with its intended readers.\n\n-Guiding Revision: Suggesting reordering of chapters, deepening of arcs, or tightening of focus, while leaving the actual rewriting to the author.",
    task: "Give developmental notes on the chapter below, in the context of the whole book. Look for plot holes, a weak or missing arc, inconsistent characters, scenes in the wrong place, and gaps in the argument or structure.",
    output: "notes",
  },
  {
    id: "line",
    label: "Line editing",
    summary:
      "This pass refines the prose: sentence flow, voice and style, removing redundancies and tightening paragraphs.",
    role: "line-editor",
    persona:
      "You are the Line Editor at a small publishing house. Your role is to refine a manuscript at the sentence and paragraph levels to enhance style, tone, clarity, and flow. Your primary role is to sharpen the author's unique voice by tightening sentence structure, eliminating redundancy, and ensuring the prose delivers the intended emotional impact and readability.\n\nKey responsibilities include:\n\n-Refining Language: Replacing vague or weak words with precise, vivid alternatives to strengthen the narrative.\n\n-Improving Flow: Adjusting sentence rhythm and varying structure to maintain reader engagement and logical progression.\n\n-Preserving Voice: Ensuring consistency in tone and character voice without imposing the editor's own style on the work.\n\n-Balancing Detail: Removing \"fluff\" or unnecessary clutter while retaining essential details that serve the story or argument.\n\nThis process occurs after developmental editing and before copy editing, focusing on how the story is told rather than correcting grammar or restructuring the plot.",
    task: "Line edit the chapter below. Find sentences and paragraphs where the flow, voice or style can be improved, or where the text is redundant or loose.",
    output: "changes",
  },
  {
    id: "copy",
    label: "Copy editing",
    summary:
      'A "fine-toothed comb" review of grammar, punctuation, spelling, and consistency with a specific style guide.',
    role: "copy-editor",
    persona:
      "You are the Copy Editor at a small publishing house. You go through the text with a fine-toothed comb for grammar, punctuation and spelling, and you check it is consistent (names, numbers, hyphenation, capitalisation) and follows the style guide you were given. You do not rewrite the author's style.",
    task: "Copy edit the chapter below. Find real errors in grammar, punctuation and spelling, and inconsistencies with the style guide.",
    output: "changes",
  },
  {
    id: "proofread",
    label: "Proofreading",
    summary:
      "The final check that catches typos, formatting errors and layout issues before publication.",
    role: "proofreader",
    persona:
      "You are the Proofreader at a small publishing house. This is the last check before publication. You find typos, doubled words, stray characters, inconsistent scene breaks, spacing and formatting errors, and anything that would look wrong on the page. You change as little as possible.",
    task: "Proofread the chapter below. Find typos, repeated words, wrong or missing punctuation marks, stray symbols, spacing problems and formatting or layout slips.",
    output: "changes",
  },
];

export function stageInfo(stage: EditStage): StageInfo {
  return EDIT_STAGES.find((s) => s.id === stage) ?? EDIT_STAGES[0];
}

/**
 * The model for one pass: the author's choice, else the default for that pass, else the
 * model on the author's key (providers such as Ollama have no defaults of their own).
 */
export function modelForStage(provider: AiProvider, models: EditModels, stage: EditStage, keyModel = ""): string {
  return models[provider]?.[stage]?.trim() || DEFAULT_STAGE_MODEL[provider][stage] || keyModel || DEFAULT_MODEL[provider];
}
/** The AI settings to use for one pass: the author's key and provider with that pass's model. */
export function settingsForStage(settings: AiSettings, models: EditModels, stage: EditStage): AiSettings {
  return { ...settings, model: modelForStage(settings.provider, models, stage, settings.model) };
}

/** The models the author chose. undefined while loading. */
export function useEditModels(): EditModels | undefined {
  return useLiveQuery(() => getEditModels(), []);
}

// ---------------------------------------------------------------------------
// Workflow progress, stored on the manuscript
// ---------------------------------------------------------------------------

const ORDER: EditStage[] = EDIT_STAGES.map((s) => s.id);

/** Index of the first pass that is not finished (ORDER.length when all four are). */
function firstUnfinished(completed: EditStage[]): number {
  const at = ORDER.findIndex((s) => !completed.includes(s));
  return at === -1 ? ORDER.length : at;
}

/** True when the author may work in a pass: every pass before it is finished. */
export function isStageOpen(workflow: EditWorkflow, stage: EditStage): boolean {
  return ORDER.indexOf(stage) <= firstUnfinished(workflow.completed);
}

/** The manuscript's workflow, starting at the developmental pass when none has been saved. */
export function workflowOf(manuscript: Manuscript): EditWorkflow {
  const saved = manuscript.editWorkflow;
  const completed = ORDER.filter((s) => saved?.completed.includes(s));
  const base: EditWorkflow = { stage: saved?.stage ?? "developmental", completed, styleGuide: saved?.styleGuide ?? "" };
  return isStageOpen(base, base.stage) ? base : { ...base, stage: ORDER[Math.min(firstUnfinished(completed), ORDER.length - 1)] };
}

function save(manuscript: Manuscript, next: EditWorkflow): Promise<void> {
  return patchManuscript(manuscript.id, { editWorkflow: next });
}

/** Moves to a pass, if it is open. */
export async function selectStage(manuscript: Manuscript, stage: EditStage): Promise<void> {
  const workflow = workflowOf(manuscript);
  if (isStageOpen(workflow, stage)) await save(manuscript, { ...workflow, stage });
}

/** Marks a pass finished and moves on to the next one. */
export async function completeStage(manuscript: Manuscript, stage: EditStage): Promise<void> {
  const workflow = workflowOf(manuscript);
  if (!isStageOpen(workflow, stage)) return;
  const completed = ORDER.filter((s) => s === stage || workflow.completed.includes(s));
  const next = ORDER[ORDER.indexOf(stage) + 1] ?? stage;
  await save(manuscript, { ...workflow, completed, stage: next });
}

/** Opens a finished pass again. The passes after it depend on it, so they are opened again too. */
export async function reopenStage(manuscript: Manuscript, stage: EditStage): Promise<void> {
  const workflow = workflowOf(manuscript);
  const keep = ORDER.slice(0, ORDER.indexOf(stage));
  await save(manuscript, { ...workflow, completed: workflow.completed.filter((s) => keep.includes(s)), stage });
}

export async function setStyleGuide(manuscript: Manuscript, styleGuide: string): Promise<void> {
  await save(manuscript, { ...workflowOf(manuscript), styleGuide });
}

/** The manuscript's own status, worked out from the editing passes rather than set by hand. */
export type ManuscriptPhase = "draft" | "revision" | "finalized";

export const MANUSCRIPT_PHASE_LABEL: Record<ManuscriptPhase, string> = {
  draft: "Draft",
  revision: "Revision",
  finalized: "Finalized",
};

/**
 * Draft until the developmental editors have finished their pass, Revision from
 * then until every editing pass is done, and Finalized once all four are done.
 */
export function manuscriptPhase(manuscript: Manuscript): ManuscriptPhase {
  const workflow = workflowOf(manuscript);
  if (EDIT_STAGES.every((stage) => workflow.completed.includes(stage.id))) return "finalized";
  if (workflow.completed.includes("developmental")) return "revision";
  return "draft";
}
