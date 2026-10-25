import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ProductionApp from "./ProductionApp";
import "./index.css";
import "./production.css";

const element = document.getElementById("root");
if (!element) throw new Error("Missing #root mount element");

createRoot(element).render(
  <StrictMode>
    <ProductionApp />
  </StrictMode>
);
