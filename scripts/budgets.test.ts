// P7.2 Verify: the JS budget check counts external and inline scripts and fails over 60 KB gz.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBudgets, firstLoadJs } from "./budgets.ts";

describe("JS budget", () => {
  it("counts module + inline scripts and fails above 60 KB gz", () => {
    const d = mkdtempSync(join(tmpdir(), "dist-"));
    mkdirSync(join(d, "_astro"));
    writeFileSync(join(d, "_astro/a.js"), "console.log(1);".repeat(100));
    writeFileSync(join(d, "index.html"), '<script>var x=1</script><script type="module" src="/_astro/a.js"></script>');
    expect(firstLoadJs(d, "index.html")).toBeGreaterThan(20);
    expect(checkBudgets(d)).toEqual([]);
    writeFileSync(join(d, "_astro/a.js"), randomBytes(70 * 1024).toString("base64"));
    expect(checkBudgets(d)).toHaveLength(1);
  });
});
