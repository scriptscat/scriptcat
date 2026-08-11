import { describe, expect, it } from "vitest";
import { buildSnapshot, parseArguments, validateSnapshot } from "./sync-deepwiki.mjs";

const STRUCTURE = `Available pages for scriptscat/scriptcat:

- 1 Overview
  - 1.1 Details
- 2 Reference`;

const CONTENTS = `# Page: Overview

# Overview

See [Details](#1.1), [Reference](2), and [README](README.md).
[Details (1.1)]()

[README.md:1-2]()
[package.json:71, 111]()
[Details]()

\`\`\`md
[Do not rewrite](#1.1)
\`\`\`

---

# Page: Details

# Details

Back to [Overview](#1).

---

# Page: Reference

# Reference

See [Details](1.1).`;

const REAL_PAGES = [
  ["1", "Overview"],
  ["1.1", "Extension Architecture"],
  ["1.2", "Core Concepts and Terminology"],
  ["2", "Script Management"],
  ["2.1", "Script Installation and Lifecycle"],
  ["2.2", "Script Editor and Development"],
  ["2.3", "Script Lists and Organization"],
  ["2.4", "Script Storage and Values"],
  ["2.5", "Script Subscriptions"],
  ["2.6", "External Access"],
  ["3", "Script Execution Environment"],
  ["3.1", "Service Worker Runtime"],
  ["3.2", "Sandbox Environment"],
  ["3.3", "Content and Inject Script Contexts"],
  ["3.4", "URL Pattern Matching"],
  ["3.5", "Resource and Dependency Management"],
  ["4", "GM API Reference"],
  ["4.1", "Standard GM APIs"],
  ["4.2", "ScriptCat Extensions (CAT_* APIs)"],
  ["4.3", "Menu Command System"],
  ["5", "Inter-Process Communication"],
  ["5.1", "Message Queue Architecture"],
  ["5.2", "Cross-Context Communication"],
  ["6", "Data Persistence and Synchronization"],
  ["6.1", "Storage Layer"],
  ["6.2", "Import and Export"],
  ["6.3", "Cloud Synchronization"],
  ["7", "User Interface"],
  ["7.1", "Options Page Layout"],
  ["7.2", "Popup Interface"],
  ["7.3", "Settings and Configuration"],
  ["7.4", "Internationalization"],
  ["8", "Agent / AI Subsystem"],
  ["8.1", "Agent Core Engine"],
  ["8.2", "Tool System and MCP Integration"],
  ["8.3", "DOM Automation and Page Interaction"],
  ["8.4", "Skills and Scheduled Tasks"],
  ["8.5", "Agent UI"],
  ["9", "Development Guide"],
  ["9.1", "Build System"],
  ["9.2", "Technology Stack"],
  ["9.3", "Testing and Quality"],
  ["9.4", "Contributing Guidelines"],
  ["9.5", "Documentation Development"],
  ["10", "Glossary"],
];

const REAL_STRUCTURE = [
  "Available pages for scriptscat/scriptcat:",
  "",
  ...REAL_PAGES.map(([number, title]) => `${number.includes(".") ? "  " : ""}- ${number} ${title}`),
].join("\n");

const REAL_CONTENTS = REAL_PAGES.map(([, title]) => `# Page: ${title}\n\n# ${title}`).join("\n\n---\n\n");

describe("DeepWiki snapshot generation", () => {
  it("parses the workflow's repository option", () => {
    expect(parseArguments(["--repository", "scriptscat/scriptcat", "--output", ".deepwiki"])).toEqual({
      endpoint: "https://mcp.deepwiki.com/mcp",
      repository: "scriptscat/scriptcat",
      output: ".deepwiki",
    });
  });

  it("splits pages, preserves structure, and rewrites page and repository links", () => {
    const files = buildSnapshot(STRUCTURE, CONTENTS);

    expect([...files.keys()]).toEqual(["1-overview.md", "1-1-details.md", "2-reference.md", "index.md"]);
    expect(files.get("index.md")).toContain("- [1 Overview](./1-overview.md)");
    expect(files.get("index.md")).toContain("  - [1.1 Details](./1-1-details.md)");
    expect(files.get("1-overview.md")).toContain(
      "See [Details](./1-1-details.md), [Reference](./2-reference.md), and [README](../README.md)."
    );
    expect(files.get("1-overview.md")).toContain("[Details (1.1)](./1-1-details.md)");
    expect(files.get("1-overview.md")).toContain("[Details](./1-1-details.md)");
    expect(files.get("1-overview.md")).toContain("[README.md:1-2](../README.md#L1-L2)");
    expect(files.get("1-overview.md")).toContain("[package.json:71, 111](../package.json)");
    expect(files.get("1-overview.md")).toContain("[Do not rewrite](#1.1)");
    expect(files.get("1-overview.md")).not.toContain("]()");
    expect(files.get("1-overview.md")).toContain("[Reference](./2-reference.md)");
  });

  it("mechanically matches the current 45-entry read_wiki_structure result", () => {
    const files = buildSnapshot(REAL_STRUCTURE, REAL_CONTENTS);

    expect(files.size).toBe(46);
    expect([...files.keys()].filter((filename) => filename !== "index.md")).toHaveLength(45);
    expect(files.has("8-2-tool-system-and-mcp-integration.md")).toBe(true);
    expect(files.has("9-5-documentation-development.md")).toBe(true);
    expect(files.get("index.md")).toContain("- [10 Glossary](./10-glossary.md)");
  });

  it("rejects unresolved numeric page links", () => {
    const files = new Map([["index.md", "[Missing page](#9.9)\n"]]);

    expect(() => validateSnapshot(files)).toThrow(/invalid links/);
  });

  it("preserves a fragment when a numeric page link has one", () => {
    const files = buildSnapshot(
      "Available pages for scriptscat/scriptcat:\n\n- 2 Reference",
      "# Page: Reference\n\n# Reference\n\n[Section](2#section)"
    );

    expect(files.get("2-reference.md")).toContain("[Section](./2-reference.md#section)");
  });

  it("rejects a contents page that is absent from the structure", () => {
    expect(() => buildSnapshot(STRUCTURE, `${CONTENTS}\n---\n\n# Page: Extra\n\n# Extra`)).toThrow(
      /absent from structure/
    );
  });
});
