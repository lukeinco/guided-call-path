export type EntryScenario = "gatekeeper" | "direct_contact" | "no_name" | "cell_vs_company";

export const SCENARIO_LABEL: Record<EntryScenario, string> = {
  gatekeeper: "Gatekeeper",
  direct_contact: "Direct contact",
  no_name: "No contact name",
  cell_vs_company: "Cell vs. company line",
};

export interface ScriptResponse {
  id: string;
  label: string;
  next_step_id?: string | null;
}

export interface ScriptStep {
  id: string;
  caller_line: string;
  is_entry?: boolean;
  entry_scenario?: EntryScenario | null;
  responses: ScriptResponse[];
}

export interface ScriptDefinition {
  steps: ScriptStep[];
}

export function emptyDefinition(): ScriptDefinition {
  return { steps: [] };
}

export function newStepId() {
  return "s_" + Math.random().toString(36).slice(2, 9);
}
export function newResponseId() {
  return "r_" + Math.random().toString(36).slice(2, 9);
}
