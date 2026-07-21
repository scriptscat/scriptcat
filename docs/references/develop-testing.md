# Testing

> The **TDD/BDD-first principle** (write failing tests before implementation; fix code not tests) lives in
> [AGENTS.md § Engineering Principles](../../AGENTS.md#engineering-principles). This section is the mechanics.

This guide owns how contributors design, write, review, clean up, and run automated tests. A test is not useful
merely because it raises coverage: it must protect an observable contract, fail for a relevant regression, and
cost less to understand and maintain than the confidence it provides.

## Applicability gate — read this first

Not every section below applies to every change. Before designing or reviewing tests, check which of these the
**changed contract** actually touches. Skip a row silently if it doesn't apply — do not mark it "N/A" in a PR
description or commit message; that's ceremony, not evidence.

| Does the contract involve… | If yes, use |
|---|---|
| A threshold, count, size, or other boundary value | [Cover the behavior space](#cover-the-behavior-space-deliberately) — boundary cases |
| An invalid input, rejected dependency, or failure path | [Cover the behavior space](#cover-the-behavior-space-deliberately) — invalid/failure cases |
| State held across calls, async work, or lifecycle (mount/unmount, subscribe/dispose) | [Cover the behavior space](#cover-the-behavior-space-deliberately) — state transitions |
| Ordering, concurrency, or overlapping operations | [Cover the behavior space](#cover-the-behavior-space-deliberately) — ordering/concurrency |
| Legacy input forms, cross-browser behavior, untrusted input, or access scope | [Cover the behavior space](#cover-the-behavior-space-deliberately) — compatibility/security |
| A real browser API, extension process boundary, or multiple components wired together | [Boundary selection](#choosing-a-test-boundary) — integration/E2E row |
| A mechanical source-text convention (an import ban, a naming rule) | [Writing meaningful tests](#writing-meaningful-tests-what-to-clean-up--not-write) — file-content assertion |
| A test that looks low-value but sits outside the files/behavior this task changes | [Scope & cleanup boundary](#scope--cleanup-boundary) |

If none of these apply, a normal-case test plus the one or two boundaries the contract actually has is enough —
don't manufacture coverage for inapplicable categories.

## Designing a test before writing it

Start from behavior, not from the current implementation. Before writing assertions, state four things:

1. **Contract** — what callers or users can observe.
2. **Trigger** — the input, event, state, or sequence that exercises the contract.
3. **Outcome** — the returned value, rendered state, persisted data, emitted message, or external call that must
   result.
4. **Regression** — a plausible wrong implementation that this test would reject.

If the regression cannot be named, the proposed test is probably asserting an implementation detail or a
tautology. For a reported bug, first reproduce and capture the failure as required by
[verification.md](../verification.md); then make the smallest test that fails for that confirmed cause.

### Choosing a test boundary

Choose the narrowest boundary that still observes the real contract:

| Contract characteristic | Test boundary |
|---|---|
| Parsing, mapping, validation, selection, or state-transition logic | Pure unit test |
| Conditional UI, accessibility derivation, interaction, or variant-to-token mapping | Focused component render |
| Persistence, messages, retries, ordering, or lifecycle crossing an object boundary | Service or repository test |
| A real browser API, extension context, build entry, worker boundary, or several components wired together | Integration or E2E test — do not force this into a heavily mocked unit test to make it cheap |
| Permanent automation is genuinely infeasible or costs more than the regression risk warrants | [Throwaway verification](../verification.md) |

### Cover the behavior space deliberately

A behavior-changing test set normally starts with the **normal case** and then adds the boundaries and failure
paths that can change the outcome, gated by the [applicability check](#applicability-gate--read-this-first) above.
Do not stop after one happy-path example, and do not mechanically enumerate inputs that all execute the same
branch.

| Category | What to cover |
|---|---|
| Normal case | Representative valid input completes successfully and produces the intended observable result. |
| Boundary cases | Empty and single-item inputs; first/last item; exact size, time, or count limit; values just below and above a threshold; missing optional fields; duplicate items; Unicode or special paths only when the code branches on them. |
| Invalid/failure cases | Malformed input, rejected dependency, permission denial, timeout, cancellation, partial data, unavailable capability. Assert whether the contract rejects, reports, retries, rolls back, or preserves prior state. |
| State transitions | Before/after state, repeated calls, idempotency, cleanup, unsubscribe/dispose, whether stale async work can overwrite newer work. |
| Ordering/concurrency | Out-of-order completion, overlapping operations, deduplication, exactly-once effects — only when production code promises them. |
| Compatibility/security | Legacy accepted forms, cross-browser branches, untrusted URLs or paths, access scope, payload limits — only when part of the contract. |

Select cases by distinct equivalence classes and branches, not by sample count:

- If `value === limit`, `value < limit`, and `value > limit` produce three different outcomes, cover all three —
  that's three distinct branches, not three samples of one.
- If ten ordinary strings take the same path, one representative string is enough — that's one equivalence class,
  however many inputs it has.
- An empty array earns its own test only when emptiness changes behavior; it's redundant when it follows the exact
  same branch and assertion as a non-empty array.

For bug fixes, include a regression case matching the confirmed failure conditions closely enough that
reintroducing the cause makes it fail. Also keep a normal-case assertion when the fix could accidentally narrow
existing supported behavior.

### Assert outcomes, not incidental structure

Prefer assertions at the public boundary:

- Assert returned domain values, persisted records, visible state, accessibility attributes, messages, or the
  minimum necessary collaborator call.
- Assert a collaborator call when the call itself is the contract ("do not write before approval", "publish
  exactly once"); do not assert every internal call made along the way.
- Prefer exact assertions for structured output. Use broad `toContain`/truthiness assertions only when the
  omitted details are intentionally outside the contract.
- A test name must describe what the body actually triggers and observes. Use BDD-style `describe`/`it` titles —
  Chinese and English are both fine; avoid vague names such as `works`, `test1`, or a bug label without the
  behavior.
- One test may contain several related assertions for one behavior. Don't split every property into a separate
  setup-heavy test, and don't combine unrelated contracts into one scenario.

### Mocks and fixtures

Mock at external or expensive boundaries, not at every internal function. A useful mock makes the test
deterministic while preserving the production path under test.

- Prefer the repository's shared mocks — `@Packages/chrome-extension-mock` (Chrome APIs), `MockMessage` from
  `@Packages/message/mock_message`, `@Tests/mocks/pageStores.ts` (page stores) — over hand-built partial objects.
- Give a mock only the behavior needed by the scenario, but keep it structurally compatible with the narrow
  interface the subject consumes.
- Don't render a page with many live child sections and maintain unrelated client mocks just to assert a static
  button count. Test the category generator, focused section behavior, or a real integration boundary.
- Assert how our code transforms, routes, persists, or reacts to what a mock returns — never that the mock
  returned what it was configured to return (that's testing the mock, a no-value category below).
- Fixtures should be small enough that the meaningful difference is visible. Builders are useful when defaults
  are stable and scenarios override only relevant fields; avoid builders that hide the input responsible for a
  regression.

## When TDD doesn't apply

Two exceptions to the TDD/BDD-first principle, neither a blanket file/task category — write a failing test for everything else:

- **Genuinely behavior-preserving work** — refactors, type cleanup, dead-code removal, mechanical renames, or a config/dependency change confirmed not to alter behavior. Verify it instead of testing it.
- **Automated coverage is genuinely infeasible** — a pure visual/animation tweak, a bug reproducible only in a specific browser version or extension lifecycle stage, a copy/translation wording change, platform behavior that can't be automated reliably. Verify it manually and record the evidence instead of committing a pass-through or low-value test just to satisfy the rule — [`../verification.md`](../verification.md)'s scratch-extension workflow when the change needs the built extension or browser APIs, a simpler noted check otherwise.

## Writing meaningful tests (what to clean up / not write)

**Two distinct situations — don't conflate them.** A test that fails because *its own asserted contract* is wrong (a stale fixture, an assertion that was incorrect from the start, a contract that legitimately changed) — fix the test and say why. A test that never carried value regardless of pass/fail (see below) — clean it up independent of whether it's currently failing. Neither is license to weaken a valid regression test just to make CI pass.

A test earns its place by exercising **our own logic** and failing on a real regression. Don't write the "tests nothing" kinds below — and clean them up when you find them inside the [cleanup boundary](#scope--cleanup-boundary) (delete the test; don't touch business logic):

- **Tautology** — asserting a constant equals its own literal definition (source `const FOO = [Type.BAR]`, test `expect(FOO).toEqual([Type.BAR])`).
- **Genuine duplicate** — a whole file/block near-verbatim identical to another, differing only by irrelevant suffixes.
- **Redundant** — when the caller's tests already cover a callee fully, skip the callee's standalone unit test.
- **Pure pass-through render** — `render(<Comp prop={x} />)` that only asserts `x` shows up, with no branching / variant mapping / derived logic in the component.
- **Testing the mock or framework, not our code** — configuring a `vi.fn()` then asserting it returned what it was fed; asserting a third-party lib's or the JS language's own semantics.
- **Mislabeled** — the test name claims a behavior the body never triggers (e.g. claims to test abort but never calls abort). Worse than no test: it gives false confidence.
- **File-content assertion that belongs in a lint rule** — reading a source file and grepping its text for a token/string is a mechanical convention; express it as an ESLint rule or a structural-harness check (see [develop.md § ESLint custom rules](../develop.md#eslint-custom-rules)), and land the verified replacement guard **before** deleting the Vitest test — e.g. `tests/vitest.setup.ts`'s lightweight-setup constraint is a file-scoped `no-restricted-imports` in `eslint.config.mjs`.

Conversely, keep these — they look thin but carry real value:

- One branch of a conditional (`showLabel` default vs hidden, optional prop present vs absent, compact vs non-compact).
- Variant → design-token mapping (CVA `tone="success"` → `text-success-fg`) and accessibility derivation (`title` → `aria-label`).
- `instanceof` / `name` guards on custom `Error` subclasses, security-blocklist completeness, and similar regression guards.
- The **only** coverage of a component / sub-component — deleting it removes coverage, not noise.

### Gray-area calls

When a case doesn't obviously fall on one side, use these:

| Question | Call it this way |
|---|---|
| Observable contract vs. implementation detail? | If a caller/user could notice the value changing, it's the contract. If only the source structure changed (variable name, internal helper split), it's implementation detail — not worth its own test. |
| Distinct equivalence class vs. another sample? | Distinct only if a plausible bug would make this specific input produce a *different* outcome than the other cases already covered. Otherwise it's another sample of the same class. |
| Minimum necessary collaborator call vs. internal call assertion? | Assert a collaborator call only when *not* calling it (or calling it wrong) is itself the bug the test guards against. Otherwise assert the outcome, not the call. |
| Valuable thin test vs. pass-through test? | Thin but valuable if the component branches, maps, or derives something (see "keep" list above). Pass-through if it renders a prop with zero conditional logic in between. |

### Scope & cleanup boundary

`AGENTS.md`'s scope-discipline principle ("bug fix ≠ cleanup PR; touch only the files the task requires") governs
test cleanup exactly as it governs production code. This section operationalizes it for tests — it does not carve
out an exception.

| Situation | Action |
|---|---|
| A no-value test (per the categories above) sits in a file this task is already changing, or directly covers the behavior this task changes | Clean it up as part of this PR — it's in scope. |
| A no-value test sits in a file/behavior this task does *not* otherwise touch | Don't delete it in this PR. Record it as an out-of-scope finding (e.g. a follow-up issue or task) instead. |
| You notice a repository-wide pattern (the same no-value shape recurring across many unrelated files) | Don't bulk-clean it here. Open a separate issue/PR scoped to that pattern. |
| A cleanup you already started turns out to span many unrelated files | Split it into its own PR rather than growing the current one. |
| A replacement lint/structural guard is the direct substitute for a Vitest test you're removing *in this task* | In scope — landing the guard is part of "replace before delete" for this test, not a repo-wide lint rollout. |
| A replacement lint/structural guard would also need to cover other, currently-untested files | Out of scope for this task; note it as a follow-up. |

### Cleaning up tests safely

Tests are production dependencies: stale or meaningless tests should be removed, but a failing or slow test is not
automatically meaningless. Classify before editing:

| Symptom | Classification | Action |
|---|---|---|
| Asserted contract still valid; production violates it | Production regression | Fix the production code. |
| Requirements legitimately changed, or the assertion was wrong from the start | Wrong/obsolete contract | Update or replace the test; record the contract change. |
| Timing, leaked global state, nondeterministic ordering, or an uncontrolled dependency changes the result | Flaky test | Reproduce the flake and fix its cause; don't add retries or a large timeout without evidence. |
| Real browser/process/I/O work exceeds a pure-unit budget under CI contention | Misclassified integration work | Move it to the appropriate project or give that case a measured budget; don't delete the behavior or relax every test globally. |
| Matches a no-value category above; removing it loses no distinct regression detection | No-value test | Delete it (subject to the [scope boundary](#scope--cleanup-boundary) above) rather than preserving it for coverage numbers. |
| A file-content assertion protects a real convention, just in the wrong mechanism | Valuable constraint, wrong mechanism | Migrate per the file-content-assertion rule above — replacement guard first. |

Before deleting or consolidating a test, verify each against the source, one by one — judging in bulk from a scan
over-flags heavily, and many "looks meaningless" tests actually exercise a real branch:

1. Read the production path it claims to cover; don't judge from its name or line count.
2. Search for the same contract in nearby unit tests, caller tests, integration tests, E2E tests, lint rules, and
   structural harnesses.
3. Identify the mutation/regression the test rejects. If another test would fail for the same regression, show
   why; similar setup or output alone does not prove duplication.
4. Check whether the test is the only coverage of a conditional, error path, security boundary, lifecycle event,
   browser variant, or historical regression.
5. Delete or consolidate only the redundant signal, not assertions that cover distinct branches. Parameterize
   repeated setup when it makes the behavior matrix clearer.
6. Run the focused remaining tests, then the relevant full suite. For timing or concurrency issues, reproduce the
   CI combination — see [Vitest Performance Hygiene](#vitest-performance-hygiene).

## Author & reviewer checklists

Two short checklists, not one merged list — the author executes steps, the reviewer checks for evidence. Fill in
the bracketed fields with the actual value; a checked box with no field filled in is not evidence.

### Author

- [ ] `Regression rejected:` — the plausible broken implementation this test would catch (not "missing mocks" or
      unrelated setup).
- [ ] `Distinct branch:` — for each case beyond the normal one, the outcome it changes vs. the cases already
      covered.
- [ ] `Selected boundary because:` — why this test boundary (pure unit / component / service / integration /
      E2E / throwaway), per [Choosing a test boundary](#choosing-a-test-boundary).
- [ ] `Existing coverage searched:` — where (nearby unit/caller/integration/E2E/lint) you looked before adding or
      deleting a test.
- [ ] `Replacement guard:` — if a test was removed per the file-content-assertion rule, the lint/structural rule
      that now covers it, or "n/a".
- [ ] `Out-of-scope findings recorded:` — any no-value test noticed outside this task's boundary, or "none".
- [ ] `Focused/full suite actually run:` — the literal command(s) run, not "tests pass".

### Reviewer

- [ ] The named regression is real and the test would actually fail for it — not merely missing setup.
- [ ] Each new case is a distinct branch/equivalence class, not another sample of one already covered.
- [ ] The test boundary matches [Choosing a test boundary](#choosing-a-test-boundary); nothing browser/process-level
      is forced into a mocked unit test, and nothing simple got a full integration/E2E render.
- [ ] Any deleted test is in scope per [Scope & cleanup boundary](#scope--cleanup-boundary), and — if it protected
      a mechanical convention — the replacement guard exists and is verified, not just proposed.
- [ ] Assertions observe the contract at the public boundary, and the title matches the trigger and outcome.
- [ ] Commands in "focused/full suite actually run" were actually run (spot-check by re-running one).

## Running tests

Vitest + happy-dom. Per-test budgets live in `vitest.config.ts` per project: non-UI projects (`fast`,
`isolated`) use 340ms; the `ui` project (`src/pages/**/*.test.{ts,tsx}` — React renders, including
`renderHook` tests in `.ts` files) uses 850ms because a render + interaction case genuinely costs 100–200ms
solo under coverage and worker parallelism multiplies that (fake-timer countdown cases have been observed at
~630ms under full local load). Don't pass `--test-timeout` on the CLI — it would override every project's
budget at once. Chrome APIs are mocked via
`@Packages/chrome-extension-mock` (`tests/vitest.setup.ts`). `MockMessage` is available for message-system tests.
`happy-dom` is patched via `patches/` (see `pnpm-workspace.yaml` `patchedDependencies`) to build its
invalid-selector `DOMException` lazily — the upstream eager construction captures a deep stack on every
`matches()`/`querySelector()` call, which is measurably slower at TSX-suite scale. No specific percentage is
tracked here since it isn't tied to a reproducible command/environment; if you need a number, measure
before/after this patch in the same environment using the JSON-report method below rather than trusting a
historical figure.

- Co-locate `*.test.ts`/`*.test.tsx` next to source (or place in `tests`).
- Use `describe.concurrent()` / `it.concurrent()` where independent.
- Single file: `pnpm test -- --run path/to/file.test.ts`.
- Playwright tests are `*.spec.ts` files in `e2e`; they run with one worker and retain failure artifacts. Run targeted tests while iterating, then run `pnpm run lint` plus the relevant full suite before a PR.

## Vitest Performance Hygiene

- Keep `tests/vitest.setup.ts` lightweight. Shared setup should only install global browser/chrome mocks; heavier
  feature helpers belong in opt-in test utilities. Enforced by a file-scoped `no-restricted-imports` in
  `eslint.config.mjs`.
- For files that use one fixed UI language, prefer `initTestLanguage()` from `tests/initTestLanguage.ts` in
  `beforeAll` over repeated `initLanguage()` calls inside every test. Tests that intentionally switch languages
  should keep explicit language setup.
- Prefer shared DOM helpers such as `mockMatchMedia()` from `tests/mockMatchMedia.ts` over copying local browser
  stubs into every page test.
- Query only as broadly as the behavior requires:
  - `screen` is appropriate for document-level output and Portal content. When the target is already known, use
    `within(container)` / `within(region)` so the query does not rescan the whole rendered document.
  - In a large integration render, prefer an existing `data-testid` for control identity, `getByLabelText` for an
    ARIA-labelled control, or visible text followed by `closest("button")` / `closest("a")` for interaction. Do not
    pay for a full accessibility-tree `*ByRole` scan when the role itself is not the behavior under test.
  - Accessibility coverage must not be weakened for speed. When role/ARIA derivation is the contract, assert the
    resulting `role` / `aria-*` attribute directly (or use the semantic query in a small, focused component test).
- Choose the narrowest async primitive that matches the production boundary:
  - If an event handler calls the observed mock synchronously, assert immediately; `waitFor` only adds polling.
  - For an element that appears after an effect or request, use `findBy*` instead of wrapping `screen.getBy*` in
    `waitFor`.
  - When a resolved Promise drives React state, locate the control first, trigger it inside one
    `await act(async () => ...)`, then assert directly. Do not put a `findBy*` query inside `act`.
  - Keep `waitFor` for genuinely open-ended async boundaries (deferred effects, externally controlled Promises,
    Portal mounting). Keep its callback cheap and scoped, and combine related assertions into one polling loop.
- Avoid real sleeps in unit tests. Use fake timers for timer behavior; a short real delay is acceptable only when
  the delay itself is the regression guard (for example, proving a rejected load does not start a runaway loop).
- Match test concurrency to the workload:
  - Use `describe.concurrent()` / `it.concurrent()` only when cases can make useful progress without blocking the
    same worker. Synchronous CPU-heavy work such as parsing, encoding, compression, and large fixture loops still
    competes for one JavaScript event loop; under coverage or full-shard load, contention can make otherwise-fast
    cases exceed their wall-clock timeout.
  - Keep lightweight independent cases concurrent, but mark CPU-heavy cases or fixture batches with
    `it.sequential()` / `describe.sequential()`. Preserve their assertions and inputs; do not trade coverage for
    speed or raise the timeout to hide worker contention.
  - If a case still sits near the budget in a **solo** coverage run (single test, no concurrency, no worker
    contention — genuine CPU cost, e.g. chardet's 32 KB sample analysis is roughly 10× slower under V8 coverage
    instrumentation), give that one case an explicit per-test `{ timeout }` with a comment citing the measured
    solo cost. The global timeout stays tight for everything else.
  - A focused file run is only the first check. Re-run the exact CI combination of timeout, coverage, reporter, and
    shard that exposed the failure, because an isolated run does not reproduce cross-file worker pressure.
- Treat performance measurements as evidence, not a one-run verdict. Run the affected file first, then the full
  TSX suite; concurrent full-suite timings are noisy, so repeat suspicious runs and compare the same command,
  reporter, files, and environment. Never raise the configured timeout to hide a slow query or wait.
- To spot setup/import regressions without running the full suite, run one small file and read Vitest's timing
  breakdown, for example:

```bash
pnpm exec vitest run --no-coverage --reporter=verbose src/pkg/utils/url-utils.test.ts
```

To inventory slow TSX tests without relying on console ordering, write Vitest's JSON report outside the repository
and sort individual assertions by duration:

```bash
rg --files -g '*.test.tsx' | xargs pnpm exec vitest run --no-coverage \
  --reporter=json --outputFile=/tmp/scriptcat-tsx-tests.json
jq -r '.testResults[] | .name as $file | .assertionResults[] | [.duration, $file, .fullName] | @tsv' \
  /tmp/scriptcat-tsx-tests.json | sort -nr | head -20
```

> To **verify a change works end-to-end without growing the suite** — drive the real built extension with a
> throwaway scratch script — see [`verification.md`](../verification.md). That is lightweight verification, not
> the committed test suite owned by this section.
