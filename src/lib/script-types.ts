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
  is_most_likely?: boolean;
}

export interface ScriptStep {
  id: string;
  caller_line: string;
  is_entry?: boolean;
  entry_scenario?: EntryScenario | string | null;
  section_type?: string | null;
  x?: number | null;
  y?: number | null;
  responses: ScriptResponse[];
}

export interface ScriptDefinition {
  steps: ScriptStep[];
  objections?: unknown[];
  custom_section_types?: string[];
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

// Base section types available in every script. 'objection' is reserved for
// objection items and shouldn't be picked for regular steps in the Select.
export const BASE_SECTION_TYPES = [
  "gatekeeper_intro",
  "attention_grabber",
  "availability_check",
  "soft_disqualify",
  "pre_qualifying",
  "pain_points",
  "building_interest",
  "close",
] as const;

export type BaseSectionType = (typeof BASE_SECTION_TYPES)[number];

export const SECTION_TYPE_LABEL: Record<string, string> = {
  gatekeeper_intro: "Gatekeeper intro",
  attention_grabber: "Attention grabber",
  availability_check: "Availability check",
  soft_disqualify: "Soft disqualify",
  pre_qualifying: "Pre-qualifying",
  pain_points: "Pain points",
  building_interest: "Building interest",
  close: "Close",
  objection: "Objection",
};

export const SECTION_TYPE_DEFINITION: Record<string, string> = {
  attention_grabber:
    "The reason for your call — a value statement, a pain example, or a name-drop. Pick ONE, don't stack them.",
  availability_check:
    "Say 'have I caught you in the middle of anything' — never 'are you busy.' It disarms; the other signals low value.",
  soft_disqualify:
    "Give value, then pull it back ('I don't know if we're even a fit'). Lowers their guard — the opposite of a pushy rep.",
  pre_qualifying:
    "Yes/no questions tied to a pain you fix. Hunt for the slightest yes — the ding-ding-ding to go for the close.",
  pain_points:
    "Name the problems you fix when the questions didn't land. Get them nodding before you pitch.",
  building_interest:
    "The only place you talk about yourself — ROI, differentiation, name-drops. Keep it tight.",
  close:
    "Ask for the MEETING, not the sale. Quick close, close-after-pain, or pencil-for-later.",
  gatekeeper_intro:
    "Get past the front desk: get a name, a callback, or a transfer. Access, not offer.",
};
