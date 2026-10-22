import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "#app/App";

import "./styles/globals.css";

/**
 * The manifest is linked at runtime: Bun's HTML bundler would try to bundle
 * a public-folder path written in index.html.
 */
function linkManifest() {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/manifest.webmanifest";
  document.head.appendChild(link);
  const icon = document.createElement("link");
  icon.rel = "apple-touch-icon";
  icon.href = "/icons/icon-180.png";
  document.head.appendChild(icon);
}

linkManifest();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Toaster position="top-center" />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
