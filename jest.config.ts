import type { Config } from "jest";

const config = {
  roots: ["<rootDir>/scripts"],
  testEnvironment: "node",
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts", ".tsx", ".mts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.(tsx?|mts)$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "scripts/tsconfig.jest.json",
      },
    ],
  },
  testMatch: [
    "**/scripts/**/*.unit.test.ts",
    "**/scripts/**/*.unit.test.tsx",
    "**/scripts/**/*.integration.test.ts",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/\\.*/"],
  modulePathIgnorePatterns: ["/\\.*/"],
  moduleFileExtensions: ["ts", "tsx", "mts", "js", "json"],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
  silent: true,
} satisfies Config;

export default config;
