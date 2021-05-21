// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {

  clearMocks: true,

  coverageDirectory: "coverage",

  moduleFileExtensions: [
    "js",
    "ts",
  ],

  moduleNameMapper: {
    "^@App/(.*)$": "<rootDir>/src/$1",
  },

  testEnvironment: "node",

  transform: {
    '^.+\\.ts?$': 'ts-jest'
  },

  "jest.autoRun": {
    "watch": true,
    "onStartup": ["all-tests"]
  }
};