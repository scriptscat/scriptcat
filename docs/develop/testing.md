# Testing

> The **TDD/BDD-first principle** (write failing tests before implementation; fix code not tests) lives in
> [`AGENTS.md`](../../AGENTS.md) → *Engineering Principles*. This section is the mechanics.

Vitest + happy-dom. Per-test budgets live in `vitest.config.ts` per project: non-UI projects (`fast`,
`isolated`) use 340ms; the `ui` project (`src/pages/**/*.test.{ts,tsx}` — React renders, including
`renderHook` tests in `.ts` files) uses 850ms because a render + interaction case genuinely costs 100–200ms
solo under coverage and worker parallelism multiplies that (fake-timer countdown cases have been observed at
~630ms under full local load). Don't pass `--test-timeout` on the CLI — it would override every project's
budget at once. Chrome APIs mocked via
`@Packages/chrome-extension-mock` (`tests/vitest.setup.ts`). `MockMessage` available for message-system tests.
`happy-dom` is patched via `patches/` (see `pnpm-workspace.yaml` `patchedDependencies`) to build its
invalid-selector `DOMException` lazily — the upstream eager construction captures a deep stack on every
`matches()`/`querySelector()` call and cost ~15% of TSX suite time.

- Write failing tests **before** implementation; co-locate `*.test.ts`/`*.test.tsx` next to source (or place in `tests`).
- BDD-style Chinese `describe`/`it` titles. Use `describe.concurrent()` / `it.concurrent()` where independent.
- Single file: `pnpm test -- --run path/to/file.test.ts`.
- Playwright tests are `*.spec.ts` files in `e2e`; they run with one worker and retain failure artifacts. Run targeted tests while iterating, then run `pnpm run lint` plus the relevant full suite before a PR.

### Writing meaningful tests (what to clean up / not write)

A test earns its place by exercising **our own logic** and failing on a real regression. Don't write the "tests nothing" kinds below — and clean them up when you find them (delete the test; don't touch business logic):

- **Tautology** — asserting a constant equals its own literal definition (source `const FOO = [Type.BAR]`, test `expect(FOO).toEqual([Type.BAR])`).
- **Genuine duplicate** — a whole file/block near-verbatim identical to another, differing only by irrelevant suffixes.
- **Redundant** — when the caller's tests already cover a callee fully, skip the callee's standalone unit test.
- **Pure pass-through render** — `render(<Comp prop={x} />)` that only asserts `x` shows up, with no branching / variant mapping / derived logic in the component.
- **Testing the mock or framework, not our code** — configuring a `vi.fn()` then asserting it returned what it was fed; asserting a third-party lib's or the JS language's own semantics.
- **Mislabeled** — the test name claims a behavior the body never triggers (e.g. claims to test abort but never calls abort). Worse than no test: it gives false confidence.
- **File-content assertion that belongs in a lint rule** — reading a source file and grepping its text for a token/string is a mechanical convention; express it as an ESLint rule, not a unit test.

Conversely, keep these — they look thin but carry real value:

- One branch of a conditional (`showLabel` default vs hidden, optional prop present vs absent, compact vs non-compact).
- Variant → design-token mapping (CVA `tone="success"` → `text-success-fg`) and accessibility derivation (`title` → `aria-label`).
- `instanceof` / `name` guards on custom `Error` subclasses, security-blocklist completeness, and similar regression guards.
- The **only** coverage of a component / sub-component — deleting it removes coverage, not noise.

> **Verify each against the source before deleting.** Many "looks meaningless" tests actually exercise a real branch; judging in bulk from a scan over-flags heavily. Confirm the behavior genuinely exists / is covered elsewhere before removing anything.

### Vitest Performance Hygiene

- Keep `tests/vitest.setup.ts` lightweight. Shared setup should only install global browser/chrome mocks; heavier
  feature helpers belong in opt-in test utilities.
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
> throwaway scratch script — see [`VERIFICATION.md`](../verification/README.md). That is lightweight verification, not
> the committed test suite owned by this section.
