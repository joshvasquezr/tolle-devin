// D§3.9 settings model. DOM-free so it is unit-tested and shared with the boot script.
export const SETTINGS_KEY = "quiet.settings.v1";

export interface Settings {
  theme: "light" | "dark" | "system";
  size: 0 | 1 | 2 | 3 | 4;
  font: "serif" | "sans";
  width: "narrow" | "default";
  headings: boolean;
  autohide: boolean;
}

// SPEC §14 Q8: auto-hide on by default.
export const DEFAULTS: Readonly<Settings> = { theme: "system", size: 2, font: "serif", width: "default", headings: true, autohide: true };

/** Parses stored JSON, keeping only valid fields (bad or old data falls back to defaults). */
export function parseSettings(raw: string | null): Settings {
  const s: Settings = { ...DEFAULTS };
  if (!raw) return s;
  let o: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return s;
    o = v as Record<string, unknown>;
  } catch {
    return s;
  }
  if (o.theme === "light" || o.theme === "dark" || o.theme === "system") s.theme = o.theme;
  if (typeof o.size === "number" && Number.isInteger(o.size) && o.size >= 0 && o.size <= 4) s.size = o.size as Settings["size"];
  if (o.font === "serif" || o.font === "sans") s.font = o.font;
  if (o.width === "narrow" || o.width === "default") s.width = o.width;
  if (typeof o.headings === "boolean") s.headings = o.headings;
  if (typeof o.autohide === "boolean") s.autohide = o.autohide;
  return s;
}

/** Data attributes on <html>; tokens.css and type.css key off them. Absent = default/system. */
export function attributesFor(s: Settings): Record<string, string | null> {
  return {
    "data-theme": s.theme === "system" ? null : s.theme,
    "data-size": s.size === 2 ? null : String(s.size),
    "data-font": s.font === "serif" ? null : s.font,
    "data-width": s.width === "default" ? null : s.width,
    "data-headings": s.headings ? null : "off",
    "data-autohide": s.autohide ? null : "off",
  };
}

/**
 * Inline <head> script (D§3.9): applies stored settings before first paint.
 * Kept as a literal so its CSP hash is computed from exactly these bytes.
 */
export const BOOT_SCRIPT =
  `(function(){try{var s=JSON.parse(localStorage.getItem("${SETTINGS_KEY}")||"{}"),d=document.documentElement;` +
  `if(s.theme==="light"||s.theme==="dark")d.dataset.theme=s.theme;` +
  `if(s.size>=0&&s.size<=4&&s.size!==2)d.dataset.size=String(s.size);` +
  `if(s.font==="sans")d.dataset.font="sans";if(s.width==="narrow")d.dataset.width="narrow";` +
  `if(s.headings===false)d.dataset.headings="off";if(s.autohide===false)d.dataset.autohide="off"}catch(e){}})()`;
