import type { ScriptDefinition } from "./script-types";

export const SAMPLE_SCRIPT_NAME = "MSP cold call — sample";

export const sampleDefinition: ScriptDefinition = {
  steps: [
    {
      id: "gk1",
      caller_line: "Hi, this is Luke — who handles your IT support over there?",
      is_entry: true,
      entry_scenario: "gatekeeper",
      responses: [
        { id: "r1", label: "I'll put you through", next_step_id: "intro" },
        { id: "r2", label: "They're not available", next_step_id: "gk_followup" },
        { id: "r3", label: "We handle IT in-house", next_step_id: "in_house" },
        { id: "r4", label: "What's this regarding?", next_step_id: "gk_reason" },
      ],
    },
    {
      id: "dc1",
      caller_line: "Hi {name}, this is Luke — do you have thirty seconds before I get to why I'm calling?",
      is_entry: true,
      entry_scenario: "direct_contact",
      responses: [
        { id: "r5", label: "Sure, go ahead", next_step_id: "intro" },
        { id: "r6", label: "Now's not a good time", next_step_id: "reschedule" },
        { id: "r7", label: "Just send me an email", next_step_id: "email_push" },
      ],
    },
    {
      id: "nn1",
      caller_line: "Hi, I was hoping you could point me to whoever looks after your IT and cybersecurity.",
      is_entry: true,
      entry_scenario: "no_name",
      responses: [
        { id: "r8", label: "That would be [name]", next_step_id: "intro" },
        { id: "r9", label: "We don't share that", next_step_id: "in_house" },
      ],
    },
    {
      id: "cv1",
      caller_line: "Hi, sorry to call your mobile — is this still the best number for you for work?",
      is_entry: true,
      entry_scenario: "cell_vs_company",
      responses: [
        { id: "r10", label: "Yes, this is fine", next_step_id: "intro" },
        { id: "r11", label: "Use the office line", next_step_id: "reschedule" },
      ],
    },
    {
      id: "gk_followup",
      caller_line: "No problem — when's a good time to try them back?",
      responses: [
        { id: "r12", label: "Try later today", next_step_id: "reschedule" },
        { id: "r13", label: "Leave a message", next_step_id: "voicemail" },
      ],
    },
    {
      id: "gk_reason",
      caller_line: "We help MSPs in the area cover their off-hours support — I wanted to see if it's worth a quick chat.",
      responses: [
        { id: "r14", label: "Okay, putting you through", next_step_id: "intro" },
        { id: "r15", label: "Not interested", next_step_id: "polite_close" },
      ],
    },
    {
      id: "intro",
      caller_line: "Thanks. The reason I'm calling — we cover after-hours tickets for MSPs so your engineers can sleep. Worth a fifteen-minute look?",
      responses: [
        { id: "r16", label: "Yes, book it", next_step_id: "book" },
        { id: "r17", label: "Tell me more first", next_step_id: "more_info" },
        { id: "r18", label: "Not a priority right now", next_step_id: "polite_close" },
      ],
    },
    {
      id: "more_info",
      caller_line: "Of course — we white-label, your clients never know it's us, and you only pay for tickets we actually touch.",
      responses: [
        { id: "r19", label: "Okay, let's book it", next_step_id: "book" },
        { id: "r20", label: "Send me details", next_step_id: "email_push" },
      ],
    },
    {
      id: "book",
      caller_line: "Great — does Tuesday or Thursday afternoon work better for you?",
      responses: [
        { id: "r21", label: "Tuesday", next_step_id: "confirm" },
        { id: "r22", label: "Thursday", next_step_id: "confirm" },
      ],
    },
    { id: "confirm", caller_line: "Perfect — I'll send a calendar invite. Talk soon.", responses: [] },
    { id: "in_house", caller_line: "Understood — appreciate the time. Have a good one.", responses: [] },
    { id: "polite_close", caller_line: "No worries — thanks for the moment. Take care.", responses: [] },
    { id: "email_push", caller_line: "Happy to — what's the best email? I'll keep it to one paragraph.", responses: [] },
    { id: "voicemail", caller_line: "Will do — thanks for your help.", responses: [] },
    { id: "reschedule", caller_line: "Got it — I'll try back then. Thanks.", responses: [] },
  ],
};
