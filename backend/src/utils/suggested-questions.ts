import { asStringArray } from "./serializers.js";

export const FALLBACK_SUGGESTED_QUESTIONS = [
  "How long have these symptoms lasted?",
  "Is anything making the symptoms better or worse?",
  "Have you noticed any other symptoms along with this?",
] as const;

export function normalizeSuggestedQuestions(input: unknown): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of asStringArray(input)) {
    const value = item.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
    if (cleaned.length === 3) break;
  }
  for (const fallback of FALLBACK_SUGGESTED_QUESTIONS) {
    if (cleaned.length >= 3) break;
    if (seen.has(fallback.toLowerCase())) continue;
    cleaned.push(fallback);
  }
  return cleaned.slice(0, 3);
}

export function parseUrgency(value: unknown): "LOW" | "MEDIUM" | "HIGH" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH") return normalized;
  return undefined;
}
