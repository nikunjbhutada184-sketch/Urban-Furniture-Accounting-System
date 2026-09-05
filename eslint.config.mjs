import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          // Money must never be handled as a JS float. Use Prisma.Decimal via @/server/money.
          selector:
            "CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
          message:
            "Do not use Number.parseFloat for monetary values. Use the Decimal helpers in @/server/money.",
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message:
            "Do not use parseFloat for monetary values. Use the Decimal helpers in @/server/money.",
        },
      ],
    },
  },
  {
    // Accounting/business logic must stay out of UI components.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              // Enums and generated types are fine in the UI; the client is not.
              name: "@prisma/client",
              importNames: ["PrismaClient", "Prisma"],
              message:
                "UI components must not talk to the database. Call a service in src/modules/*/ or src/server/ instead.",
            },
          ],
          patterns: [
            {
              group: ["@/server/db*", "**/server/db/*"],
              message:
                "UI components must not import the Prisma client. Use a server service or server action.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
