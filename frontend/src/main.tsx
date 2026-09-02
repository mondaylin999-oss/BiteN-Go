// ===========================================================================
//  main.tsx — mounts the app.
// ===========================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "@/lib/auth";
import { PrefsProvider } from "@/lib/prefs";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error('index.html is missing <div id="root">.');

createRoot(container).render(
  <StrictMode>
    <PrefsProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </PrefsProvider>
  </StrictMode>,
);
