// D§3.9 settings; SPEC R7. CSP hash covers the exact boot script bytes.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../csp.ts";
import { BOOT_SCRIPT, DEFAULTS, attributesFor, parseSettings } from "./settings-core.ts";

describe("settings", () => {
  it("defaults on missing, malformed or hostile data", () => {
    expect(parseSettings(null)).toEqual(DEFAULTS);
    expect(parseSettings("{oops")).toEqual(DEFAULTS);
    expect(parseSettings('"str"')).toEqual(DEFAULTS);
    expect(parseSettings('{"theme":"<x>","size":9,"font":1,"headings":"no"}')).toEqual(DEFAULTS);
  });

  it("keeps valid fields", () => {
    const s = parseSettings('{"theme":"dark","size":4,"font":"sans","width":"narrow","headings":false,"autohide":false}');
    expect(s).toEqual({ theme: "dark", size: 4, font: "sans", width: "narrow", headings: false, autohide: false });
    expect(attributesFor(s)).toEqual({
      "data-theme": "dark", "data-size": "4", "data-font": "sans", "data-width": "narrow", "data-headings": "off", "data-autohide": "off",
    });
    expect(Object.values(attributesFor(DEFAULTS)).every((v) => v === null)).toBe(true);
  });

  it("CSP allows the boot script by its sha256 and nothing inline otherwise", () => {
    const h = createHash("sha256").update(BOOT_SCRIPT).digest("base64");
    expect(contentSecurityPolicy()).toContain(`script-src 'self' 'sha256-${h}'`);
    expect(contentSecurityPolicy()).not.toContain("unsafe-inline");
  });
});
