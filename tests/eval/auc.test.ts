import { describe, expect, it } from "vitest";
import { auc, mean } from "../../eval/auc";

describe("auc", () => {
  it("is 1 when every positive outranks every negative", () => {
    expect(auc([0.9, 0.8], [0.1, 0.2, 0.3])).toBe(1);
  });

  it("is 0 when the ranking is inverted", () => {
    expect(auc([0.1], [0.5, 0.9])).toBe(0);
  });

  it("counts ties as half", () => {
    expect(auc([0.5, 0.5], [0.5])).toBe(0.5);
  });

  it("is null without both classes", () => {
    expect(auc([], [0.3])).toBeNull();
    expect(auc([0.3], [])).toBeNull();
  });

  it("averages only defined values", () => {
    expect(mean([1, null, 0])).toBe(0.5);
    expect(mean([null])).toBeNull();
  });
});
