import "./ort-setup"; // <- must be first
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css"; // keep this above your own styles
import "./index.css"; // your overrides
import { App } from "./App";

const el = document.getElementById("root");
if (!el) throw new Error("Root element #root not found");
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
);
