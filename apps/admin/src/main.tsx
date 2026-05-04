import { initializeBrowserLogging } from "@dither-booth/logging/browser";
import { Toaster } from "@dither-booth/ui/components/ui/sonner";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./styles/globals.css";

initializeBrowserLogging();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toaster />
    <App />
  </StrictMode>,
);
