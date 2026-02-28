import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import prettierConfig from "eslint-config-prettier/flat";

export default [
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  importPlugin.flatConfigs.errors,
  importPlugin.flatConfigs.warnings,
  importPlugin.flatConfigs.typescript,
  prettierConfig,
  {
    languageOptions: {
      parser: tsParser,
    },
    settings: {
      "import/resolver": {
        node: {
          paths: ["src"],
        },
      },
    },
    rules: {
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "block" },
        { blankLine: "always", prev: "block", next: "*" },
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "block-like", next: "*" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: ["parameter", "variable"],
          leadingUnderscore: "forbid",
          format: null,
        },
        {
          selector: "parameter",
          leadingUnderscore: "require",
          format: null,
          modifiers: ["unused"],
        },
      ],
      "no-constant-condition": "off",
      "import/no-unresolved": "off",
    },
  },
];
