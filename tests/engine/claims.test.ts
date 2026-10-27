import { describe, expect, it } from "vitest";
import type { Fact } from "@/lib/types";
import { checkClaims } from "@/server/engine/claims";

const facts: Fact[] = [
  { id: "F1", ledgerIds: ["E3"], label: "Liquid Death ranks #2 of 10 energy drink brands", value: 2, display: "#2 of 10 (affinity 0.95)" },
  { id: "F2", ledgerIds: ["E4"], label: "Audience-profile match", value: 81, display: "81/100 audience-profile match" },
  { id: "F3", ledgerIds: ["E7"], label: "Youth affinity", value: -0.12, display: "−0.12 affinity, ages 24 and younger" },
];
const allowed = ["Founders Weekly", "Liquid Death", "United States"];

const statusOf = (markdown: string) => checkClaims(markdown, facts, allowed).segments.map((s) => s.status);

describe("checkClaims", () => {
  it("keeps a qualitative sentence without numbers", () => {
    expect(statusOf("Founders Weekly listeners build companies and buy tools that save time.")).toEqual(["kept"]);
  });

  it("strikes a numeric sentence without a marker", () => {
    const out = checkClaims("Our audience is 72% male.", facts, allowed);
    expect(out.segments[0].status).toBe("struck");
    expect(out.segments[0].reason).toMatch(/receipt/i);
    expect(out.struckCount).toBe(1);
  });

  it("keeps a cited sentence whose number matches the fact", () => {
    expect(statusOf("Liquid Death ranks #2 of 10 energy drinks for this audience [F1].")).toEqual(["kept"]);
    expect(statusOf("The two audiences share an 81/100 profile match [F2].")).toEqual(["kept"]);
  });

  it("strikes a cited sentence whose number does not match", () => {
    const out = checkClaims("Liquid Death is the #1 energy drink for these fans [F1].", facts, allowed);
    expect(out.segments[0].status).toBe("struck");
    expect(out.segments[0].reason).toMatch(/match/i);
  });

  it("strikes a marker that points at no fact", () => {
    expect(statusOf("Fans love it [F9].")).toEqual(["struck"]);
  });

  it("strikes an uncited sentence naming a brand Qloo did not return", () => {
    const out = checkClaims("Brands like Red Bull would love this crowd.", facts, allowed);
    expect(out.segments[0].status).toBe("struck");
    expect(out.segments[0].reason).toMatch(/Red Bull/);
  });

  it("strikes ranking language without a receipt", () => {
    expect(statusOf("This is the strongest audience match in the category.")).toEqual(["struck"]);
  });

  it("exports kept text with numbered sources and drops struck text", () => {
    const out = checkClaims(
      "## Why Liquid Death\n\nLiquid Death ranks #2 of 10 energy drinks for this audience [F1]. Our audience is 72% male.\n\n- 81/100 profile match [F2]",
      facts,
      allowed,
      { describeLedger: (id) => `Qloo /v2/insights (${id})` },
    );
    expect(out.keptMarkdown).toContain("## Why Liquid Death");
    expect(out.keptMarkdown).toContain("[1]");
    expect(out.keptMarkdown).not.toContain("72%");
    expect(out.keptMarkdown).not.toContain("[F1]");
    expect(out.keptMarkdown).toMatch(/Sources[\s\S]*\[1\] #2 of 10 \(affinity 0\.95\) — Qloo \/v2\/insights \(E3\)/);
    expect(out.keptMarkdown).toMatch(/- 81\/100 profile match \[2\]/);
  });

  it("treats a negative decimal with a typographic minus as matching", () => {
    expect(statusOf("Youth affinity sits at −0.12 [F3].")).toEqual(["kept"]);
    expect(statusOf("Youth affinity sits at -0.12 [F3].")).toEqual(["kept"]);
  });
});
