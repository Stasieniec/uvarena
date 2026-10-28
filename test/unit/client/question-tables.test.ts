import { describe, expect, it } from "vitest";
import { plainPreview, splitTables } from "../../../src/client/components/after/prompt-text";

describe("splitTables", () => {
  it("pulls a payoff table out of a prompt and drops the separator row", () => {
    const text = "Payoffs are (row, column). Which cell?\n\n|   | L | R |\n|---|---|---|\n| T | 4, 3 | 1, 1 |\n| B | 3, 0 | 2, 2 |";
    expect(splitTables(text)).toEqual([
      { kind: "text", text: "Payoffs are (row, column). Which cell?\n" },
      {
        kind: "table",
        rows: [
          ["", "L", "R"],
          ["T", "4, 3", "1, 1"],
          ["B", "3, 0", "2, 2"],
        ],
      },
    ]);
  });

  it("leaves pipes inside code fences and plain prompts alone", () => {
    const code = "Run:\n```\n| not a table |\n```";
    expect(splitTables(code)).toEqual([{ kind: "text", text: code }]);
    expect(splitTables("No table here.")).toEqual([{ kind: "text", text: "No table here." }]);
  });
});

describe("plainPreview", () => {
  it("cuts a table out of a one-line preview", () => {
    expect(plainPreview("Which cell is the only pure Nash equilibrium? || L | R ||---|")).toBe("Which cell is the only pure Nash equilibrium?");
    expect(plainPreview("| a | b |")).toBe("| a | b |");
    expect(plainPreview("No table.")).toBe("No table.");
  });
});
