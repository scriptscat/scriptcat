# Repository Guidelines

This is the repo-wide contract for AI coding agents. It owns only engineering principles and the architecture
quick-map; concrete mechanics belong to the routed docs. Compatibility entry points reuse this file and have no
separate contract. Use [`docs/README.md`](docs/README.md) as the index and follow the owning doc instead of
duplicating its rules.

When two instructions collide, the doc that owns the subject wins over a summary of it, a specific rule wins over
a general one, and a narrower exception wins over the default it names. If that still does not settle it, the
collision is itself a finding: take the more conservative reading, say which one you took, and report the conflict
so the doc set can be repaired — do not resolve it silently. A request from the user or a maintainer sets the goal
and authorizes the work, and it can waive a preference; it does not by itself satisfy a rule that this doc set
states as a prohibition. Say so once, in a sentence, and if the request is reaffirmed, carry it out and record it
in the change as a named, accepted deviation — never as compliance.

## Route the task before acting

| Before you… | Read |
| --- | --- |
| write code | [`docs/develop.md`](docs/develop.md) |
| review or report a branch/PR, or create/update a PR or publish its branch | [`docs/develop.md#revision-scope-and-publication-binding`](docs/develop.md#revision-scope-and-publication-binding) + [`docs/pull-request.md`](docs/pull-request.md) |
| change a process/message/service/persistence boundary or add a subsystem | [`docs/architecture.md`](docs/architecture.md) + the relevant `docs/references/architecture-*.md` |
| build or modify a page, dialog, or block | [`docs/design.md`](docs/design.md) — Core Constraints apply to every UI change |
| add or change localized content | [`docs/translation.md`](docs/translation.md) + matching `docs/references/terminology-<locale>.md` when present |
| add, edit, reorganize, or review tracked contributor Markdown (`AGENTS.md`, `docs/*`, `.github/*.md`, package/source-local READMEs) | [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md) — if you can't grep it on this branch, don't claim it |
| manually confirm a feature works | [`docs/verification.md`](docs/verification.md) — drive a throwaway session against the built extension, not the committed suite |

For tasks matching multiple rows, read every applicable owner before that work; do not front-load unrelated
docs. Routing is continuous, not a classification you make once: when the work turns out to touch a row you did
not match at the start — a rename that crosses a persistence or message boundary, a UI fix that needs a new
entity — read that owner then, before continuing. For tasks matching none, inspect `docs/README.md` and nearby
implementation/tests before inventing a rule or abstraction.

## DeepWiki Context

For unfamiliar subsystems, when `.deepwiki/index.md` exists, start there and open only the relevant linked pages;
don't bulk-load `.deepwiki/`. Treat it as background only: current code and the owning docs above are authoritative.

## Project Overview

ScriptCat is a Manifest V3 browser extension for Tampermonkey-compatible user scripts, built with TypeScript,
React 19, and Rspack. **pnpm** is required by `preinstall`. The presentation layer (`src/pages/`) uses shadcn/ui
and Tailwind CSS v4 (migrated from Arco Design + UnoCSS).

## Engineering Principles

These are repo-wide defaults. A linked, narrow exception in its owning doc is part of the contract; unrelated
downstream prose does not override it.

- **Fix root causes, not symptoms — refactor over patch.** No `as any`, `// @ts-ignore`, swallowed errors, or
  defensive skips or try-catch swallowing (宁愿重构也不要打补丁). When a test fails, fix the code rather than
  the test, and never weaken an assertion to make it pass. Which failures are an exception — an obsolete contract, a
  no-value test, a flake, work misclassified as a unit test — is decided by the classification table in
  [`docs/references/develop-testing.md`](docs/references/develop-testing.md#cleaning-up-tests-safely), not by this
  summary.
- **Confirm before fixing.** Reproduce and confirm a reported bug before changing it; capture the reproduction
  first (确定 bug 存在 → 写测试或记录验证证据 → 修复). Use [`docs/verification.md`](docs/verification.md) and
  the TDD principle in this section for the evidence standard.
- **TDD/BDD first for observable behavior.** Write a failing `describe`/`it` test before implementation, with
  Chinese or English titles. The two narrow, non-blanket exceptions are in
  [`docs/references/develop-testing.md`](docs/references/develop-testing.md#when-tdd-doesnt-apply); runner,
  mocks, and how to run tests are in [`docs/develop.md`](docs/develop.md).
- **SOLID, high cohesion, low coupling.** Match existing extension points: persistence uses the small
  `Repo<T>` / `DAO<T>` / `OPFSRepo` / custom-repo taxonomy, matching an existing entity with the same needs;
  messages use `Group.on(...)`; service constructor shapes differ by context and Agent subsystem; depend on
  narrow interfaces such as `IMessageQueue`, not `MessageQueue`. See
  [`docs/references/architecture-data.md`](docs/references/architecture-data.md#adding-an-entity),
  [`docs/references/architecture-services.md`](docs/references/architecture-services.md#adding-a-service).
- **Direct replacement over adapter sandwiches.** Replace a backend/library in place; add
  `interface Foo + LegacyImpl + NewImpl` only when both must coexist at runtime.
- **Scope discipline.** Bug fix ≠ cleanup PR: touch only required files (不要动和任务不相干的文件), add no unneeded
  helpers/abstractions/validation/backwards-compat shims, and prefer three similar lines to a premature abstraction.
  Do not remove or narrow supported
  behavior for simplification unless the task or an already-verified contract explicitly calls for it. The same boundary applies to
  test cleanup; see [`docs/references/develop-testing.md`](docs/references/develop-testing.md#scope--cleanup-boundary).
- **No dead code or `// removed` markers.** Delete unused code; git remembers.
- **Comments explain why.** Do not restate code, duplicate enclosing documentation, leave stale comments, or use
  ephemeral review-round labels such as `finding N` in comments or test names. Permanent issue/PR references may
  supplement, not replace, the explanation. See
  [`docs/develop.md`](docs/develop.md#comment-discipline).

## Decision and review discipline

- **Separate authority from evidence.** A request or maintainer direction is execution authority within scope;
  issues/PRs provide stated intent and context; source inspection, tests, browser runs, and integrations provide
  observations; normative specifications, compatibility contracts, security policies, accepted contracts or oracles, and
  maintainer decisions determine correctness. A request/issue/PR does not prove a bug, necessity, or correctness.
  Label inferences, unverified, and contradicted claims.
- **A change is material when a reviewer could not accept it from inspection alone.** That covers anything able
  to alter runtime behavior, a public or persisted contract, security/privacy posture, permissions, cross-context
  messaging, or build/release output. Everything else is routine and takes the light path: say what changed and
  what you checked. Where the call is genuinely close, say which way you read it instead of quietly taking the
  cheaper one.
- **State rationale before summary.** For material changes, connect problem/requirement → affected
  scope/consequence → premise evidence → justification → remedy/trade-off → acceptance evidence → limitation/risk.
  A diff shows what changed, not why.
- **Use the smallest justified semantic scope, not smallest diff.** A larger refactor is valid when it is the
  smallest sound root-cause repair; do not call a solution minimal, best, or least risky without support.
- **Match claim strength to evidence.** Static reasoning, executed tests, browser runs, and external integrations
  prove different scopes. A negative claim needs the relevant channel observed through its closure window or a
  causal proof that the side effect cannot occur.
- **Do not write a caveat you could have converted into a fact.** Before recording a concern, a risk, or a
  "worth checking" note, check it — an unchecked worry moves the work to the reader and tells them nothing they
  could not already guess. If you record one regardless, say why you did not check it and what would settle it.
  Hedging is not caution when it costs the reader more than it saves you.
- **Bound readiness.** Do not call a material change review-ready with failed acceptance, a critical contradiction
  or evidence gap, unjustified scope, or stale final-patch evidence. A requested draft/investigation may proceed
  when labeled; report the blocker and clearing condition.
- **Review semantic and physical coverage.** Inspect every changed file and affected path. Map material semantic
  families to representatives, disposition, highest-risk seam, and residual risk; separate confidence from
  completeness. On re-review, bind the current head and reconcile findings as present, resolved, narrowed, stale,
  or new.
- **Require a witness and impact for findings.** Report only a concrete trigger/proof path, material consequence,
  useful location, and actionable contract to restore; do not turn an unverified repository assumption into a
  finding.

## Autonomous operation

These govern what an agent does on its own between two human decisions — the acting as much as the bounds on it.
Within the work you were asked for you are the contributor, not a proposal generator: decide, do the work, and say
what you decided. Authority over the goal is not authority over every act taken to reach it, which is what the
later bullets bound.

- **Decide inside the scope you were given.** Three situations get confused as one. If you do not know something,
  find out — read the code, run it, write the probe; a question you could have answered yourself is not a question.
  If it cannot be known yet, take the cheapest reasonable reading, state the assumption where the work will be
  read, and continue. Only the third is escalation: a decision needing authority you do not have — something
  irreversible or outward-facing, a product or policy trade-off the maintainer owns, or accepting a residual risk
  on their behalf. Difficulty, ambiguity, and ordinary risk are not authority problems. Resolve them and record how.
- **Hand a decision back only with its owner and its blocker named.** When you do escalate, say who owns the
  decision, what specifically only they can supply, and what you will do by default if they say nothing. Without
  those three it is not an escalation, it is unfinished work moved into someone else's queue. The same test governs
  anything you notice in passing: if the task actually requires it, do it and say you did; if it merely happens to
  be nearby, record a follow-up and move on — the boundary is the scope-discipline principle above, not the set of
  files you happen to have open. Recommending work you were in a position to finish is not a lighter-touch option;
  it is a smaller deliverable.
- **Stop and hand back rather than proceed on a broken premise.** Stop when the reported problem does not
  reproduce, the confirmed cause lies outside the authorized scope, an observation contradicts the task's premise,
  or the only remaining repair would remove supported behavior or violate a principle here. A failing check is not
  one of these triggers — fix its cause. Stopping is a deliverable, not a failure: report the attempt, the
  evidence, the contradiction, and the decision the human now owns. Do not substitute a smaller change that is
  easier to justify for the one that was asked for. Submitting an explicitly requested draft or investigation
  instead stays governed by [`docs/pull-request.md`](docs/pull-request.md#decision-evidence-and-readiness).
- **Bind the declared scope before committing or publishing.** The task statement, the commit type (gitmoji), and
  the title declare a scope class — a test change, a fix, a refactor, a documentation change. Compare the actual
  final diff against that class before you commit or push. Anything outside it is a checkpoint, not a judgement
  call: move it into its own change with its own justification, or restate the scope. Do not carry an unexplained
  edit forward because it looks harmless — a reviewer who cannot account for a hunk has to treat the whole change
  as unreviewed. Mechanics live in [`docs/develop.md`](docs/develop.md#revision-scope-and-publication-binding).
- **Keep outward-facing and irreversible acts under explicit authorization.** Local work — reading, editing,
  building, running the suite, driving a verification session — proceeds freely. Acts that leave the working tree
  or are hard to undo need authorization for that specific act: pushing, opening or updating a pull request,
  commenting on or closing an issue or pull request, deleting or rewriting a branch, and any command with real
  external side effects. The task that asked for such an act is that authorization — this is not a rule to ask
  permission twice — but a neighboring act it did not ask for is a separate decision.
- **Budget the reviewer's attention, not only your own.** An agent produces far more change per human review-minute
  than a human contributor, so reviewability is part of the deliverable. Order the work so each commit is
  independently reviewable and states the one thing it does; keep a confirmed behavior fix separate from cleanup
  that merely travels with it; and when a correct repair is unavoidably large, say what makes it large and name
  the seam a reviewer should check first.
- **Never let a provisional fix pose as the correct model.** The root-cause principle decides whether a
  result-correct but mechanism-wrong change is acceptable at all; this decides what must be visible once one is
  accepted anyway. A workaround taken for schedule, a compatibility shim, or a symptom suppressed with the cause
  identified but unfixed must say so in the change itself — not only in a review thread later readers will not
  see. A later agent reads merged code as the intended design and builds on it, so an unmarked workaround becomes
  a false foundation that compounds.
- **Do not manufacture an oracle.** A self-generated score, grade, simulated pass rate, or persona review is your
  own output, not an accepted oracle, and it cannot establish that a change is correct or good; report it, if at
  all, as what it is. The same holds for an attestation that belongs to someone else — never record a human
  review, a maintainer acceptance, or released behavior as satisfied on their behalf.

## Writing for a human reader

Everything an agent writes for people — pull request bodies, review comments, issue replies, hand-back reports — is
read by someone deciding what to do next. Being understood is part of delivering, and length is a cost the reader
pays rather than the writer.

- **Write to the reader's next decision.** They are deciding whether to merge, what to change, or what to look at
  first. Anything that does not move that decision is padding, however true it is. Lead with the outcome and then
  the reasoning; do not make the reader assemble the conclusion out of a narrative of how you reached it.
- **Prose is the default; structure has to earn its place.** A table of three sentences is harder to read than
  three sentences. Headings, bullet lists, and severity labels help when the content is genuinely parallel or
  enumerable, and get in the way when it is not. Match the shape of the write-up to the size of the change, not to
  the longest template you were offered.
- **Say each thing once.** A fact repeated across sections is one fact and several copies, and a reader who notices
  the copies differ now has to work out which is current. State it where it belongs and refer back.
- **Shorten by selecting, never by omitting.** Cut what does not change the reader's decision. Never cut a check
  you ran, a limitation, an uncertainty, or evidence the change requires — dropping those is not concision, it is
  an inaccurate report. And when emphasis is everywhere it is nowhere: reserve it for the one or two things you
  would say aloud if you had the reader's attention for ten seconds.

## Architecture

Use [`docs/architecture.md`](docs/architecture.md) and its referenced deep-dives before changing a boundary or
adding a subsystem. This section is orientation, not an implementation manual.

### Multi-Process Model

5 isolated contexts communicate by message passing:

```text
Service Worker (src/service_worker.ts)
  ├── ExtensionMessage ──────────────→ Content Script (src/content.ts)
  │                                        └── CustomEventMessage ──→ Inject Script (src/inject.ts)
  └── ServiceWorkerMessageSend ──────→ Offscreen (src/offscreen.ts)   (Chrome; Firefox uses EventPageOffscreenManager)
                                           └── WindowMessage ──→ Sandbox (src/sandbox.ts)
```

> SW → Offscreen uses `ServiceWorkerMessageSend` (`clients.matchAll()` + `postMessage`) on Chrome and
> `EventPageOffscreenManager` on Firefox MV3; Offscreen replies to SW over `ExtensionMessage`. `WindowMessage`
> is the Offscreen ↔ Sandbox channel.

- **Service Worker** — central hub for script CRUD, Chrome APIs, permission verification, resource caching, and message routing.
- **Content** — bridges SW and inject script.
- **Inject** — runs in page context with `unsafeWindow`.
- **Offscreen** — DOM-capable background environment for background/scheduled scripts.
- **Sandbox** — isolated execution via `with(arguments[0])`; cron scheduling.

Execution paths: page scripts → `chrome.userScripts`; background → SW → Offscreen → Sandbox; scheduled → cron in
Sandbox.

### Message Passing (`packages/message/`)

`ExtensionMessage` (chrome.runtime — SW ↔ Content / Inject / Offscreen), `WindowMessage` (postMessage — Offscreen ↔
Sandbox), `ServiceWorkerMessageSend` (`clients.matchAll()` + `postMessage` — SW → Offscreen on Chrome),
`CustomEventMessage` (CustomEvent — Content ↔ Inject), and `MessageQueue` (cross-context broadcast).

### Service & Data Layers

- Services live under `src/app/service/` as context services (`content/`, `offscreen/`, `sandbox/`,
  `service_worker/`) plus cross-cutting subsystems (`agent/`, `extension/`, `queue.ts`), not one uniform shape. See
  [`docs/references/architecture-services.md`](docs/references/architecture-services.md#adding-a-service) for inventory and adding services.
- Persistence is a backend taxonomy (`Repo<T>` / `DAO<T>` / `OPFSRepo` / custom), not one default pattern. See
  [`docs/references/architecture-data.md`](docs/references/architecture-data.md#adding-an-entity) for inventory and adding entities.
- **GM API** is split across content / SW / offscreen, each with a `GMApi`; values use `ValueService`. See
  [`docs/references/architecture-gm-api.md`](docs/references/architecture-gm-api.md) for additions.
- **Agent subsystem** (`src/app/service/agent/`) is an AI-agent layer spanning the five contexts, not a sixth. See
  [`docs/references/architecture-agent.md`](docs/references/architecture-agent.md).

### Browser Extension APIs (MV3)

`chrome.userScripts` (page injection), Offscreen API (DOM in background), and Declarative Net Request (intercepts
`.user.js` URLs to trigger installation).

### Key Packages

`message/` (with mocks), `filesystem/` (WebDAV, cloud-drive providers, ZIP export; see
[`docs/cloud-sync.md`](docs/cloud-sync.md)), `cloudscript/`, `eslint/` (userscript lint config based on
`eslint-plugin-userscripts` and `defaultConfig` for the in-app editor), and `chrome-extension-mock/`. The project's own custom ESLint
rules live in root `eslint-rules/`, not `packages/eslint/`; both are documented in
[`docs/develop.md`](docs/develop.md#eslint-custom-rules).

## Completion checksum

Before claiming completion, use the applicable owner docs to check the final state. This is a handoff checklist, not
a second copy of their mechanics; when details matter, linked owners win. If a check cannot be completed, state the
limitation instead of claiming “verified” or “all fixed” without evidence.

- **Owners/facts.** Every task part follows its routed owner; changed documentation follows
  [`docs/DOC-MAINTENANCE.md`](docs/DOC-MAINTENANCE.md), including branch-aware fact checks against committed
  code, not memory or untracked files.
- **Evidence/verification.** Reproduction, tests, manual evidence, and the applicable rules in
  [`docs/references/develop-testing.md`](docs/references/develop-testing.md) and [`docs/verification.md`](docs/verification.md)
  support the claim, including any explicit exception; run required checks and report blockers or tooling limits.
- **Contract/scope.** The final diff matches the requested or verified behavior, contains no unrelated cleanup or
  compatibility layer, and preserves scope discipline.
- **Architecture.** Boundary-sensitive work was checked against [`docs/architecture.md`](docs/architecture.md) and
  the relevant deep-dive rather than inventing a parallel abstraction.
