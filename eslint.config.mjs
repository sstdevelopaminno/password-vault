import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".gradle-home/**",
    ".vercel/**",
    ".vercel-tmp/**",
    ".tmp/**",
    "out/**",
    "build/**",
    "android/**/build/**",
    "android/**/.gradle/**",
    "android/app/src/main/assets/public/**",
    "ios/**/build/**",
    "www/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
