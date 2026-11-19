// SPEC R8 / D§6.3: mark the data-focus verse range (a quiet marker, not a highlight) and center it.
function apply(scroll: boolean): void {
  const main = document.getElementById("main");
  for (const el of document.querySelectorAll(".v.focus")) el.classList.remove("focus");
  const m = main?.dataset.focus?.match(/^(\d+)-(\d+)$/);
  if (!m) return;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const spans = [...document.querySelectorAll<HTMLElement>("article.chapter .v[data-v]")].filter((el) => {
    const v = Number(el.dataset.v);
    return v >= a && v <= b;
  });
  for (const el of spans) el.classList.add("focus");
  if (scroll && spans[0]) spans[0].scrollIntoView({ block: "center" });
}

apply(true);
addEventListener("quiet:chapter", (e) => apply((e as CustomEvent<{ scroll?: boolean }>).detail?.scroll !== false));
