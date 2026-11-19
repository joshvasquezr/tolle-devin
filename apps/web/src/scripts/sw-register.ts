// D§3.13: register the service worker after load, off the critical path.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => {
    const go = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1000);
  });
}
