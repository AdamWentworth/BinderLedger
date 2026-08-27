const globals = Object.fromEntries(
  [
    "AbortController",
    "AbortSignal",
    "console",
    "fetch",
    "process",
    "setTimeout",
    "URL",
  ].map((name) => [name, "readonly"]),
);

export default [
  {
    files: ["src/**/*.mjs", "test/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals,
      sourceType: "module",
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "error",
    },
  },
];
