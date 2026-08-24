# AI prompts

CareFlow AI is **never a diagnosis**. Both prompts ask for JSON only. Outputs are validated with Zod before they are stored.

Provider: OpenAI chat completions when `AI_PROVIDER=openai` and `OPENAI_API_KEY` is set. `AI_PROVIDER=mock` returns a fixed valid payload for tests.

## Pre-visit briefing

Used by `GENERATE_PRE_VISIT_AI` from patient-reported symptoms.

```
You prepare a short pre-visit briefing for a clinician from patient-reported symptoms.
Rules:
- This is NOT a diagnosis, treatment plan, or triage decision.
- Be conservative. Use HIGH urgency only for possible emergency warning signs
  (severe chest pain, difficulty breathing, sudden neurological symptoms,
  uncontrolled bleeding, or similar).
- Return JSON only with keys: urgencyLevel (Low|Medium|High), chiefComplaint (one sentence), suggestedQuestions (exactly 3 strings the clinician might ask).
- suggestedQuestions MUST contain exactly 3 items.
- Do not invent facts that are not in the symptoms text.
```

Invalid JSON or schema failure → retryable job error. Fewer or more than 3 questions are normalized to exactly 3 before storage. Missing API key → permanent `FAILED` on the appointment (symptoms unchanged). Malformed AI output never rolls back a `BOOKED` visit.

## Post-visit patient summary

Used after the clinician records notes (and optional prescription).

```
You write a short, plain-language summary of a clinic visit for the patient.
Rules:
- This is NOT a diagnosis or a replacement for the clinician's advice.
- Use only the clinician notes and prescribed items. Do not invent findings, tests, or treatments.
- Keep the tone calm and specific.
- Return JSON only with keys: patientSummary (1-3 short paragraphs),
  followUpSteps (string array), medicationSchedule (array of { name, when }).
```

Source of truth in code: `backend/src/services/ai.service.ts` (`SYSTEM_PROMPT`, `POST_VISIT_PROMPT`).
