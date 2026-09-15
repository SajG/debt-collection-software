import { describe, expect, it } from "vitest";
import { parseRecommendation } from "../schema";

const valid = {
  nextAction: "Call the owner about the ₹50,000 promise",
  urgency: "today",
  talkingPoints: ["Promise was due Monday", "Offer UPI link"],
  draftMessage: "Namaste Sharma ji, aapka payment pending hai…",
};

describe("parseRecommendation", () => {
  it("parses a clean JSON string", () => {
    expect(parseRecommendation(JSON.stringify(valid))).toEqual(valid);
  });

  it("parses JSON inside a markdown fence with prose around it", () => {
    const raw = "Here you go:\n```json\n" + JSON.stringify(valid) + "\n```\nHope that helps!";
    expect(parseRecommendation(raw)).toEqual(valid);
  });

  it("rejects an invalid urgency value", () => {
    expect(parseRecommendation(JSON.stringify({ ...valid, urgency: "someday" }))).toBeNull();
  });

  it("rejects garbage", () => {
    expect(parseRecommendation("I cannot help with that.")).toBeNull();
  });
});
