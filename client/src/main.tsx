import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container missing in index.html");
}

// Use StrictMode only in development to catch issues early
// In production, double-rendering adds unnecessary overhead
const isDevelopment = process.env.NODE_ENV === "development";

const Root = isDevelopment ? React.StrictMode : React.Fragment;

createRoot(container).render(
  <Root>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Root>
);
