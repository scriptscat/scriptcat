# ScriptCat Development Guide

## Code Review

When performing a code review, respond in Chinese.

## Architecture Overview

ScriptCat is a sophisticated browser extension that executes user scripts with a unique multi-process architecture:

### Core Components
- **Service Worker** (`src/service_worker.ts`) - Main background process handling script management, installations, and chrome APIs
- **Offscreen** (`src/offscreen.ts`) - Isolated background environment for running background/scheduled scripts on Chrome. Firefox MV3 has no separate Offscreen document; `EventPageOffscreenManager` (`src/app/service/offscreen/event_page_manager.ts`) runs the same logic inside the DOM-capable background event page instead.
- **Sandbox** (`src/sandbox.ts`) - Secure execution environment for background/scheduled scripts only (no page context); isolated via `with(arguments[0])`
- **Content Scripts** (`src/content.ts`) - Injected into web pages to execute user scripts
- **Inject Scripts** (`src/inject.ts`) - Runs in page context with access to page globals, including `unsafeWindow`

### Message Passing System
ScriptCat uses a sophisticated message passing architecture (`packages/message/`):
- **ExtensionMessage** - Chrome extension runtime messages between service worker/content/pages
- **WindowMessage** - PostMessage-based communication between offscreen/sandbox
- **CustomEventMessage** - CustomEvent-based communication between content/inject scripts
- **MessageQueue** - Cross-environment event broadcasting system

Key pattern: background scripts flow Service Worker → Offscreen → Sandbox; page scripts flow Service Worker → Content → Inject. Other paths exist alongside this: UI pages talk to the Service Worker directly, `MessageQueue` broadcasts across contexts outside the request/reply chain, and Agent storage (OPFS/Dexie) is read/written without going through this message flow.

### Script Execution Flow
1. **Page Scripts**: Service Worker registers with `chrome.userScripts` → injected into pages
2. **Background Scripts**: Service Worker → Offscreen → Sandbox execution
3. **Scheduled Scripts**: Cron-based execution in Sandbox environment

## Key Development Patterns

### Path Aliases
```typescript
import x from "@App/service_worker";   // -> src/service_worker
import y from "@Packages/message";     // -> packages/message
import z from "@Tests/utils";          // -> tests/utils
```

### Repository Pattern
Persistence is a small backend taxonomy, not one base class: `Repo<T>` (`chrome.storage.local`, e.g. `ScriptDAO`, `ResourceDAO`, `SubscribeDAO`), `DAO<T>` (Dexie/IndexedDB, e.g. `LoggerDAO`), `OPFSRepo` (OPFS-backed data, e.g. `AgentChatRepo`, `SkillRepo`), and a few custom repositories (e.g. `TrashScriptDAO`) where none of those fit. See [`docs/references/architecture-data.md`](../docs/references/architecture-data.md) for the full inventory and entity-decision recipe.
```typescript
export class ScriptDAO extends Repo<Script> {
  public save(val: Script) { return super._save(val.uuid, val); }
}
```

### Service Layer Structure
Services follow a consistent pattern with dependency injection:
```typescript
export class ExampleService {
  constructor(
    private group: Group,           // Message handling group
    private messageQueue: IMessageQueue,  // Event broadcasting (MessageQueue's interface)
    private dataDAO: DataDAO        // Data access
  ) {}
  
  init() {
    this.group.on("action", this.handleAction.bind(this));
  }
}
```

### Script Compilation & Sandboxing
User scripts are compiled with sandbox context isolation:
- `compileScriptCode()` - Wraps scripts with error handling and context binding
- `compileInjectScript()` - Creates window-mounted functions for inject scripts
- Sandbox uses `with(arguments[0])` for controlled variable access

## Technology Stack

- **React 19** - Component framework with automatic runtime
- **shadcn/ui** - UI component library built on Radix UI
- **Tailwind CSS** - Utility-first CSS framework for styling
- **Rspack** - Fast bundler (Webpack alternative) with SWC
- **TypeScript** - Type-safe development


## Development Workflows

### Build & Development
```bash
pnpm run dev           # Development with source maps
pnpm run dev:noMap     # Development without source maps (needed for incognito)
pnpm run build         # Production build
pnpm run pack          # Create browser extension packages
```

### Testing
```bash
pnpm test              # Run all tests with Vitest
pnpm run coverage      # Generate coverage reports
```

**Testing Patterns:**
- Uses Vitest with happy-dom environment
- Chrome extension APIs mocked via `@Packages/chrome-extension-mock`
- Message system testing with `MockMessage` classes
- Sandbox testing validates script isolation

### Code Organization
- **Monorepo structure** with packages in `packages/` (message, filesystem, etc.)
- **Feature-based organization** in `src/app/service/` by environment
- **Shared utilities** in `src/pkg/` for cross-cutting concerns
- **Type definitions** in `src/types/` with global declarations

### Browser Extension Specifics
- **Manifest V3** with service worker background
- **User Scripts API** for script injection (Chrome/Edge)
- **Offscreen API** for DOM access in background contexts  
- **Declarative Net Request** for script installation interception

## Critical Integration Points

### Script Installation Flow
1. URL patterns trigger declarative net request rules
2. Service Worker opens install page with cached script data
3. Install page validates and processes script metadata
4. Scripts registered with appropriate execution environment

### GM API Implementation
- Split across Content, Service Worker, and Offscreen contexts (each a `GMApi` in its own module)
- Permission verification via `PermissionVerify` service
- Value storage abstracted through `ValueService`
- Cross-origin requests handled in service worker context

### Resource Management
- `ResourceService` handles script dependencies (@require, @resource)
- Content Security Policy handling for external resources
- Caching layer via `Cache` class with automatic expiration

## Debug & Development Notes

- Use `pnpm run dev:noMap` for incognito window development
- Background script changes require extension reload
- Message passing debugging available in service worker console
- Sandbox (background/scheduled scripts) has no page context; page-context access via `unsafeWindow` is only available to Inject/page scripts

## File Structure Patterns
- Tests co-located with source files (`.test.ts` / `.test.tsx` suffix), plus end-to-end specs under `e2e/*.spec.ts`
- Template files use `.tpl` extension for build-time processing
- Configuration files use factory pattern for environment-specific setup

## Language
- The code is developed and maintained by developers based in Mainland China.
- Comments should preferably be written in Simplified Chinese.
- The user interface supports multiple languages, with English set as the default for global users.

## PR Review Policy

When performing Pull Request (PR) reviews, Copilot must always conduct a **comprehensive and independent review** of the entire PR content.

- **Full Review Every Time**  
  Always review **all modified files** in every PR, regardless of previous reviews or user comments. Even during re-reviews, treat the PR as new and **do not rely on prior review states**.

- **No Skipping of Files**  
  Do not skip or ignore any text-based file types (including `.md`, `.json`, `.yml`, `.toml`, `.ts`, `.js`, `.py`, `.html`, `.css`, `.tsx`, `.vue`, `.sh`, etc.). Every file that is changed must be fully examined.

- **Reference as Context Only**  
  PR descriptions, commit messages, or user discussions serve only as **reference context**. The review must focus primarily on the **actual code and file changes**.

- **Infer Intent from Code Changes**  
  Always attempt to **infer the purpose and intent** of the changes directly from the modified content, rather than relying solely on user statements or PR titles.

- **Critical Thinking Requirement**  
  For each change, Copilot should assess correctness, consistency, and maintainability — ensuring that logic, style, and architectural impact align with project standards.

- **Independent Verification**  
  Do not assume unchanged files or previously reviewed sections are safe; verify all code paths potentially affected by the modifications.
