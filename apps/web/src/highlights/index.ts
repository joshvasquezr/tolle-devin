// Highlights island entry (D§3.10): selection model, toolbar, paint on load and chapter swap.
import "./selection.ts";
import "./toolbar.ts";
import { paint } from "./paint.ts";

void paint();
addEventListener("quiet:chapter", () => void paint());
