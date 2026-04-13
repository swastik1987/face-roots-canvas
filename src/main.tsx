import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";                        // initialise i18next before render
import { initAnalytics } from "./lib/analytics.ts";
import { initSentry } from "./lib/sentry.ts";

// Guard PWA service worker in iframe / preview contexts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) =>
    regs.forEach((r) => r.unregister())
  );
}

// Initialise observability (no-ops when env vars are absent)
initSentry();
initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
