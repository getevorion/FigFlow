import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from Figma's embedded Kiwi schema (see src/engine/fig/kiwi/NOTICE.md).
    "src/engine/fig/kiwi/schema.ts",
    // Uploads, generated projects and local tools, never committed.
    ".data/**",
  ]),
]);

export default eslintConfig;
