import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme";
import App from "./App";
import "./index.css";

// Chrome fires this once, early. Keep it so Settings → "Install App" works even if the event
// arrived before that screen was opened (see components/settings/install.ts).
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as Window & { __poInstallPrompt?: Event }).__poInstallPrompt = e;
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <App />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
