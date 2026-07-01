/// <reference types="vitest/config" />
// Vite build configuration.
// - react(): enables JSX and fast-refresh during `npm run dev`
// - tailwindcss(): Tailwind v4's official Vite plugin (no tailwind.config.js
//   needed — v4 scans source files automatically)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Core-logic tests are pure functions + a mocked fetch — no browser DOM
    // needed, so the lighter "node" environment is enough.
    environment: "node",
  },
});
