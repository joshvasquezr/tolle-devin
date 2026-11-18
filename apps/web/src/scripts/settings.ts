// D§3.9 "Aa" popover island: edits settings live and persists them locally.
import { DEFAULTS, SETTINGS_KEY, attributesFor, parseSettings, type Settings } from "./settings-core.ts";

function load(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULTS };
  }
}

export function apply(s: Settings): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(attributesFor(s))) {
    if (v === null) root.removeAttribute(k);
    else root.setAttribute(k, v);
  }
}

function save(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable (private mode); settings still apply for this page.
  }
}

/** SPEC §6.9 "D": flip between light and dark from whatever is showing now. */
export function toggleTheme(): void {
  const s = load();
  const dark = s.theme === "dark" || (s.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const next: Settings = { ...s, theme: dark ? "light" : "dark" };
  apply(next);
  save(next);
}

function init(): void {
  const btn = document.getElementById("aa-btn");
  const pop = document.getElementById("aa-pop");
  if (!btn || !pop) return;
  let s = load();
  const sync = () => {
    for (const el of pop.querySelectorAll<HTMLInputElement>("input[name]")) {
      const key = el.name as keyof Settings;
      el.checked = el.type === "checkbox" ? Boolean(s[key]) : String(s[key]) === el.value;
    }
  };
  const close = (focus = true) => {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (focus) btn.focus();
  };
  btn.addEventListener("click", () => {
    const opening = pop.hidden;
    if (!opening) return close();
    sync();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    pop.querySelector<HTMLInputElement>("input:checked, input")?.focus();
  });
  pop.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    const key = el.name as keyof Settings;
    const value = el.type === "checkbox" ? el.checked : key === "size" ? Number(el.value) : el.value;
    s = parseSettings(JSON.stringify({ ...s, [key]: value }));
    apply(s);
    save(s);
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) close(false);
  });
}

init();
