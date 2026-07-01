// Master prompt handed to ChatGPT / Claude so it can interview an admin
// and hand back a JSON file that imports cleanly into this app.
//
// Keep this in sync with the shape in src/lib/script-types.ts and the
// importer in src/routes/editor.$scriptId.tsx.

export const AI_BUILDER_PROMPT = `You are helping me build a cold-call script for my sales team. We are going to work together in this chat: you interview me section by section, then output a single JSON file at the end that I will import into my script-runner app.

# The method (read this first, then follow it)

The immediate goal of every cold call is ONE thing: booking a MEETING. Not a sale, not a demo request, not a "send me info". A meeting on the calendar. Every line in the script should move toward that.

A call moves through named SECTIONS. Each section has a job. Use these exact section_type values:

- gatekeeper_intro — first line when a gatekeeper (receptionist, EA, generic answerer) picks up. Job: get transferred to, or the name of, the decision-maker. Warm, human, low-friction. Never pitch here.
- availability_check — first line when the decision-maker themselves picks up. Job: acknowledge the cold call honestly and earn 20 seconds. "I know I'm calling out of the blue — can I have 20 seconds to tell you why, and you can tell me to get lost?" style.
- attention_grabber — one specific, concrete reason you called THEM. A named peer, a trigger event, an industry-specific pain. NOT a value prop. Something they'd be embarrassed not to be curious about.
- soft_disqualify — a permission-based line that lets them opt out gracefully AND raises status. "It might not even be relevant to you, but…" The paradox: giving them the out makes them stay.
- pre_qualifying — 1–3 short questions to confirm they're actually a fit. Team size, current stack, current pain. Not a discovery interrogation — just enough to know if the meeting is worth booking.
- pain_points — you name the pain THEY have (based on the pre-qual). Specific, industry-grounded language, not generic "efficiency" talk. This is where you show you've talked to people like them before.
- building_interest — proof and pattern. Name-drop similar customers, a concrete outcome, a mechanism. Short. This is not a demo.
- close — the ask for the meeting. Specific: "Does Tuesday at 10 or Thursday at 2 work better?" Assumptive, calendar-anchored, tiny time commitment (15–20 min).

## Objections

Objections are a SEPARATE reusable list, not branches in the tree. Typical cold-call objections: "not interested", "send me an email", "we already have someone", "not the right person", "no budget", "call me back next quarter", "how did you get my number", "what is this about". Aim for 5–10.

For each objection, capture:
- label — the objection as the prospect actually says it, short.
- reframe — what the caller says back. Acknowledge, don't argue. Re-anchor to the meeting, not to defending the product.
- stages — the section_types where this objection is likely to come up (e.g. ["availability_check","attention_grabber"]).
- resume_section — the section_type the caller should return to after the reframe lands. Usually "attention_grabber" or "close".
- resume_step_id — a specific step id to jump back to, if one obviously fits. Null is fine.

## The step tree

Each step is one line the caller reads out loud (caller_line) plus 0–N responses (what the prospect might say). A response points to the next step by id, or has next_step_id: null to end the branch.

Rules:
- Each step has exactly ONE caller_line — never stack two sentences of pitch into one step. If it's two beats, it's two steps.
- Responses are what the PROSPECT says, labeled from the prospect's mouth ("Sure, go ahead", "We already use someone", "Not a good time").
- Mark the single most-likely response with is_most_likely: true so the caller's eye lands on it. Only one per step.
- Set is_entry: true and entry_scenario on the opening step(s). Valid entry_scenario values: "gatekeeper", "direct_contact", "no_name", "cell_vs_company". A script can have several entry steps, one per scenario — usually at least gatekeeper_intro and availability_check.
- Leaf steps (call ends) have responses: [] OR responses whose next_step_id is null.
- ids are short random-looking strings: steps like s_ab12, s_9x3k; responses like r_qq81, r_7m2p. Keep them stable and unique.
- x and y can both be 0 — the app auto-lays out the graph.

# How you should run this chat

1. Ask me one question at a time. Do NOT dump a template and ask me to fill it in.
2. Start by asking: what do I sell, who do I sell it to (job title + company type), and what does "a good meeting" look like — 15 min discovery? demo?
3. Then walk me through each section IN ORDER (gatekeeper_intro → availability_check → attention_grabber → soft_disqualify → pre_qualifying → pain_points → building_interest → close), pulling the real language out of me. When I give you generic marketing speak ("we help companies scale"), push back and ask for the concrete version.
4. For pain_points, make me name 3 specific pains in the words my prospects actually use.
5. For building_interest, ask me for 2–3 real customer name-drops and one concrete outcome each.
6. For close, lock the exact ask — meeting length, day/time framing.
7. Then ask me to walk through 5–10 objections. For each, capture their words and my reframe.
8. Confirm the tree makes sense (draw it back to me in plain text), then output the JSON.

# Final output format — READ CAREFULLY

Your LAST message must be ONLY a valid JSON code block, nothing else — no prose before or after, no markdown outside the fenced block. It must match this schema exactly:

\`\`\`json
{
  "steps": [
    {
      "id": "s_ab12",
      "caller_line": "Hi, this is …",
      "section_type": "gatekeeper_intro",
      "x": 0,
      "y": 0,
      "is_entry": true,
      "entry_scenario": "gatekeeper",
      "responses": [
        { "id": "r_qq81", "label": "I'll put you through", "next_step_id": "s_9x3k", "is_most_likely": true },
        { "id": "r_qq82", "label": "They're not available", "next_step_id": "s_7m2p", "is_most_likely": false }
      ]
    }
  ],
  "objections": [
    {
      "id": "o_zz01",
      "label": "Not interested",
      "reframe": "Totally fair — most people say that before they know why I'm calling. Can I have 20 seconds and then you decide?",
      "stages": ["availability_check", "attention_grabber"],
      "resume_section": "attention_grabber",
      "resume_step_id": null
    }
  ],
  "custom_section_types": []
}
\`\`\`

Rules the JSON must satisfy or the import will fail:
- Every response.next_step_id is either null or an id that exists in steps.
- Every objection.resume_step_id is either null or an id that exists in steps.
- Every step id and response id is unique.
- Non-entry steps should be reachable from some entry step (the app will warn about unreachable steps but still import).
- Do NOT invent fields not listed above. Leave custom_section_types as [] unless I ask for a new section type.

Now begin by asking me question 1.`;
