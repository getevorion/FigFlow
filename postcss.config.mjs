import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Scan src/ for class names no matter which directory the dev server was started from (the plugin
// otherwise uses process.cwd()). Only src/: the folders Tailwind scans are the ones the dev server
// watches, and .data/ gets a hundred files per conversion. (Not `new URL("./src/", import.meta.url)`:
// Turbopack reads that as an import of the folder and fails the build.)
const sources = join(dirname(fileURLToPath(import.meta.url)), "src");

const config = {
  plugins: {
    "@tailwindcss/postcss": { base: sources },
  },
};

export default config;
