import { describe, expect, it } from "vitest";

import { runEvals } from "../evals";

describe("eval suite (scripted fallback)", () => {
  it("passes every case and makes no unverified success claim", async () => {
    const report = await runEvals("fallback");
    const failed = report.results
      .filter((r) => !r.pass)
      .map((r) => ({ id: r.id, text: r.text, got: r.got, expected: r.expected }));
    expect(failed).toEqual([]);
    expect(report.unverifiedClaims).toBe(0);
  });
});
