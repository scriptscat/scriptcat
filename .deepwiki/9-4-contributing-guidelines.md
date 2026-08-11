# Contributing Guidelines

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [.github/ISSUE_TEMPLATE/01_bug_report.yaml](../.github/ISSUE_TEMPLATE/01_bug_report.yaml)
- [.github/ISSUE_TEMPLATE/02_userscript_compatibility.yaml](../.github/ISSUE_TEMPLATE/02_userscript_compatibility.yaml)
- [.github/ISSUE_TEMPLATE/03_feature_request.yaml](../.github/ISSUE_TEMPLATE/03_feature_request.yaml)
- [.github/ISSUE_TEMPLATE/04_technical_proposal.yaml](../.github/ISSUE_TEMPLATE/04_technical_proposal.yaml)
- [.github/ISSUE_TEMPLATE/05_documentation.yaml](../.github/ISSUE_TEMPLATE/05_documentation.yaml)
- [.github/ISSUE_TEMPLATE/06_translation.yaml](../.github/ISSUE_TEMPLATE/06_translation.yaml)
- [.github/ISSUE_TEMPLATE/11_bug_report_en.yaml](../.github/ISSUE_TEMPLATE/11_bug_report_en.yaml)
- [.github/ISSUE_TEMPLATE/12_userscript_compatibility_en.yaml](../.github/ISSUE_TEMPLATE/12_userscript_compatibility_en.yaml)
- [.github/ISSUE_TEMPLATE/13_feature_request_en.yaml](../.github/ISSUE_TEMPLATE/13_feature_request_en.yaml)
- [.github/ISSUE_TEMPLATE/14_technical_proposal_en.yaml](../.github/ISSUE_TEMPLATE/14_technical_proposal_en.yaml)
- [.github/ISSUE_TEMPLATE/15_documentation_en.yaml](../.github/ISSUE_TEMPLATE/15_documentation_en.yaml)
- [.github/copilot-instructions.md](../.github/copilot-instructions.md)
- [.github/pull_request_template.md](../.github/pull_request_template.md)
- [AGENTS.md](../AGENTS.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [docs/CONTRIBUTING_RU.md](../docs/CONTRIBUTING_RU.md)
- [docs/CONTRIBUTING_ZH.md](../docs/CONTRIBUTING_ZH.md)
- [docs/DOC-MAINTENANCE.md](../docs/DOC-MAINTENANCE.md)
- [docs/README.md](../docs/README.md)
- [docs/design.md](../docs/design.md)
- [docs/develop.md](../docs/develop.md)
- [docs/pull-request.md](../docs/pull-request.md)
- [docs/references/develop-testing.md](../docs/references/develop-testing.md)
- [docs/verification.md](../docs/verification.md)
- [eslint.config.mjs](../eslint.config.mjs)
- [scripts/git-staged-snapshot.test.mjs](../scripts/git-staged-snapshot.test.mjs)
- [src/app/service/content/gm_api/gm_info.ts](../src/app/service/content/gm_api/gm_info.ts)
- [src/app/service/service_worker/script_update_check.ts](../src/app/service/service_worker/script_update_check.ts)
- [src/app/types.d.ts](../src/app/types.d.ts)
- [src/pages/components/NameAvatar.test.tsx](../src/pages/components/NameAvatar.test.tsx)
- [src/pages/components/ui/empty-state.test.tsx](../src/pages/components/ui/empty-state.test.tsx)

</details>



This document provides comprehensive guidelines for contributing to the ScriptCat project, including engineering principles, pull request workflow, commit conventions, development environment setup, and code quality standards.

## Purpose and Scope

This page covers the contribution workflow for the ScriptCat extension codebase, including:
- Engineering principles and the "Confirm before you fix" policy [AGENTS.md:23-36](../AGENTS.md#L23-L36).
- Issue submission and feature requests via GitHub templates [CONTRIBUTING.md:7-20](../CONTRIBUTING.md#L7-L20).
- Pull request process and mandatory code review [docs/pull-request.md:1-15](../docs/pull-request.md#L1-L15).
- Commit message conventions using gitmoji [CONTRIBUTING.md:37-46](../CONTRIBUTING.md#L37-L46).
- Development environment configuration and pre-commit hooks [docs/develop.md:9-42](../docs/develop.md#L9-L42).
- Code quality, TDD/BDD practices, and custom ESLint rules [docs/references/develop-testing.md:1-25](../docs/references/develop-testing.md#L1-L25).

---

## Engineering Principles (AGENTS.md)

ScriptCat follows a set of non-negotiable engineering principles that govern all contributions.

1.  **Fix root causes, not symptoms**: Refactor over patch. Avoid `as any` or swallowing errors [AGENTS.md:28](../AGENTS.md#L28).
2.  **Confirm before you fix**: Reproduce a bug and confirm its existence before touching code. Capture the reproduction evidence first [AGENTS.md:29](../AGENTS.md#L29).
3.  **TDD/BDD first**: For changes altering observable behavior, write failing tests *before* implementation [AGENTS.md:30](../AGENTS.md#L30).
4.  **Scope discipline**: Stay in your lane. A bug fix is not a cleanup PR. Do not touch unrelated files [AGENTS.md:33](../AGENTS.md#L33).
5.  **Direct replacement**: When swapping libraries, replace in place rather than creating adapter layers [AGENTS.md:32](../AGENTS.md#L32).

Sources: [AGENTS.md:23-36](../AGENTS.md#L23-L36)

---

## Issue Submission

Before submitting an issue, search [existing issues](https://github.com/scriptscat/scriptcat/issues) to avoid duplicates [CONTRIBUTING.md:7-9](../CONTRIBUTING.md#L7-L9).

### Reporting Bugs and Vulnerabilities

When reporting bugs using the provided templates:
- Provide clear **Reproduction Steps** and **Environment Information** [CONTRIBUTING.md:11-14](../CONTRIBUTING.md#L11-L14).
- For background scripts, logs are often found in the `offscreen.html` console [.github/ISSUE_TEMPLATE/01_bug_report.yaml:57-71](../.github/ISSUE_TEMPLATE/01_bug_report.yaml#L57-L71).
- **Security vulnerabilities** must be reported privately following the Security Policy [CONTRIBUTING.md:15-16](../CONTRIBUTING.md#L15-L16).

### Feature Requests

Propose new features by describing the need in detail and providing potential solutions [CONTRIBUTING.md:17-20](../CONTRIBUTING.md#L17-L20).

Sources: [CONTRIBUTING.md:7-20](../CONTRIBUTING.md#L7-L20), [.github/ISSUE_TEMPLATE/01_bug_report.yaml:1-72](../.github/ISSUE_TEMPLATE/01_bug_report.yaml#L1-L72)

---

## Pull Request Workflow

### Development Environment Setup

ScriptCat uses `pnpm` for dependency management [CONTRIBUTING.md:23](../CONTRIBUTING.md#L23).

```bash
pnpm install              # Install dependencies
pnpm run dev              # Dev build (source maps); load dist/ext as unpacked extension
pnpm run build            # Production Rspack build
pnpm run lint             # Run all linters (prettier, tsc, check:i18n, eslint)
pnpm test                 # Run Vitest unit tests
```
[docs/develop.md:11-25](../docs/develop.md#L11-L25)

**Hot Reloading**: The browser hot-reloads page changes. However, edits to `manifest.json`, `service_worker`, `offscreen`, or `sandbox` require manually reloading the extension in `chrome://extensions` [docs/develop.md:41-42](../docs/develop.md#L41-L42).

### Commit Message Conventions

ScriptCat follows the [gitmoji](https://gitmoji.dev/) specification. Each commit should contain only one logical modification [CONTRIBUTING.md:37-40](../CONTRIBUTING.md#L37-L40).

| Gitmoji | Purpose |
| :--- | :--- |
| ✨ `:sparkles:` | New feature [CONTRIBUTING.md:45](../CONTRIBUTING.md#L45) |
| 🐛 `:bug:` | Bug fix |
| 📝 `:memo:` | Documentation |
| 🎨 `:art:` | Code structure/format |
| ✅ `:white_check_mark:` | Add tests |
| 🌐 `:globe_with_meridians:` | Internationalization |

### PR Description and Evidence

PRs must follow the structure defined in `docs/pull-request.md`.
- **Checklist**: Must include "Code reviewed by human" and "Changes tested" [docs/pull-request.md:20-25](../docs/pull-request.md#L20-L25).
- **Verification**: List exact commands and concise results [docs/pull-request.md:54-57](../docs/pull-request.md#L54-L57).
- **Screenshots**: Mandatory for visual changes [docs/pull-request.md:61](../docs/pull-request.md#L61).

Sources: [docs/develop.md:9-42](../docs/develop.md#L9-L42), [CONTRIBUTING.md:37-46](../CONTRIBUTING.md#L37-L46), [docs/pull-request.md:1-82](../docs/pull-request.md#L1-L82)

---

## Code Quality and Pre-commit Hooks

### Pre-commit (Husky)
The project uses Husky to run checks before commits:
1.  Runs `prettier --check` and `pnpm run typecheck` [docs/develop.md:32-33](../docs/develop.md#L32-L33).
2.  Runs ESLint on staged files [docs/develop.md:33](../docs/develop.md#L33).
3.  Runs `check:i18n` if locale files are staged [docs/develop.md:34](../docs/develop.md#L34).
4.  Runs `pnpm run test:ci` when committing on `main` or `release/*` [docs/develop.md:35](../docs/develop.md#L35).

### Custom ESLint Rules
ScriptCat enforces specific conventions via custom rules in `eslint-rules/` [eslint.config.mjs:35-49](../eslint.config.mjs#L35-L49):
- `chrome-error/require-last-error-check`: Enforces handling of `chrome.runtime.lastError` [eslint.config.mjs:66](../eslint.config.mjs#L66).
- `scriptcat/no-i18n-default-value`: Bans `t(key, { defaultValue })` to prevent hardcoded text leaks [eslint.config.mjs:67](../eslint.config.mjs#L67).
- `scriptcat/no-raw-color-classname`: Bans raw hex/palette colors (e.g., `bg-white`) in UI pages; use design tokens instead [eslint.config.mjs:128](../eslint.config.mjs#L128).
- `no-restricted-syntax`: Bans `forwardRef` in `src/pages/`, enforcing React 19 function + ref-prop style [eslint.config.mjs:131-146](../eslint.config.mjs#L131-L146).

Sources: [docs/develop.md:32-40](../docs/develop.md#L32-L40), [eslint.config.mjs:1-188](../eslint.config.mjs#L1-L188)

---

## Testing and Verification

### Test Boundaries
Contributors must choose the narrowest boundary for testing [docs/references/develop-testing.md:44-55](../docs/references/develop-testing.md#L44-L55):
- **Pure Unit Test**: For logic, parsing, and validation [docs/references/develop-testing.md:50](../docs/references/develop-testing.md#L50).
- **Service/Repo Test**: For persistence, messages, and lifecycle [docs/references/develop-testing.md:52](../docs/references/develop-testing.md#L52).
- **E2E/Integration**: For real browser APIs and extension context wiring [docs/references/develop-testing.md:53](../docs/references/develop-testing.md#L53).

### Functional Verification
When a change requires the built extension (cross-context wiring or Chrome APIs), use the **Functional Verification Guide** [docs/verification.md:1-7](../docs/verification.md#L1-L7):
1.  Build the extension using `pnpm run dev` [docs/verification.md:75-78](../docs/verification.md#L75-L78).
2.  Write a **throwaway scratch script** in `e2e/scratch/` [docs/verification.md:39](../docs/verification.md#L39).
3.  Run the scratch script and document findings in a `report.md` [docs/verification.md:119-120](../docs/verification.md#L119-L120).

Sources: [docs/references/develop-testing.md:44-71](../docs/references/develop-testing.md#L44-L71), [docs/verification.md:1-120](../docs/verification.md#L1-L120)

---

## Development Architecture Mapping

The following diagrams bridge natural language development tasks to specific code entities and services.

### Development Task to Code Entity
```mermaid
graph LR
    subgraph "Natural Language Space"
        "How do I access data?"["How do I access data?"]
        "How do I broadcast events?"["How do I broadcast events?"]
        "How do I handle messages?"["How do I handle messages?"]
    end

    subgraph "Code Entity Space"
        "How do I access data?" --- Repo["Repo<T> (e.g., ScriptDAO, ResourceDAO)"]
        "How do I broadcast events?" --- MQ["IMessageQueue"]
        "How do I handle messages?" --- Group["Group (from @Packages/message)"]
    end

    Repo --- DAO_Impl["src/app/repo/scripts.ts"]
    MQ --- MQ_Impl["src/app/service/queue.ts"]
    Group --- Svc_Init["ExampleService.init()"]
```
Sources: [AGENTS.md:31-31](../AGENTS.md#L31-L31), [docs/develop.md:60-63](../docs/develop.md#L60-L63), [docs/README.md:15-15](../docs/README.md#L15-L15)

### Messaging Infrastructure Mapping
```mermaid
graph TD
    subgraph "Natural Language Goal"
        "Communicate with Sandbox"["Communicate with Sandbox"]
        "Notify Content Script"["Notify Content Script"]
        "Broadcast to all contexts"["Broadcast to all contexts"]
    end

    subgraph "Code Implementation"
        "Communicate with Sandbox" --- WM["WindowMessage (Offscreen <-> Sandbox)"]
        "Notify Content Script" --- EM["ExtensionMessage (SW <-> Content)"]
        "Broadcast to all contexts" --- MQ_Svc["MessageQueue (src/app/service/queue.ts)"]
    end

    WM --- SB_Entry["src/sandbox.ts"]
    EM --- SW_Entry["src/service_worker.ts"]
    MQ_Svc --- PubSub["IMessageQueue.publish()"]
```
Sources: [AGENTS.md:42-67](../AGENTS.md#L42-L67), [docs/develop.md:60-62](../docs/develop.md#L60-L62)

---

## Documentation and Translation

### Documentation Maintenance
When updating documentation, follow the **Fact-Check Guide** [docs/DOC-MAINTENANCE.md:1-4](../docs/DOC-MAINTENANCE.md#L1-L4):
- **Rule of thumb**: If you can't `git grep` it in the committed code on this branch, don't claim it [docs/DOC-MAINTENANCE.md:28](../docs/DOC-MAINTENANCE.md#L28).
- Check for **Policy Consistency**: Ensure rules in one doc don't contradict another [docs/DOC-MAINTENANCE.md:48-51](../docs/DOC-MAINTENANCE.md#L48-L51).

### Internationalization (i18n)
- Translation files are in `src/locales/` [CONTRIBUTING.md:66](../CONTRIBUTING.md#L66).
- Use `pnpm run check:i18n` to ensure key parity across languages [docs/develop.md:28](../docs/develop.md#L28).
- Follow the per-locale terminology guides in `docs/references/terminology-<locale>.md` [docs/README.md:31-32](../docs/README.md#L31-L32).

Sources: [docs/DOC-MAINTENANCE.md:1-102](../docs/DOC-MAINTENANCE.md#L1-L102), [CONTRIBUTING.md:62-70](../CONTRIBUTING.md#L62-L70), [docs/develop.md:28-30](../docs/develop.md#L28-L30)

---
