// Highlights island entry (D§3.10; SPEC H3, H4): selection, toolbar, and paint on load, chapter swap
// (client navigation and translation switch), bfcache restore and writes from other tabs.
import "./selection.ts";
import "./toolbar.ts";
import { paint } from "./paint.ts";
import { onRemoteChange } from "./store.ts";

void paint();
addEventListener("quiet:chapter", () => void paint());
addEventListener("pageshow", (e) => {
  if (e.persisted) void paint();
});
onRemoteChange(() => void paint());
