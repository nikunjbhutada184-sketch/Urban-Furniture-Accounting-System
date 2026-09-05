import "@testing-library/jest-dom/vitest";

// Deterministic environment for accounting tests.
process.env.TZ = process.env.TZ ?? "UTC";
