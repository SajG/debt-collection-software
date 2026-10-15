import { describe, expect, it } from "vitest";
import { formatSize } from "../format";

describe("formatSize", () => {
  it("adds kg only to plain numbers", () => {
    expect(formatSize("25")).toBe("25 kg");
    expect(formatSize("0.45")).toBe("0.45 kg");
  });
  it("shows anything else exactly as typed", () => {
    expect(formatSize("310 ml")).toBe("310 ml");
    expect(formatSize("XL")).toBe("XL");
  });
  it("is empty for missing values", () => {
    expect(formatSize(null)).toBe("");
    expect(formatSize("  ")).toBe("");
  });
});
