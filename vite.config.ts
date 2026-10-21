import { defineConfig } from "vite";

// GitHub Pages hosts this repository below /Kingdom-Gods/; local/Sites builds stay at /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/Kingdom-Gods/" : "/",
});
