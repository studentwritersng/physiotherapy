import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat-config arrays, so FlatCompat is not needed
// (and crashes on a circular reference in the legacy schema validator).
const config = [
  ...coreWebVitals,
  ...typescriptConfig,
  {
    ignores: ["src/generated/**", ".next/**", "node_modules/**", ".uploads/**", "next-env.d.ts"],
  },
  {
    rules: {
      // Leading-underscore names are the convention here for deliberately
      // discarded destructured values.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
