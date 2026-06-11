import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/generated/**",
      ".migration-backup/**",
      "**/*.tsbuildinfo",
      "backups/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase predates linting; keep the initial bar pragmatic and
      // tighten over time. `any` is widespread in error handlers and forms.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["artifacts/ledgerly/**/*.{ts,tsx}", "artifacts/mockup-sandbox/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Legacy patterns predating the lint setup (sync-state-from-query effects
      // in the document forms, Radix sidebar internals); tighten after the
      // shared-form refactor.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    files: ["scripts/**/*.mjs", "**/*.config.{ts,mjs}", "**/build.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", fetch: "readonly", URL: "readonly" },
    },
  },
);
