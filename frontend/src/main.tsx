import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("CareFlow failed to find the root element.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
