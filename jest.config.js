/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@App/(.*)$": "<rootDir>/src/$1",
    "^@Pkg/(.*)$": "<rootDir>/pkg/$1",
    "\\.(yaml)$": "<rootDir>/tests/mocks/fileMock.js",
  },
  moduleFileExtensions: ["js", "ts"],
  transform: {
    "\\.[jt]s$": "babel-jest",
    "\\.m[jt]s$": "babel-jest",
  },
  transformIgnorePatterns: ["node_modules/(?!(uuid|dexi|yaml))"],
  setupFiles: ["./pkg/chrome-extension-mock/index.ts"],
  moduleDirectories: ["node_modules", "src"],
  watch: false,
};
