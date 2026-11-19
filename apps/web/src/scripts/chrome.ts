// D§3.9 chrome auto-hide (SPEC §6.1): hide the bar on scroll down; reveal on scroll up, pointer near
// the top edge, or focus inside it. Off when settings set data-autohide="off".
const bar = document.querySelector<HTMLElement>("header.bar");
const REVEAL_EDGE = 48;

let lastY = scrollY;
let ticking = false;

const enabled = () => document.documentElement.dataset.autohide !== "off";
const show = () => bar?.classList.remove("chrome-hidden");

function update(): void {
  ticking = false;
  if (!bar) return;
  const y = scrollY;
  bar.classList.toggle("scrolled", y > 0);
  const owned = bar.contains(document.activeElement) || !!document.querySelector(":popover-open");
  if (!enabled() || owned || y <= REVEAL_EDGE) show();
  else if (y > lastY + 2) bar.classList.add("chrome-hidden");
  else if (y < lastY - 2) show();
  lastY = y;
}

if (bar) {
  addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  addEventListener("pointermove", (e) => {
    if (e.clientY <= REVEAL_EDGE) show();
  }, { passive: true });
  bar.addEventListener("focusin", show);
  new MutationObserver(() => enabled() || show()).observe(document.documentElement, { attributeFilter: ["data-autohide"] });
  update();
}
