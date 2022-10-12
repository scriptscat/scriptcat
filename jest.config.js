/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@App/(.*)$": "<rootDir>/src/$1",
    "^pkg/(.*)$": "<rootDir>/pkg/$1",
  },
  moduleFileExtensions: ["js", "ts"],
  transform: {
    "\\.[jt]s$": "babel-jest",
    "\\.m[jt]s$": "babel-jest",
  },
  transformIgnorePatterns: ["node_modules/(?!(uuid|dexi|yaml))"],
  setupFiles: ["./pkg/chrome-extension-mock/index.ts"],
};
