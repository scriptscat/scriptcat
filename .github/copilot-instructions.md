# ScriptCat Development Guide

## Code Review

When performing a code review, respond in Chinese.

## Architecture Overview

ScriptCat is a sophisticated browser extension that executes user scripts with a unique multi-process architecture:

### Core Components
- **Service Worker** (`src/service_worker.ts`) - Main background process handling script management, installations, and chrome APIs
- **Offscreen** (`src/offscreen.ts`) - Isolated background environment for running background/scheduled scripts
- **Sandbox** (`src/sandbox.ts`) - Secure execution environment inside offscreen for script isolation
- **Content Scripts** (`src/content.ts`) - Injected into web pages to execute user scripts
- **Inject Scripts** (`src/inject.ts`) - Runs in page context with access to page globals

### Message Passing System
ScriptCat uses a sophisticated message passing architecture (`packages/message/`):
- **ExtensionMessage** - Chrome extension runtime messages between service worker/content/pages
- **WindowMessage** - PostMessage-based communication between offscreen/sandbox
- **CustomEventMessage** - CustomEvent-based communication between content/inject scripts
- **MessageQueue** - Cross-environment event broadcasting system

Key pattern: All communication flows through Service Worker → Offscreen → Sandbox for background scripts, or Service Worker → Content → Inject for page scripts.

### Script Execution Flow
1. **Page Scripts**: Service Worker registers with `chrome.userScripts` → injected into pages
2. **Background Scripts**: Service Worker → Offscreen → Sandbox execution
3. **Scheduled Scripts**: Cron-based execution in Sandbox environment

## Key Development Patterns

### Path Aliases
```typescript
"@App": "./src/"
"@Packages": "./packages/"
"@Tests": "./tests/"
```

### Repository Pattern
All data access uses DAO classes extending `Repo<T>` base class:
```typescript
// Example: ScriptDAO, ResourceDAO, SubscribeDAO
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
    private messageQueue: MessageQueue,  // Event broadcasting
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

- **React 18** - Component framework with automatic runtime
- **Arco Design** - UI component library (`@arco-design/web-react`)
- **UnoCSS** - Atomic CSS framework for styling
- **Redux Toolkit** - State management with RTK
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
- Uses Vitest with jsdom environment
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
- Split between Service Worker (`GMApi`) and Offscreen (`OffscreenGMApi`)
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
- Sandbox script execution isolated from page context - use `unsafeWindow` for page access

## File Structure Patterns
- Tests co-located with source files (`.test.ts` suffix)
- Template files use `.tpl` extension for build-time processing
- Configuration files use factory pattern for environment-specific setup
