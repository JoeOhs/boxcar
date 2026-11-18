import { Users } from "lucide-react";
import { saveEditModel } from "@/db/schema";
import { AGENT_LABEL, useAiSettings } from "@/lib/ai";
import { EDIT_STAGES, modelForStage, useEditModels } from "@/lib/editing";
import { MODEL_SUGGESTIONS, PROVIDER_LABEL } from "@/lib/providers";
import { ModelSelect } from "@/components/ModelSelect";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/** What each pass's model also covers, beyond the agent's own name. */
const COVERS: Partial<Record<string, string>> = {
  developmental: "All four developmental specialists, and the chapter summaries they read.",
};

/**
 * One model dropdown per editing agent, for the provider of the key in use. This is the
 * only place the editing models are chosen; the Edit screen shows which model a pass uses.
 * Choices are saved per provider, so switching keys keeps each provider's picks.
 */
export function EditingTeamModels() {
  const ai = useAiSettings();
  const models = useEditModels();

  return (
    <Card className="max-w-xl space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Editing team</h2>
      </div>
      {ai === undefined || models === undefined ? null : ai === null ? (
        <p className="text-sm text-muted-foreground">Add an AI staff key above, then choose a model for each editor here.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Each editor can run on a different {PROVIDER_LABEL[ai.provider]} model. A stronger model suits the big-picture
            passes; a faster one is often enough for proofreading.
          </p>
          <div className="space-y-3">
            {EDIT_STAGES.map((stage) => (
              <div key={stage.id} className="grid grid-cols-[1fr_14rem] items-center gap-3">
                <div>
                  <Label htmlFor={`team-model-${stage.id}`}>{AGENT_LABEL[stage.role]}</Label>
                  <p className="text-xs text-muted-foreground">{COVERS[stage.id] ?? `${stage.label} pass.`}</p>
                </div>
                <ModelSelect
                  id={`team-model-${stage.id}`}
                  className="h-8 text-xs"
                  options={MODEL_SUGGESTIONS[ai.provider]}
                  value={modelForStage(ai.provider, models, stage.id, ai.model)}
                  onChange={(model) => void saveEditModel(ai.provider, stage.id, model)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
