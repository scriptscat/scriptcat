# Technology Stack

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [.github/workflows/build.yaml](../.github/workflows/build.yaml)
- [.github/workflows/packageRelease.yml](../.github/workflows/packageRelease.yml)
- [.github/workflows/test.yaml](../.github/workflows/test.yaml)
- [docs/references/design-patterns.md](../docs/references/design-patterns.md)
- [package.json](../package.json)
- [pnpm-lock.yaml](../pnpm-lock.yaml)
- [rspack.config.ts](../rspack.config.ts)
- [scripts/build-config.js](../scripts/build-config.js)
- [scripts/build-config.test.js](../scripts/build-config.test.js)
- [scripts/pack.js](../scripts/pack.js)
- [src/app/const.ts](../src/app/const.ts)
- [src/manifest.json](../src/manifest.json)
- [src/pages/options/App.tsx](../src/pages/options/App.tsx)
- [tests/mocks/network.ts](../tests/mocks/network.ts)
- [tsconfig.json](../tsconfig.json)
- [vitest.config.ts](../vitest.config.ts)

</details>



This document provides a comprehensive overview of the core technologies, frameworks, and libraries used in ScriptCat. It covers the frontend migration to React 19 and Tailwind CSS v4, build tools, data persistence solutions, browser extension APIs, and the AI agent infrastructure. For details on the build system configuration, see [Build System](./9-1-build-system.md).

## Frontend Technologies

ScriptCat's user interface is built with a modern React stack, providing a responsive and maintainable codebase.

### React Framework

The extension uses **React 19.2.7** as its core UI framework across all interface contexts (options page, popup, and sandbox) [package.json:53](../package.json#L53). React 19 enables improved performance and new hooks utilized throughout the management interfaces.

Key React-related dependencies:
- `react` (19.2.7): Core library [package.json:53](../package.json#L53)
- `react-dom` (19.2.7): DOM rendering [package.json:54](../package.json#L54)
- `react-router-dom` (7.14.0): Client-side routing for the options page [package.json:57](../package.json#L57)

### UI Component Library and Styling

ScriptCat has migrated from Arco Design and UnoCSS to a **shadcn/ui** and **Tailwind CSS v4** architecture.

- **Tailwind CSS v4**: Uses `@tailwindcss/postcss` [package.json:75](../package.json#L75) and the core `tailwindcss` (4.2.4) package [package.json:106](../package.json#L106) for utility-first styling.
- **Radix UI**: Provides the accessible primitive components for shadcn/ui [package.json:52](../package.json#L52).
- **Lucide React**: The standard icon set for the new UI [package.json:50](../package.json#L50).
- **Dnd Kit**: Handles advanced drag-and-drop functionality for script reordering [package.json:33-36](../package.json#L33-L36).

```mermaid
graph TB
    subgraph "UI Layer (React 19.2.7)"
        [react-router-dom 7.17.0]
        [radix-ui Primitives]
        [shadcn/ui Components]
        [lucide-react Icons]
        [dnd-kit]
    end
    
    subgraph "Styling Engine"
        [Tailwind CSS v4]
        [PostCSS 8.5.10]
        [tailwind-merge]
        [class-variance-authority]
    end
    
    subgraph "Code Editor"
        [monaco-editor 0.52.2]
        [eslint-linter-browserify 9.26.0]
    end
    
    subgraph "i18n"
        [i18next 26.3.1]
        [react-i18next 17.0.8]
    end
    
    [shadcn/ui Components] --> [radix-ui Primitives]
    [shadcn/ui Components] --> [Tailwind CSS v4]
    [Tailwind CSS v4] --> [PostCSS 8.5.10]
    [i18next 26.3.1] --> [react-i18next 17.0.8]
```

**Diagram: Modernized Frontend Technology Stack**

Sources: [package.json:33-62](../package.json#L33-L62), [package.json:75](../package.json#L75), [package.json:106](../package.json#L106)

### Code Editor Integration

ScriptCat embeds **Monaco Editor** (0.52.2) [package.json:51](../package.json#L51) for script editing. It utilizes dedicated workers for performance:
- `editor.worker.js`: Core editor logic [rspack.config.ts:71](../rspack.config.ts#L71).
- `ts.worker.js`: TypeScript/JavaScript language support [rspack.config.ts:73](../rspack.config.ts#L73).
- `linter.worker.ts`: Custom worker for real-time linting using `eslint-linter-browserify` [rspack.config.ts:74](../rspack.config.ts#L74).

## Build and Development Tools

### Rspack Bundler

**Rspack** (1.7.11) is the core build tool [package.json:73](../package.json#L73). It provides high-performance bundling with Webpack compatibility. The configuration handles multiple entry points for the extension contexts [rspack.config.ts:56-75](../rspack.config.ts#L56-L75).

### Build Pipeline and Manifest Generation

The build system generates browser-specific manifests for Chrome and Firefox from a shared `src/manifest.json` [scripts/pack.js:68-73](../scripts/pack.js#L68-L73).
- **Chrome**: Uses `service_worker` and `userScripts` API [scripts/build-config.js](../scripts/build-config.js).
- **Firefox**: Uses `scripts` background array and adds specific CSP for sandboxing [scripts/build-config.js](../scripts/build-config.js).

```mermaid
graph LR
    subgraph "Source (src/)"
        [TS/TSX Files]
        [manifest.json]
        [CSS/PostCSS]
    end
    
    subgraph "Rspack (Rust-based)"
        [swc-loader]
        [postcss-loader]
        [DefinePlugin]
    end
    
    subgraph "Packaging (scripts/pack.js)"
        [createChromeManifest]
        [createFirefoxManifest]
        [web-jszipp]
    end
    
    [TS/TSX Files] --> [swc-loader]
    [CSS/PostCSS] --> [postcss-loader]
    [swc-loader] --> [Packaging]
    [manifest.json] --> [Packaging]
    
    [Packaging] --> [chrome.zip/crx]
    [Packaging] --> [firefox.zip]
```

**Diagram: Rspack to Multi-Browser Package Flow**

Sources: [rspack.config.ts:107-129](../rspack.config.ts#L107-L129), [scripts/pack.js:68-110](../scripts/pack.js#L68-L110)

## Data Persistence Layer

### Dexie.js (IndexedDB)

**Dexie** (4.0.10) [package.json:43](../package.json#L43) is the primary database layer. It handles the storage of scripts, code, and execution logs.

### Browser Storage APIs

ScriptCat uses native extension storage for configuration:
- `chrome.storage.local`: System-wide settings [src/manifest.json:30](../src/manifest.json#L30).
- `chrome.storage.session`: Temporary runtime state.
- `unlimitedStorage`: Permission requested to handle large script databases [src/manifest.json:42](../src/manifest.json#L42).

Sources: [package.json:43](../package.json#L43), [src/manifest.json:27-45](../src/manifest.json#L27-L45)

## AI Agent Subsystem

ScriptCat includes an AI agent layer for DOM automation and task execution.

- **Model Context Protocol (MCP)**: Uses `@modelcontextprotocol/sdk` (1.29.0) [package.json:37](../package.json#L37) to allow AI agents to interact with external tools and servers.
- **OPFS (Origin Private File System)**: Used for agent workspaces and persistent file storage.
- **LLM Integration**: Supports OpenAI and Anthropic providers for the `AgentService`.

## Core Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `cron` | 4.4.0 | Scheduled script execution [package.json:41](../package.json#L41) |
| `webdav` | 5.9.0 | Cloud sync backend [package.json:65](../package.json#L65) |
| `i18next` | 26.0.3 | Core internationalization [package.json:49](../package.json#L49) |
| `eventemitter3` | 5.0.1 | Internal event bus [package.json:46](../package.json#L46) |
| `crypto-js` | 4.2.0 | Security and hashing [package.json:42](../package.json#L42) |
| `dompurify` | 3.4.11 | XSS protection for script UI [package.json:44](../package.json#L44) |

## Quality Assurance

- **Vitest**: The primary test runner (4.1.9) [package.json:111](../package.json#L111). The configuration uses `happy-dom` for browser environment simulation [vitest.config.ts:42](../vitest.config.ts#L42).
- **Playwright**: Used for End-to-End (E2E) testing [package.json:71](../package.json#L71).
- **TypeScript**: Static typing (6.0.3) [package.json:108](../package.json#L108).
- **Husky**: Git hooks for linting and type checking before commits [package.json:10](../package.json#L10).

Sources: [package.json:8-30](../package.json#L8-L30), [package.json:108-112](../package.json#L108-L112), [vitest.config.ts:1-50](../vitest.config.ts#L1-L50)

---
