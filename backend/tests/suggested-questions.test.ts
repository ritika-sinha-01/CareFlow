import { describe, expect, it } from "vitest";
import { FALLBACK_SUGGESTED_QUESTIONS, normalizeSuggestedQuestions, parseUrgency } from "../src/utils/suggested-questions.js";

describe("exactly three suggested questions", () => {
  it("pads an empty list with three fallback questions", () => {
    expect(normalizeSuggestedQuestions([])).toEqual([...FALLBACK_SUGGESTED_QUESTIONS]);
    expect(normalizeSuggestedQuestions(null)).toHaveLength(3);
  });

  it("pads a single question to exactly three", () => {
    const result = normalizeSuggestedQuestions(["How long has this lasted?"]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("How long has this lasted?");
    expect(result[1]).toBe(FALLBACK_SUGGESTED_QUESTIONS[0]);
    expect(result[2]).toBe(FALLBACK_SUGGESTED_QUESTIONS[1]);
  });

  it("keeps three valid questions unchanged", () => {
    const questions = ["Q1?", "Q2?", "Q3?"];
    expect(normalizeSuggestedQuestions(questions)).toEqual(questions);
  });

  it("trims four or more questions down to three unique items", () => {
    expect(normalizeSuggestedQuestions(["A?", "B?", "C?", "D?", "E?"])).toEqual(["A?", "B?", "C?"]);
  });

  it("accepts Low/Medium/High urgency labels", () => {
    expect(parseUrgency("Low")).toBe("LOW");
    expect(parseUrgency("medium")).toBe("MEDIUM");
    expect(parseUrgency("HIGH")).toBe("HIGH");
  });
});
