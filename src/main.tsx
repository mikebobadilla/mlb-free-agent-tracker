import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx"; // explicit extension: on a case-insensitive disk "./App" would resolve to src/app.ts (D-040)
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
