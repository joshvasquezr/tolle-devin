// Highlights island entry (D§3.10; SPEC H3, H4): selection, toolbar, and paint on load, chapter swap
// (client navigation and translation switch), bfcache restore and writes from other tabs.
import "./selection.ts";
import "./toolbar.ts";
import "./copy.ts";
import "./transfer.ts";
import "./sync.ts";
import { paint } from "./paint.ts";
import { onRemoteChange } from "./store.ts";

void paint();
addEventListener("quiet:chapter", () => void paint());
addEventListener("pageshow", (e) => {
  if (e.persisted) void paint();
});
onRemoteChange(() => void paint());
addEventListener("quiet:highlights-imported", () => void paint());
addEventListener("quiet:highlights-synced", () => void paint());
addEventListener("quiet:signed-out", () => void paint());
