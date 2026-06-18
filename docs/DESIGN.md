# ScriptCat Design System

> **A reuse-oriented design reference.** It consolidates the visual language that lives in `src/index.css` and the shadcn component layer into one place you can copy from: **color tokens (full light/dark values), the theming mechanism, the component palette, layout & responsive patterns, motion, state patterns, and an end-to-end new-page recipe.** Read this before building any new page, dialog, or block so it stays visually and behaviorally consistent with the rest of the app.

> **Stack in one line:** React 19 + shadcn/ui (Radix primitives, `new-york` style) + Tailwind CSS v4 + React Router. Colors and motion are defined in the `@theme inline` block of `src/index.css`. **There is no `tailwind.config.js`** (Tailwind v4); PostCSS runs through `@tailwindcss/postcss` (`postcss.config.mjs`); **class names have no prefix** (`bg-background`, not `tw-bg-background`).

---

## 0. What this doc owns

| Owned here | Owned elsewhere |
| --- | --- |
| Color-token values, semantics, usage | The hard rules that mandate them (no hard-coded colors, hover via pseudo-classes, `cn()` / CVA / `lucide`) → [`DEVELOP.md` § UI](./DEVELOP.md) |
| Theming mechanism, `dark:` usage | Commands, structure, coding style, testing, i18n, commit/PR → [`DEVELOP.md`](./DEVELOP.md) |
| Component palette, variants, selection guidance | Process model, message passing, service layers, internals → [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Layout shell, responsive patterns, motion, state patterns, page recipe | — |

This doc restates the `DEVELOP.md` hard rules only where needed, then links back — it does not duplicate them.

---

## 1. Core Constraints (non-negotiable)

Every UI change must satisfy all of these. They are the bar for "friendly, consistent UI/UX" in this codebase.

- **Use tokens, not literal colors — one value, one place.** Never write a hex (`#1296db`), an `rgb()`, or a palette class (`text-blue-500`). Always use a semantic token — `bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-muted-foreground`, … (§3). All color values live in exactly one place — the token definitions in `src/index.css` — so the palette stays unified and a single edit re-skins everything. One semantic concept maps to **one** token: before adding a color, check §3 for an existing token and reuse it; don't introduce a near-duplicate (a second slightly-different gray or blue). Only add a new token when the concept is genuinely new — with both light and dark values — and document it in §3.
- **Both themes, always.** Light and dark are first-class. Because every color comes from a token that has a `:root` and a `.dark` value, using tokens makes a component theme-correct for free. Verify on real light *and* dark before considering anything done (§4).
- **Design for mobile too.** The UI is responsive around a single `768px` breakpoint (`useIsMobile`). Mobile is **a different shell, not a shrunk desktop** — side nav becomes bottom tabs + drawer, tables become cards, rows stack, details/code collapse, actions move into a sticky bar (§7). A feature isn't finished until it works on a narrow viewport.
- **No inline `style={{}}` for what Tailwind can express.** Compose utility classes via `cn()` (`clsx` + `tailwind-merge`); build variants with `class-variance-authority` (CVA). Inline styles only for genuinely dynamic values (e.g. a computed width).
- **Hover/focus are CSS, not state.** Express interactive visuals with pseudo-classes (`hover:bg-primary/90`, `focus-visible:ring-ring/50`). React state is for data/logic, not styling.
- **Reuse components before building new ones.** Default to the shadcn primitives in `src/pages/components/ui/` (§6); icons come from `lucide-react` only — don't hand-roll a control that already exists. Beyond primitives, search the existing pages for a composed block (card row, identity header, permission card, state screen…) that already does what you need and reuse it. When the same block appears in two or more places, extract one shared component instead of copy-pasting — keep one implementation per concept so behavior and styling stay consistent and a fix lands everywhere at once.
- **Keep motion restrained.** Enter/leave in `150–250ms`, `ease-out`; reuse the existing `@utility` animations rather than inlining `@keyframes`; prefer `transition-colors` over `transition-all` (§8).
- **No silent operations.** Every async flow surfaces loading / empty / error / success (and progress for long-running work). The user must always know whether their action worked (§9).
- **Don't introduce new colors or fonts ad hoc.** New color → add a token in `src/index.css` (with both light and dark values) and document it here. New font → add a `--font-*` token; don't reference an unconfigured family.

---

## 2. Design Principles

The "why" behind the constraints — apply these when shaping a screen.

1. **Trust-first, clear hierarchy.** Let the most important information win the visual weight. For decision screens (install / permission / import), order content as **identity → permissions → code**, with code demoted to a height-capped scroll region.
2. **System state is always visible.** No silent work. Each async flow shows **progress (a top indeterminate bar) → process (skeletons / per-row status) → result (toast or result screen)**.
3. **Color is semantic, never decorative.** Blue = interactive / primary; green = safe / enabled / success; amber = caution / sensitive; red = danger / error / blocked. Color carries meaning.
4. **Mobile is a different shell.** Don't scale the desktop down — re-shell it: bottom tabs + drawer instead of a side rail, cards instead of tables, vertical stacks, collapsed detail.
5. **Consistent shell.** Major pages share one skeleton: **sticky TopBar + single scroll container + sticky ActionBar**. Swap the content, not the frame.
6. **High cohesion, low coupling.** Each UI unit has a single purpose, a clear interface, and is understandable and testable on its own. A file growing large is usually a signal to split it.

---

## 3. Color Tokens (full light / dark values)

**Single source:** [`src/index.css`](../src/index.css). `:root` defines light, `.dark` overrides for dark, and `@theme inline` exposes every `--token` as a Tailwind color (`--color-*`), so `bg-<token>` / `text-<token>` / `border-<token>` all work **and switch with the theme automatically**.

**Usage:**
- Background `bg-<token>`, text `text-<token>`, border `border-<token>`, focus ring `ring-ring`.
- Opacity modifiers compose directly: `bg-primary/90` (hover), `ring-destructive/20`, `bg-input/30`.
- **Never hard-code a color value** — see Constraint 1 and [`DEVELOP.md` § UI](./DEVELOP.md). For dark-only tweaks use the `dark:` variant.

### 3.1 Base surfaces & text

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#fafafa` | `#1e1e1e` | Page background |
| `foreground` | `#1a1a1a` | `#e5e5e5` | Primary text |
| `card` | `#ffffff` | `#151515` | Card / surface |
| `card-foreground` | `#1a1a1a` | `#e5e5e5` | Text on cards |
| `popover` | `#ffffff` | `#151515` | Floating layers (dropdown/tooltip/toast) surface |
| `popover-foreground` | `#1a1a1a` | `#e5e5e5` | Text in floating layers |
| `fg-secondary` | `#666666` | `#b5b5b5` | Secondary text (slightly stronger than `muted-foreground`) |

### 3.2 Brand primary (blue)

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `primary` | `#1296db` | `#3aacef` | Primary actions, active state, emphasis (dark is brightened for contrast) |
| `primary-foreground` | `#ffffff` | `#ffffff` | Text on the brand color |
| `primary-hover` | `#0a7db8` | `#1296db` | Brand hover (or use `bg-primary/90`) |
| `primary-light` | `#d6ecfa` | `#1e3040` | Soft brand wash — icon backgrounds, chip fills |

### 3.3 Secondary / muted / accent backgrounds

> Per the shadcn convention, `secondary` / `muted` / `accent` share the **same gray value** here — different semantics, one fill color.

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `secondary` | `#f0f0f0` | `#2a2a2a` | Secondary buttons / fills |
| `secondary-foreground` | `#1a1a1a` | `#e5e5e5` | Text on secondary |
| `muted` | `#f0f0f0` | `#2a2a2a` | Muted background (group fills, placeholders) |
| `muted-foreground` | `#888888` | `#8a8a8a` | De-emphasized / descriptive text |
| `accent` | `#f0f0f0` | `#2a2a2a` | Hover / selected background (menu items, etc.) |
| `accent-foreground` | `#1a1a1a` | `#e5e5e5` | Text on accent |

### 3.4 Borders, inputs, ring, switch

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `border` | `#e5e5e5` | `#2a2a2a` | Global borders (the `@layer base` reset gives every element `border-border`) |
| `input` | `#e5e5e5` | `#2a2a2a` | Form control borders |
| `ring` | `#1296db` | `#3aacef` | Focus ring (`focus-visible:ring-ring/50`) |
| `switch-off` | `#d0d0d0` | `#3a3a3a` | Switch off-state track |
| `thumb` | `#ffffff` | `#eeeeee` | Switch/Checkbox thumb (stays light even in dark) |

### 3.5 Status colors

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `destructive` | `#e7000b` | `#ff6669e6` | Dangerous / delete / error actions |
| `destructive-foreground` | `#ffffff` | `#ffffff` | Text on destructive |
| `success` | `#34c759` | `#34c759` | Success / enabled / running (solid) |
| `success-bg` / `success-fg` | `#e8f9ec` / `#0c8833` | `#1e3520` / `#6fdd8a` | Success **badge** (soft bg, deep fg) |
| `warning` | `#ff9500` | `#ff9500` | Caution / sensitive (solid) |
| `warning-bg` / `warning-fg` | `#fff4e6` / `#c46c00` | `#352c1e` / `#ffb84d` | Warning **badge** (soft bg, deep fg) |

> Use the solid status colors (`success`/`warning`) for icons and dots; use the `*-bg` / `*-fg` pairs for badges (see the `Badge` `success` / `warning` variants).

**Skill / purple accent.** Skills carry a purple brand identity across the install flow and the Agent management pages. Use the `skill` family — never raw `violet-*` palette classes.

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `skill` | `#9333ea` | `#a855f7` | Skill accent (solid) — install button, section icons (dark is brightened for contrast) |
| `skill-foreground` | `#ffffff` | `#ffffff` | Text on the solid skill color |
| `skill-bg` / `skill-fg` | `#f3e8ff` / `#7e22ce` | `#2a1e3a` / `#c084fc` | Skill **badge / chip** (soft bg, deep fg) — also the `CapabilityTag` `violet` tone |

### 3.6 Stored-value type badges (string / number / boolean / object)

For the storage table's "type" column — soft bg, deep fg; in dark the bg darkens and the fg brightens:

| Type | bg (Light → Dark) | fg (Light → Dark) |
| --- | --- | --- |
| `type-string` (green) | `#e4f7ea` → `#1e3520` | `#2ba24e` → `#4ade80` |
| `type-number` (blue) | `#d6ecfa` → `#1e3040` | `#1296db` → `#3aacef` |
| `type-boolean` (amber) | `#fceedb` → `#352c1e` | `#c2710c` → `#fb923c` |
| `type-object` (purple) | `#f3e8ff` → `#2a1e3a` | `#9333ea` → `#c084fc` |

### 3.7 Sidebar

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `sidebar` | `#ffffff` | `#1a1a1a` | Sidebar background |
| `sidebar-foreground` | `#1a1a1a` | `#e5e5e5` | Sidebar text |
| `sidebar-primary` | `#1296db` | `#3aacef` | Sidebar emphasis |
| `sidebar-accent` | `#edf5fc` | `#2a2a30` | Sidebar selected background |
| `sidebar-border` | `#e5e5e5` | `#2a2a2a` | Sidebar border |
| `sidebar-ring` | `#1296db` | `#3aacef` | Sidebar focus ring |

(Also `sidebar-primary-foreground` / `sidebar-accent-foreground`, equal to `#ffffff` / the primary text color.)

### 3.8 Scrollbar

| Token | Light | Dark |
| --- | --- | --- |
| `--scrollbar-thumb` | `rgba(0,0,0,.18)` | `rgba(255,255,255,.16)` |
| `--scrollbar-thumb-hover` | `rgba(0,0,0,.32)` | `rgba(255,255,255,.30)` |

Add the `.scrollbar-custom` class to any scroll container to get a thin, rounded, semi-transparent, theme-aware scrollbar (covers both the Firefox `scrollbar-*` properties and the WebKit pseudo-elements).

---

## 4. Theming

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
<button className="bg-primary text-primary-foreground hover:bg-primary/90">…</button>

// ✅ dark: variant only for a dark-specific tweak
<div className="bg-input/30 dark:bg-input/50">…</div>

// ❌ Hard-coded colors — break in dark and violate the DEVELOP.md rule
<div className="bg-white text-[#1a1a1a] border-[#e5e5e5]">…</div>
```

**Every UI change must hold up in both themes.** Verify on real light and dark — don't ship after checking only one.

---

## 5. Typography & Radius

### Fonts

| Token | Value | Use |
| --- | --- | --- |
| `font-mono` (`--font-mono`) | `"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` | Code, version numbers, `@match`/permission rules, stored values — anything monospaced (`font-mono`) |

> **There is no dedicated sans token.** `src/index.css` defines only `--font-mono`; body text uses Tailwind's default system sans stack. If you need a specific sans family, add a `--font-sans` token first (see Constraint 9) and update this section — don't reference an unconfigured font.

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

## 6. Component palette & usage

The shadcn primitives live in [`src/pages/components/ui/`](../src/pages/components/ui/) — `new-york` style, CSS variables enabled, no class prefix (`components.json`). Icons are always `lucide-react`; class merging is always `cn()` ([`src/pkg/utils/cn.ts`](../src/pkg/utils/cn.ts)); variants are always CVA — these are the [`DEVELOP.md` § UI](./DEVELOP.md) hard rules, not repeated here. This section is "what exists and how to choose."

### 6.1 Primitives

| File | Use |
| --- | --- |
| `button.tsx` | Buttons (variants/sizes below) |
| `badge.tsx` | Status / label badges |
| `card.tsx` | Card container |
| `alert.tsx` | Inline alert banner |
| `alert-dialog.tsx` | Blocking confirmation dialog (dangerous actions) |
| `dialog.tsx` | General modal dialog |
| `sheet.tsx` | Drawer (left/right/top/bottom; mobile nav, side panels) |
| `popover.tsx` / `popconfirm.tsx` | Floating layer / lightweight inline confirm (custom wrapper) |
| `dropdown-menu.tsx` | Dropdown menu |
| `tooltip.tsx` | Hover tooltip |
| `tabs.tsx` | Tabs |
| `accordion.tsx` / `collapsible.tsx` | Accordion / collapsible region (common for mobile collapsed detail) |
| `select.tsx` | Select |
| `input.tsx` / `textarea.tsx` | Text input |
| `checkbox.tsx` / `radio-group.tsx` / `switch.tsx` | Checkbox / radio / toggle |
| `label.tsx` | Form label |
| `progress.tsx` | Progress bar |
| `avatar.tsx` | Avatar |
| `separator.tsx` | Divider |
| `scroll-area.tsx` | Controlled scroll region |
| `sonner.tsx` | Global toast container |
| `use-hover-menu.ts` | Helper hook for hover-triggered menus |

> No form library (react-hook-form / zod) is used; forms are plain `useState` + controlled components. Keep new forms on this pattern — don't pull in a library unprompted.

### 6.2 Button variants / sizes

Source: [`button.tsx`](../src/pages/components/ui/button.tsx).

- **variant:** `default` (brand solid), `destructive`, `outline`, `secondary`, `ghost`, `link`
- **size:** `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

```tsx
import { Button } from "@App/pages/components/ui/button";
import { Plus } from "lucide-react";

<Button>Install</Button>                                   {/* primary action */}
<Button variant="outline">Cancel</Button>                  {/* secondary action */}
<Button variant="destructive">Delete</Button>              {/* dangerous action */}
<Button variant="ghost" size="icon-sm"><Plus /></Button>   {/* icon button; svg auto-sizes to size-4 */}
```

### 6.3 Badge variants

Source: [`badge.tsx`](../src/pages/components/ui/badge.tsx). Variants: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`.

```tsx
import { Badge } from "@App/pages/components/ui/badge";

<Badge variant="success">Enabled</Badge>      {/* success-bg / success-fg */}
<Badge variant="warning">Sensitive</Badge>    {/* warning-bg / warning-fg */}
<Badge variant="destructive">Parse failed</Badge>
```

### 6.4 Toast (sonner)

The container [`sonner.tsx`](../src/pages/components/ui/sonner.tsx) is already theme-aware, **bottom-right**, with `richColors`; mount it once per page entry. Trigger from anywhere:

```tsx
import { toast } from "sonner";

toast.success("Script installed");
toast.error("Update failed: network error");
```

### 6.5 Selection guidance

- **Confirmation:** dangerous / irreversible → `AlertDialog`; lightweight inline confirm (e.g. row delete) → `popconfirm`.
- **Transient panels:** mobile nav / side detail → `Sheet`; small anchored layer → `Popover` / `DropdownMenu`.
- **Feedback:** transient → `toast`; persistent / in-page → see §9 state patterns.

---

## 7. Layout & responsive

### Shell

Major pages share one structure: **sticky TopBar (no scroll) + single scroll container (`.scrollbar-custom`) + sticky ActionBar (no scroll)**. Only the middle layer scrolls; head and foot stay put.

### Single mobile breakpoint

[`src/pages/components/use-is-mobile.ts`](../src/pages/components/use-is-mobile.ts) is the **only** breakpoint source: `MOBILE_BREAKPOINT = 768`; a viewport `< 768px` is mobile.

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

The bottom bar is [`BottomTabBar.tsx`](../src/pages/options/layout/BottomTabBar.tsx). **Mobile re-shells, it doesn't shrink** — see Principle 4.

### Scroll-spy (long settings pages)

Long pages (settings / tools) use scroll-spy: scrolling the content highlights the current category, and clicking a category smooth-scrolls to its section. See [`SettingsLayout.tsx`](../src/pages/options/layout/SettingsLayout.tsx) + [`useScrollSpy.ts`](../src/pages/options/hooks/useScrollSpy.ts). On desktop the categories sit in a left rail; on mobile they become a top horizontal chip bar (the active chip `scrollIntoView`s to center).

---

## 8. Motion

**Sources:** [`src/index.css`](../src/index.css) (custom keyframes/utilities) + `tw-animate-css` (the `@import` provides `animate-in/out`, `fade-*`, `zoom-*`, `slide-*`, `accordion-*`, …) + Radix `data-state`. **No Framer Motion** — all motion is CSS.

### How to add motion that stays friendly

- **Fast and light:** enter/leave in `150–250ms`, `ease-out`; the built-in collapse/progress animations use `200ms ease-out`.
- **Hover/focus via CSS pseudo-classes, not React state** (`hover:bg-primary/90`, `focus-visible:ring-ring/50`) — a `DEVELOP.md` rule.
- **Enter/leave via Radix `data-state`** — don't hand-roll show/hide with `setTimeout`.
- **Prefer `transition-colors` over `transition-all`:** animate only what should move, avoiding layout thrash and wasted work.
- **Reuse existing utilities;** don't inline `@keyframes` in a component. New animation → add an `@utility` in `src/index.css` so it's globally reusable.
- **Large looping animations** (e.g. the indeterminate bar) should animate `transform` (already `translateX`) for performance.

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

## 9. State patterns

Every async flow covers the states below, presented consistently:

| State | Standard presentation |
| --- | --- |
| **Loading** | A skeleton that preserves the layout, a centered spinner, or a thin top indeterminate bar — pick by *where* the wait happens (see **Loading patterns** below) |
| **Empty** | Centered `muted` icon (e.g. `lucide` `PackageOpen`/`Inbox`) + title + explanation + primary CTA |
| **Error** | Centered red icon + an "X failed" title + a monospace (`font-mono`) box with the raw error + retry/close |
| **Success** | Centered green icon + title + summary stats + next-step CTA; for transient feedback use `toast.success` |
| **In-progress** | Top progress bar + per-row status icons (✓ green done / ○ brand in-progress / ⏱ `muted` pending / ✗ `muted` skipped) + readable copy ("Importing… 2/5, keep this page open") |

### Loading patterns

A loading state is not one thing — and a centered spinner is the *last* resort, not the default. The guiding rule is **keep the page's shape stable**: show a placeholder where the content will land instead of collapsing the layout to a spinner and snapping it back when data arrives. Match the indicator to where the wait happens:

| Where the wait is | Indicator | Reference in code |
| --- | --- | --- |
| **First load of a whole page / screen** (no shape yet) | Centered `Loader2` (`size-12 animate-spin text-primary`) + title/desc; pair with a determinate bar (`transition-[width]`) when bytes/percent are known, else an indeterminate fill | `InstallLoading` ([`install/components/InstallStates.tsx`](../src/pages/install/components/InstallStates.tsx)) |
| **Reloading content that already has a shape** (table / list) | A **skeleton** that keeps the real header + placeholder rows (`animate-pulse rounded bg-muted`) — not a centered spinner — so the layout doesn't collapse and reflow | `SkeletonTable` / `SkeletonBar` ([`batchupdate/components.tsx`](../src/pages/batchupdate/components.tsx)) |
| **Background refresh / check while content stays visible** | A thin top `animate-indeterminate-bar` (`h-0.5`, `role="progressbar"` + `aria-label`) pinned under the TopBar, not scrolling with content | `TopProgressBar` ([`batchupdate/components.tsx`](../src/pages/batchupdate/components.tsx)) |
| **A single action** (button, connection test, fetch) | Disable the control and show an inline `Loader2 size-4 animate-spin`; if the action already has an icon, spin that icon instead (`RefreshCw className={cn(checking && "animate-spin")}`) | `McpFormDialog` test button, `ScriptList` / `AgentSkills` refresh |

Practical rules:

- **Never freeze and never wait silently.** A region that is loading must show a skeleton, spinner, or bar — never a blank or stale frame with no signal (Constraint 7).
- **Don't fake determinism.** Use the determinate progress bar only when the percent/bytes are actually known; otherwise use an indeterminate fill or a skeleton.
- **One indicator per wait.** Don't stack a full-page spinner over content that is already skeletoned, or two bars for one fetch.
- **The spinner is always `Loader2` + `animate-spin`** (`text-primary` when it should read as active), sized to context — `size-3.5`/`size-4` inline, `size-12` full-page (§8).

The rule: **no silent operations** — after any action the user can see success / failure / in-progress.

---

## 10. New-page / block recipe

When building a new page or dialog, run this checklist to stay consistent:

- [ ] **Entry** reuses the existing `main.tsx` pattern — mount `ThemeProvider`, `Toaster` (and `TooltipProvider` if needed); don't roll your own theme logic.
- [ ] **Shell:** sticky TopBar + `.scrollbar-custom` scroll container + sticky ActionBar (§7).
- [ ] **Responsive:** branch on `useIsMobile()`; re-shell on mobile (bottom bar/drawer, cards, collapse) rather than scaling down (Constraint 3, §7).
- [ ] **Color** entirely from tokens (`bg-card` / `text-foreground` / `border-border` / `bg-primary` …), no literals, verified on both themes (Constraint 1–2, §3–4).
- [ ] **Components** reuse first — search existing pages for a composed block before building; use `src/pages/components/ui/` primitives; extract a shared component when a block repeats; variants via CVA, classes via `cn()`, icons via `lucide-react` (Constraint 6, §6).
- [ ] **Hierarchy** orders the most important info first; decision pages go identity → permissions → code (Principle 1).
- [ ] **State:** loading / empty / error / success / in-progress all covered, never silent (§9).
- [ ] **Motion** restrained (`150–250ms`, `ease-out`), hover/focus via pseudo-classes, enter/leave via `data-state`, reuse existing utilities (§8).
- [ ] **Copy** defaults to English + i18n (see [`DEVELOP.md`](./DEVELOP.md) and [`translation/README.md`](./translation/README.md)).

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

## 11. Sources & verification

**Implementation source of truth (read/edit these when changing the design):**

- Color / motion / scrollbar tokens → [`src/index.css`](../src/index.css)
- Theming → [`src/pages/components/theme-provider.tsx`](../src/pages/components/theme-provider.tsx) + [`src/pages/common.ts`](../src/pages/common.ts)
- Component primitives → [`src/pages/components/ui/`](../src/pages/components/ui/); shadcn config → [`components.json`](../components.json)
- `cn()` → [`src/pkg/utils/cn.ts`](../src/pkg/utils/cn.ts); breakpoint → [`src/pages/components/use-is-mobile.ts`](../src/pages/components/use-is-mobile.ts)

**Related docs:** UI hard rules and commit flow → [`DEVELOP.md`](./DEVELOP.md); internals → [`ARCHITECTURE.md`](./ARCHITECTURE.md); doc maintenance and fact-checking → [`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md).

> When editing this doc, follow [`DOC-MAINTENANCE.md`](./DOC-MAINTENANCE.md): token values, component names, and variant names track the current branch's `src/` code (if you can't `git grep` it, don't claim it); enumerate counts and lists rather than trusting memory.
