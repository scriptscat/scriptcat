# ScriptCat Design System

> **A reuse-oriented design reference.** It consolidates the visual language that lives in `src/index.css` and the shadcn component layer into one place you can copy from: **color tokens (full light/dark values), the theming mechanism, the component palette, layout & responsive patterns, motion, state patterns, and an end-to-end new-page recipe.** Read this before building any new page, dialog, or block so it stays visually and behaviorally consistent with the rest of the app.

> **Stack in one line:** React 19 + shadcn/ui (Radix primitives, `new-york` style) + Tailwind CSS v4 + React Router. Colors and motion are defined in the `@theme inline` block of `src/index.css`. **There is no `tailwind.config.js`** (Tailwind v4); PostCSS runs through `@tailwindcss/postcss` (`postcss.config.mjs`); **class names have no prefix** (`bg-background`, not `tw-bg-background`).

---

## What this doc owns

| Owned here | Owned elsewhere |
| --- | --- |
| Color-token values, semantics, usage → [`tokens.md`](./annexes/design-tokens.md) | The hard rules that mandate them (no hard-coded colors, hover via pseudo-classes, `cn()` / CVA / `lucide`) → [`DEVELOP.md` UI section](./develop.md) |
| Theming mechanism, `dark:` usage | Commands, structure, coding style, testing, i18n, commit/PR → [`DEVELOP.md`](./develop.md) |
| Component palette, variants, selection guidance → [`components.md`](./annexes/design-components.md) | Process model, message passing, service layers, internals → [`ARCHITECTURE.md`](./architecture.md) |
| Layout shell, responsive patterns, **layering (z-index)**, motion, state patterns, **accessibility** → [`patterns.md`](./annexes/design-patterns.md); **elevation (shadows)** → [`tokens.md`](./annexes/design-tokens.md#elevation-shadows); page recipe (this doc) | — |

This doc restates the `DEVELOP.md` hard rules only where needed, then links back — it does not duplicate them.

---

## Core Constraints (non-negotiable)

Every UI change must satisfy all of these. They are the bar for "friendly, consistent UI/UX" in this codebase.

- **Use tokens, not literal colors — one value, one place.** Never write a hex (`#1296db`), an `rgb()`, or a palette class (`text-blue-500`). Always use a semantic token — `bg-background`, `text-foreground`, `border-border`, `text-primary`, `bg-primary-background`, `text-muted-foreground`, … ([tokens](./annexes/design-tokens.md)). All color values live in exactly one place — the token definitions in `src/index.css` — so the palette stays unified and a single edit re-skins everything. One semantic concept maps to **one** token: before adding a color, check [tokens](./annexes/design-tokens.md) for an existing token and reuse it; don't introduce a near-duplicate (a second slightly-different gray or blue). Only add a new token when the concept is genuinely new — with both light and dark values — and document it in [tokens](./annexes/design-tokens.md).
- **Both themes, always.** Light and dark are first-class. Because every color comes from a token that has a `:root` and a `.dark` value, using tokens makes a component theme-correct for free. Verify on real light *and* dark before considering anything done ([theming](#theming)).
- **Design for mobile too.** The UI is responsive around a single `768px` breakpoint (`useIsMobile`). Mobile is **a different shell, not a shrunk desktop** — side nav becomes bottom tabs + drawer, tables become cards, rows stack, details/code collapse, actions move into a sticky bar ([layout & responsive](./annexes/design-patterns.md#layout--responsive)). A feature isn't finished until it works on a narrow viewport.
- **No inline `style={{}}` for what Tailwind can express.** Compose utility classes via `cn()` (`clsx` + `tailwind-merge`); build variants with `class-variance-authority` (CVA). Inline styles only for genuinely dynamic values (e.g. a computed width).
- **Hover/focus are CSS, not state.** Express interactive visuals with pseudo-classes (`hover:bg-primary-background/90`, `focus-visible:ring-ring/50`). React state is for data/logic, not styling.
- **Reuse components before building new ones.** Default to the shadcn primitives in `src/pages/components/ui/` ([components](./annexes/design-components.md)); icons come from `lucide-react` only — don't hand-roll a control that already exists. Beyond primitives, search the existing pages for a composed block (card row, identity header, permission card, state screen…) that already does what you need and reuse it. When the same block appears in two or more places, extract one shared component instead of copy-pasting — keep one implementation per concept so behavior and styling stay consistent and a fix lands everywhere at once.
- **Keep motion restrained.** Enter/leave in `150–250ms`, `ease-out`; reuse the existing `@utility` animations rather than inlining `@keyframes`; prefer `transition-colors` over `transition-all` ([motion](./annexes/design-patterns.md#motion)).
- **No silent operations.** Every async flow surfaces loading / empty / error / success (and progress for long-running work). The user must always know whether their action worked ([state patterns](./annexes/design-patterns.md#state-patterns)).
- **Don't introduce new colors or fonts ad hoc.** New color → add a token in `src/index.css` (with both light and dark values) and document it here. New font → add a `--font-*` token; don't reference an unconfigured family.

---

## Design Principles

The "why" behind the constraints — apply these when shaping a screen.

1. **Trust-first, clear hierarchy.** Let the most important information win the visual weight. For decision screens (install / permission / import), order content as **identity → permissions → code**, with code demoted to a height-capped scroll region.
2. **System state is always visible.** No silent work. Each async flow shows **progress (a top indeterminate bar) → process (skeletons / per-row status) → result (toast or result screen)**.
3. **Color is semantic, never decorative.** Blue = interactive / primary; green = safe / enabled / success; amber = caution / sensitive; red = danger / error / blocked. Color carries meaning.
4. **Mobile is a different shell.** Don't scale the desktop down — re-shell it: bottom tabs + drawer instead of a side rail, cards instead of tables, vertical stacks, collapsed detail.
5. **Consistent shell.** Major pages share one skeleton: **sticky TopBar + single scroll container + sticky ActionBar**. Swap the content, not the frame.
6. **High cohesion, low coupling.** Each UI unit has a single purpose, a clear interface, and is understandable and testable on its own. A file growing large is usually a signal to split it.

---

## Theming

**Mechanism:** the theme switches by adding/removing `.dark` on `document.documentElement` (`@custom-variant dark (&:is(.dark *))` is what makes the `dark:` variant work). Every token is defined under both `:root` and `.dark`, so toggling the class re-skins the whole app — no per-component color changes needed.

**Provider:** [`src/pages/components/theme-provider.tsx`](../src/pages/components/theme-provider.tsx)

```tsx
import { useTheme } from "@App/pages/components/theme-provider";

const { theme, resolvedTheme, setTheme } = useTheme();
// theme: "light" | "dark" | "auto"  (user choice, persisted to localStorage key "lightMode")
// resolvedTheme: "light" | "dark"   (in "auto", resolved live from prefers-color-scheme)
setTheme("auto"); // "auto" follows the system theme and updates on change
```

**Flash prevention:** [`src/pages/common.ts`](../src/pages/common.ts) reads `lightMode` and sets `.dark` *before* React mounts, so non-auto users don't see a wrong-theme frame on refresh. New page entry points should reuse the existing `main.tsx` pattern rather than rolling their own theme logic.

**Correct usage (do / don't):**

```tsx
// ✅ Tokens — adapt to light/dark automatically
<div className="bg-card text-foreground border-border">…</div>
<button className="bg-primary-background text-primary-foreground hover:bg-primary-background/90">…</button>

// ✅ dark: variant only for a dark-specific tweak
<div className="bg-input/30 dark:bg-input/50">…</div>

// ❌ Hard-coded colors — break in dark and violate the DEVELOP.md rule
<div className="bg-white text-[#1a1a1a] border-[#e5e5e5]">…</div>
```

**Every UI change must hold up in both themes.** Verify on real light and dark — don't ship after checking only one.

---

## Typography & Radius

### Fonts

**System-font-only, zero webfonts.** A browser extension must work offline, must not phone home to a font CDN (privacy + CSP), and pays for every byte it ships — so the type system is **the platform's own fonts**, declared as two tokens in the `@theme inline` block of [`src/index.css`](../src/index.css). Both stacks end with an **explicit CJK fallback** (`PingFang SC` / `Microsoft YaHei` / `Noto Sans SC`) because ScriptCat is Chinese-first and CJK coverage must be controlled, not left to whatever `system-ui` happens to resolve to on a non-Chinese OS.

| Token | Value | Use |
| --- | --- | --- |
| `font-sans` (`--font-sans`) | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"` | Body / UI text. Applied on `body` via `@apply font-sans`, so everything inherits it by default; this is the default — you rarely write `font-sans` explicitly |
| `font-mono` (`--font-mono`) | `ui-monospace, SFMono-Regular, Menlo, "Cascadia Code", Consolas, "Liberation Mono", "PingFang SC", "Microsoft YaHei", monospace` | Code, version numbers, `@match`/permission rules, stored values — anything monospaced (`font-mono`) |

> **No webfont, no `@font-face`.** Don't reference a family that isn't actually packaged (it would silently fall back and mislead — Constraint 9). If a brand font is genuinely required, self-host it (woff2, local `@font-face`, never a CDN), keep the CJK fallback, and update this table.

### Radius

`--radius: 0.5rem` (8px) is the base; four steps are derived via `calc` in `@theme inline`:

| class | Value | Typical use |
| --- | --- | --- |
| `rounded-sm` | 4px | Small tags, compact controls |
| `rounded-md` | 6px | Buttons, inputs (`Button` defaults to `rounded-md`) |
| `rounded-lg` | 8px | Cards, panels |
| `rounded-xl` | 12px | Large cards, dialogs, emphasized containers |

### Spacing & width rhythm

- **Desktop centered content width:** ~`864px` for narrow decision pages, ~`1120px` for wide list pages, ~`1280px` as a general cap.
- **Sticky bars:** TopBar ≈ `52px`, ActionBar ≈ `68px`.
- **Block spacing:** start sections at `gap-4` (16px); card padding `p-6`/`p-7`.
- **Mobile:** single column, `100vw`, narrower horizontal padding (e.g. `px-4` vs desktop `px-8`).

---

## New-page / block recipe

When building a new page or dialog, run this checklist to stay consistent:

- [ ] **Entry** reuses the existing `main.tsx` pattern — mount `ThemeProvider`, `Toaster` (and `TooltipProvider` if needed); don't roll your own theme logic.
- [ ] **Shell:** sticky TopBar + `.scrollbar-custom` scroll container + sticky ActionBar ([layout & responsive](./annexes/design-patterns.md#layout--responsive)).
- [ ] **Responsive:** branch on `useIsMobile()`; re-shell on mobile (bottom bar/drawer, cards, collapse) rather than scaling down (Constraint 3, [layout & responsive](./annexes/design-patterns.md#layout--responsive)).
- [ ] **Color** entirely from tokens (`bg-card` / `text-foreground` / `border-border` / `text-primary` / `bg-primary-background` …), no literals, verified on both themes (Constraint 1–2, [tokens](./annexes/design-tokens.md) & [theming](#theming)).
- [ ] **Components** reuse first — search existing pages for a composed block before building; use `src/pages/components/ui/` primitives; extract a shared component when a block repeats; variants via CVA, classes via `cn()`, icons via `lucide-react` (Constraint 6, [components](./annexes/design-components.md)).
- [ ] **Hierarchy** orders the most important info first; decision pages go identity → permissions → code (Principle 1).
- [ ] **State:** loading / empty / error / success / in-progress all covered, never silent ([state patterns](./annexes/design-patterns.md#state-patterns)).
- [ ] **Motion** restrained (`150–250ms`, `ease-out`), hover/focus via pseudo-classes, enter/leave via `data-state`, reuse existing utilities ([motion](./annexes/design-patterns.md#motion)).
- [ ] **Depth** uses the elevation ladder (resting/raised/overlay, [elevation](./annexes/design-tokens.md#elevation-shadows)) and the z-index ladder (`z-10` chrome / `z-50` floating, [layering](./annexes/design-patterns.md#layering-z-index)) — no `shadow-2xl`, no magic `z-[…]`.
- [ ] **Accessibility:** AA contrast on both themes; meaning never color-only; custom controls keyboard-reachable with a visible focus ring; `aria-label` on icon buttons; ≥ ~44px mobile tap targets; reduced-motion-safe ([accessibility](./annexes/design-patterns.md#accessibility)).
- [ ] **Copy** defaults to sentence-case English + i18n; verbs on buttons; specific errors ([writing & microcopy](./annexes/design-patterns.md#writing--microcopy)), and flexes for long locales ([layout & responsive](./annexes/design-patterns.md#layout--responsive)); see [`DEVELOP.md`](./develop.md) and [`translation.md`](./translation.md).

Page skeleton (tokens + existing primitives + the shell pattern):

```tsx
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { Button } from "@App/pages/components/ui/button";

export default function ExamplePage() {
  const isMobile = useIsMobile();
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* sticky TopBar */}
      <header className="flex h-13 shrink-0 items-center border-b border-border px-4 md:px-8">
        <h1 className="text-base font-semibold">Title</h1>
      </header>

      {/* single scroll container */}
      <main className="scrollbar-custom flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
        <section className="mx-auto w-full max-w-[864px] space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">…</div>
        </section>
      </main>

      {/* sticky ActionBar */}
      <footer className={`flex shrink-0 gap-2.5 border-t border-border px-4 py-3 md:px-8
                          ${isMobile ? "flex-col" : "justify-end"}`}>
        <Button variant="outline">Cancel</Button>
        <Button>Confirm</Button>
      </footer>
    </div>
  );
}
```

---

## Sources & verification

**Implementation source of truth (read/edit these when changing the design):**

- Color / motion / scrollbar tokens → [`src/index.css`](../src/index.css)
- Theming → [`src/pages/components/theme-provider.tsx`](../src/pages/components/theme-provider.tsx) + [`src/pages/common.ts`](../src/pages/common.ts)
- Component primitives → [`src/pages/components/ui/`](../src/pages/components/ui/); shadcn config → [`components.json`](../components.json)
- `cn()` → [`src/pkg/utils/cn.ts`](../src/pkg/utils/cn.ts); breakpoint → [`src/pages/components/use-is-mobile.ts`](../src/pages/components/use-is-mobile.ts)

**Related docs:** UI hard rules and commit flow → [`DEVELOP.md`](./develop.md); internals → [`ARCHITECTURE.md`](./architecture.md); doc maintenance and fact-checking → [`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md).

> When editing this doc, follow [`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md): token values, component names, and variant names track the current branch's `src/` code (if you can't `git grep` it, don't claim it); enumerate counts and lists rather than trusting memory.
