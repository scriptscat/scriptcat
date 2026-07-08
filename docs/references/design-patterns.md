# Layout, motion, state & accessibility

## Layout & responsive

### Shell

Major pages share one structure: **sticky TopBar (no scroll) + single scroll container (`.scrollbar-custom`) + sticky ActionBar (no scroll)**. Only the middle layer scrolls; head and foot stay put.

### Single mobile breakpoint

[`src/pages/components/use-is-mobile.ts`](../../src/pages/components/use-is-mobile.ts) is the **only** breakpoint source: `MOBILE_BREAKPOINT = 768`; a viewport `< 768px` is mobile.

```tsx
import { useIsMobile } from "@App/pages/components/use-is-mobile";

function Page() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileShell /> : <DesktopShell />;
}
```

### Desktop ↔ mobile transforms

| Desktop (≥768px) | Mobile (<768px) |
| --- | --- |
| Left nav rail | Bottom tab bar + drawer (`Sheet`) — tabs for high-frequency, drawer for everything else |
| Multi-column table | Single-column cards |
| Side-by-side panels | Vertical stack; detail/code collapsed by default |
| Inline dropdowns | Drawer / Accordion overlays |
| Categories in a left rail | Categories in a top horizontal-scroll chip bar |

The bottom bar is [`BottomTabBar.tsx`](../../src/pages/options/layout/BottomTabBar.tsx). **Mobile re-shells, it doesn't shrink** — see Principle 4.

### Scroll-spy (long settings pages)

Long pages (settings / tools) use scroll-spy: scrolling the content highlights the current category, and clicking a category smooth-scrolls to its section. See [`SettingsLayout.tsx`](../../src/pages/options/layout/SettingsLayout.tsx) + [`useScrollSpy.ts`](../../src/pages/options/hooks/useScrollSpy.ts). On desktop the categories sit in a left rail; on mobile they become a top horizontal chip bar (the active chip `scrollIntoView`s to center).

### Layering (z-index)

Stacking only works if everyone agrees on the order. Use **this fixed ladder** — don't invent magic numbers (`z-[1000]` / `z-[200]` have leaked in; they're bugs waiting to happen). Pick the lowest layer that works:

| Layer | Class | What lives here |
| --- | --- | --- |
| Base content | *(default)* / `z-0` | Normal page flow |
| Sticky chrome | `z-10` | Sticky TopBar / ActionBar / table header / `BottomTabBar` — pinned, but *below* anything floating |
| Floating layers | `z-50` | `Dialog`, `Sheet`, `DropdownMenu`, `Popover`, `Select`, `Tooltip` — this is the shadcn/Radix default; **leave it**, don't bump it |
| Toast | *(owned by `sonner`)* | The global `Toaster` portals above everything; never hand-roll a layer above it |

- **Same tier ties break by DOM order**, not by a bespoke number. If two floating layers fight, fix the nesting/portal, don't escalate to `z-[999]`.
- **A new "always on top" need is a smell** — it usually means the element should be a real floating primitive (Dialog/Popover) that already portals correctly, not a high-`z` `div`.

### Long lists

Script list and Logger can hold thousands of rows. Keep large lists responsive: **page or windowed-render** rather than mounting every row, and never block first paint on the full set — show the skeleton/shell ([state patterns](#state-patterns)) while the list streams in. Don't introduce a virtualization lib unprompted; if a list is bounded (settings, permissions) plain rendering is fine.

### Text expansion (i18n)

Copy is translated into 8 locales and German/Russian run ~30% longer than English. Layouts must **flex or truncate, never clip**: let labels wrap or `truncate` with a `title`/tooltip, give buttons/badges `min-w` room instead of fixed widths, and don't pin a control's width to its English string. Verify a long-locale on the tightest screens (mobile cards, the ActionBar). RTL is **not** a target for the current locale set.

---

## Motion

**Sources:** [`src/index.css`](../../src/index.css) (custom keyframes/utilities) + `tw-animate-css` (the `@import` provides `animate-in/out`, `fade-*`, `zoom-*`, `slide-*`, `accordion-*`, …) + Radix `data-state`. **No Framer Motion** — all motion is CSS.

### How to add motion that stays friendly

- **Fast and light:** enter/leave in `150–250ms`, `ease-out`; the built-in collapse/progress animations use `200ms ease-out`.
- **Hover/focus via CSS pseudo-classes, not React state** (`hover:bg-primary-background/90`, `focus-visible:ring-ring/50`) — a `DEVELOP.md` rule.
- **Enter/leave via Radix `data-state`** — don't hand-roll show/hide with `setTimeout`.
- **Prefer `transition-colors` over `transition-all`:** animate only what should move, avoiding layout thrash and wasted work.
- **Reuse existing utilities;** don't inline `@keyframes` in a component. New animation → add an `@utility` in `src/index.css` so it's globally reusable.
- **Large looping animations** (e.g. the indeterminate bar) should animate `transform` (already `translateX`) for performance.
- **Respect `prefers-reduced-motion`.** A global `@media (prefers-reduced-motion: reduce)` block in [`src/index.css`](../../src/index.css) collapses every animation/transition to near-zero for users who ask for less motion, so reusing the shared CSS utilities is reduced-motion-safe for free. Don't route around it with JS-driven tweens (`setTimeout` / `requestAnimationFrame`) the reset can't reach; gate any long or looping *decorative* animation on the preference yourself.

### Available animations

| utility / pattern | Source | Use |
| --- | --- | --- |
| `animate-collapsible-down` / `-up` | `index.css` | Radix Collapsible expand/collapse (uses `--radix-collapsible-content-height`) |
| `animate-expand-bar` / `animate-collapse-bar` | `index.css` | Height expand/collapse of bars/rows (incl. border and opacity) |
| `animate-indeterminate-bar` | `index.css` | Indeterminate progress bar (`translateX` loop, `1.1s`) |
| `data-[state=open]:animate-in data-[state=closed]:animate-out` + `fade-*` / `zoom-95` / `slide-*` | `tw-animate-css` | Dialog / Dropdown / Sheet enter/leave (Radix state driven) |
| `animate-spin` | Tailwind built-in | Spinner rotation — the `Loader2` / `RefreshCw` icons used for inline, button, and full-page loading (`animate-spin`, usually `text-primary`) |
| `animate-pulse` | Tailwind built-in | Skeleton placeholder pulse |
| `transition-colors` / `transition-transform` / `duration-200` | Tailwind | hover/focus color transitions, icon rotation |

```tsx
// Floating layer enter/leave (Radix data-state + tw-animate-css)
<div className="data-[state=open]:animate-in data-[state=open]:fade-in-0
                data-[state=closed]:animate-out data-[state=closed]:fade-out-0
                data-[state=open]:zoom-in-95 duration-200">…</div>

// Indeterminate progress bar
<div className="h-0.5 w-full overflow-hidden bg-muted">
  <div className="h-full w-1/3 bg-primary animate-indeterminate-bar" />
</div>
```

---

## State patterns

Every async flow covers the states below, presented consistently:

| State | Standard presentation |
| --- | --- |
| **Loading** | A skeleton that preserves the layout, a centered spinner, or a thin top indeterminate bar — pick by *where* the wait happens (see **Loading patterns** below) |
| **Empty** | Centered `muted` icon (e.g. `lucide` `PackageOpen`/`Inbox`) + title + explanation + primary CTA |
| **Error** | Centered red icon + an "X failed" title + a monospace (`font-mono`) box with the raw error + retry/close |
| **Success** | Centered green icon + title + summary stats + next-step CTA; for transient feedback use `notify.success` |
| **In-progress** | Top progress bar + per-row status icons (✓ green done / ○ brand in-progress / ⏱ `muted` pending / ✗ `muted` skipped) + readable copy ("Importing… 2/5, keep this page open") |

These states have canonical shared components — reuse them rather than re-implementing: `StateScreen` (full-area loading/empty/error/success), `EmptyState` / `LoadingState` (inline), `Skeleton`, and `Progress` (`top` / `indeterminate`); see [primitives & shared composites](./design-components.md#primitives--shared-composites).

### Loading patterns

A loading state is not one thing — and a centered spinner is the *last* resort, not the default. The guiding rule is **keep the page's shape stable**: show a placeholder where the content will land instead of collapsing the layout to a spinner and snapping it back when data arrives. Match the indicator to where the wait happens:

| Where the wait is | Indicator | Reference in code |
| --- | --- | --- |
| **First load of a whole page / screen** (no shape yet) | Centered `Loader2` (`size-12 animate-spin text-primary`) + title/desc; pair with a determinate bar (`transition-[width]`) when bytes/percent are known, else an indeterminate fill | `InstallLoading` ([`install/components/InstallStates.tsx`](../../src/pages/install/components/InstallStates.tsx)) |
| **Reloading content that already has a shape** (table / list) | A **skeleton** that keeps the real header + placeholder rows (`animate-pulse rounded bg-muted`) — not a centered spinner — so the layout doesn't collapse and reflow | `SkeletonTable` / `SkeletonBar` ([`batchupdate/components.tsx`](../../src/pages/batchupdate/components.tsx)) |
| **Background refresh / check while content stays visible** | A thin top `animate-indeterminate-bar` (`h-0.5`, `role="progressbar"` + `aria-label`) pinned under the TopBar, not scrolling with content | `TopProgressBar` ([`batchupdate/components.tsx`](../../src/pages/batchupdate/components.tsx)) |
| **A single action** (button, connection test, fetch) | Disable the control and show an inline `Loader2 size-4 animate-spin`; if the action already has an icon, spin that icon instead (`RefreshCw className={cn(checking && "animate-spin")}`) | `McpFormDialog` test button, `ScriptList` / Agent Skills refresh |

Practical rules:

- **Never freeze and never wait silently.** A region that is loading must show a skeleton, spinner, or bar — never a blank or stale frame with no signal (Constraint 8).
- **Don't fake determinism.** Use the determinate progress bar only when the percent/bytes are actually known; otherwise use an indeterminate fill or a skeleton.
- **One indicator per wait.** Don't stack a full-page spinner over content that is already skeletoned, or two bars for one fetch.
- **The spinner is always `Loader2` + `animate-spin`** (`text-primary` when it should read as active), sized to context — `size-3.5`/`size-4` inline, `size-12` full-page ([motion](#motion)).

The rule: **no silent operations** — after any action the user can see success / failure / in-progress.

### Forms & validation

Forms are plain `useState` + controlled components ([components](./design-components.md#primitives--shared-composites) — no form library). Keep their feedback consistent:

- **Validate late, forgive early.** Don't show errors while a field is still being filled. Validate on **blur** and on **submit**; once a field is showing an error, switch it to **live** revalidation so the message clears the instant it's fixed.
- **Error message sits with the field**, not in a far-off banner: a short `text-destructive text-xs` line directly under the input, and mark the control (`aria-invalid`, `border-destructive`). For *form-level* failures (the save request itself failed) raise a `notify` error toast ([state patterns](#state-patterns)) — there is no `Alert` primitive; if an inline form-level banner is unavoidable, build it ad-hoc with `border-destructive` / `text-destructive`.
- **Required vs optional:** mark the rarer one. If most fields are required, tag the optional ones "(optional)" rather than starring everything.
- **Submit button:** keep it enabled and validate on click (a disabled button can't tell the user *why*) — unless submission is genuinely impossible (nothing entered yet). While the request is in flight, disable + inline `Loader2` ([loading patterns](#loading-patterns)).
- **Don't lose input on failure.** A failed save keeps every field as-is; never clear the form on error.

### Writing & microcopy

Consistent words are part of a consistent UI.

- **Sentence case** for everything — buttons, titles, labels, menu items ("Import data", not "Import Data"). Product names keep their own casing.
- **Buttons are verbs** naming the action ("Install", "Save changes", "Delete"), not "OK"/"Submit". The in-flight label restates it as progress ("Installing…", "Saving…").
- **Errors are specific and actionable:** what failed + why + what to do ("Update failed: network error — check your connection and retry"), not "Something went wrong". Put raw error detail in the `font-mono` box ([state patterns](#state-patterns)), not the headline.
- **Don't blame the user, don't over-apologize.** State the fact and the next step.

### Interactive states

[Core Constraints](../design.md#core-constraints-non-negotiable) covers hover/focus (CSS pseudo-classes, never React state). For completeness every interactive control also needs:

- **Disabled:** the shadcn primitives already apply `disabled:opacity-50 disabled:pointer-events-none` — reuse them; don't hand-roll a greyed-out look. A disabled control still needs a reason nearby (helper text/tooltip) if it's non-obvious.
- **Active / pressed:** rely on the primitive's built-in `active:`; add `active:` utilities only for custom controls.
- **Selected / current:** persistent selection (active nav item, chosen tab, picked row) uses `accent` / `sidebar-accent` fills or the `primary` text/underline — a *state*, distinct from transient `hover:accent`. Pair color with a non-color cue (icon, weight, indicator bar) so it isn't color-only ([accessibility](#accessibility)).

---

## Accessibility

Friendly UX includes users on keyboards, screen readers, low vision, and motion sensitivity. These are requirements, not extras — verify alongside the both-themes check.

### Contrast

- **Target WCAG AA:** ≥ 4.5:1 for normal text, ≥ 3:1 for large text (≥ 18.66px bold / 24px) and for meaningful UI/icon edges. The tokens are tuned to this — `foreground`, `fg-secondary`, and the `*-fg` badge pairs pass comfortably.
- **`muted-foreground` is the edge case.** It's AA-tuned (light `#767676` ≈ 4.5:1 on `card`/`background`) but only *just* — keep it for secondary/large/descriptive text, and use `foreground` or `fg-secondary` for anything dense or critical. On a `muted`/`secondary` fill its contrast drops further, so don't stack small `muted-foreground` text on a `muted` background.
- **Never encode meaning in color alone** (Principle 3 is about *adding* meaning, not replacing the label). Pair every status color with text/icon/shape — a red dot also says "Error", an enabled row also shows a label, a selected item also has a non-color cue.

### Focus visibility

The base layer in [`src/index.css`](../../src/index.css) intentionally **removes the native `outline`** on `button` / `a` / `[role="button"]` and relies on shadcn's `focus-visible:ring-ring/50` box-shadow ring instead (so programmatic refocus after a Radix layer closes doesn't flash an outline). The cost: **any custom interactive element you build has no visible keyboard focus unless you add the ring yourself.** So:

- Every custom clickable (a `div`/`span` with `onClick`, a bespoke card action) must add `focus-visible:ring-2 focus-visible:ring-ring/50` (and be reachable — real `<button>`/`<a>`, or `tabIndex={0}` + key handlers).
- Don't re-disable focus styling to "clean up" a layout; the ring is the only focus signal there is.

### Keyboard & screen readers

- **Everything actionable is reachable and operable by keyboard** — prefer native `<button>`/`<a>`/`<input>`; the Radix primitives (Dialog, Sheet, DropdownMenu, Tabs…) already ship focus trap, arrow-key nav, Esc, and return-focus — that's a reason to reuse them over hand-rolled overlays ([components](./design-components.md)).
- **Icon-only controls need an accessible name:** `aria-label` on every icon `Button` (an icon alone is invisible to a screen reader).
- **Announce async state:** loading/empty/error/progress regions carry `role="status"` / `role="progressbar"` + `aria-label` (the `TopProgressBar` already does) so non-visual users hear the same "no silent operations" guarantee ([state patterns](#state-patterns)).
- **Decorative icons** (next to a text label) are `aria-hidden` so they aren't double-announced.

### Touch targets

The shared `Button` tops out at `h-9` (36px) and the compact sizes (`xs`/`icon-xs` = 24px) are **below the ~44px comfortable-touch minimum**. On the mobile shell, primary tap actions should use `default`/`icon` (or larger) and avoid `xs`. When a control must stay visually small, **expand the hit area** (extra padding, or a `::before` overlay) rather than shrinking the tap zone — and keep tappable items spaced so neighbors aren't mis-hit.

### Reduced motion

A global `@media (prefers-reduced-motion: reduce)` reset ([motion](#motion)) honors the system preference for all shared CSS animations/transitions. Keep new motion on the shared utilities so it inherits that; don't bypass it with JS tweens.

### Accessibility checklist

- [ ] Text meets AA contrast on **both** themes; meaning never carried by color alone.
- [ ] Every custom interactive element is keyboard-reachable and shows a visible `focus-visible` ring.
- [ ] Icon-only buttons have `aria-label`; decorative icons are `aria-hidden`.
- [ ] Async/loading/error regions expose `role` + `aria-label`.
- [ ] Mobile tap targets ≥ ~44px (or an expanded hit area).
- [ ] Motion still works (and calms down) under `prefers-reduced-motion`.
