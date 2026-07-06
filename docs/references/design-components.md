# Component palette

## Component palette & usage

The shadcn primitives live in [`src/pages/components/ui/`](../../src/pages/components/ui/) — `new-york` style, CSS variables enabled, no class prefix (`components.json`). Icons are always `lucide-react`; class merging is always `cn()` ([`src/pkg/utils/cn.ts`](../../src/pkg/utils/cn.ts)); variants are always CVA — these are the [`DEVELOP.md` UI section](../develop.md) hard rules, not repeated here. This section is "what exists and how to choose."

### Primitives & shared composites

**Primitives** — the shadcn building blocks in [`src/pages/components/ui/`](../../src/pages/components/ui/):

| File | Use |
| --- | --- |
| `button.tsx` | Buttons (variants/sizes below) |
| `badge.tsx` | Status / label badges |
| `card.tsx` | Card container (base for `Surface` / `DataPanel`) |
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
| `checkbox.tsx` / `switch.tsx` | Checkbox / switch |
| `toggle.tsx` / `toggle-group.tsx` | Toggle button / toggle group (base of `SegmentedControl`) |
| `label.tsx` | Form label |
| `progress.tsx` | Progress bar — `default` / `top` / `indeterminate` variants |
| `skeleton.tsx` | Loading-placeholder block |
| `sonner.tsx` | Global toast container |
| `use-hover-menu.ts` | Helper hook for hover-triggered menus |

> The palette is pruned to what's actually imported — unused shadcn primitives are deleted, not parked. Need
> one back (alert / avatar / radio-group / scroll-area / separator)? Re-add it from shadcn rather than
> hand-rolling. **Name-seeded avatars** (script / subscribe icons, provider badges) use the shared
> `NameAvatar` / `getNameAvatarTone` in [`src/pages/components/NameAvatar.tsx`](../../src/pages/components/NameAvatar.tsx) — see [stored-value type badges](./design-tokens.md#stored-value-type-badges-string--number--boolean--object).

**Composites** — project blocks built on the primitives. Reuse these before hand-rolling ([Design Principles](../design.md#design-principles): one implementation per concept):

| Component | File | Use |
| --- | --- | --- |
| `Surface` | `ui/surface.tsx` | Padded card surface (`padding` / `interactive` / `disabled` variants) for cards & tiles |
| `DataPanel` (`+ Header` / `Row` / `Empty`) | `ui/data-panel.tsx` | Bordered key/value or compact-list panel |
| `StateScreen` | `ui/state-screen.tsx` | Full-area loading / empty / error / success screen with `tone`, monospace detail box & progress slot ([state patterns](./design-patterns.md#state-patterns)) |
| `EmptyState` | `ui/empty-state.tsx` | Inline empty state (icon + title + description + action) |
| `LoadingState` | `ui/loading-state.tsx` | Inline centered `Loader2` + label |
| `SearchInput` | `ui/search-input.tsx` | Search box with leading icon over a muted field |
| `SegmentedControl` | `ui/segmented-control.tsx` | Single-select segmented switch for a few options (e.g. task mode, permission duration) |
| `FormField` / `SwitchField` | `ui/form-field.tsx` | Labeled field wrapper (label + description + error + required) / switch row ([forms & validation](./design-patterns.md#forms--validation)) |
| `TooltipIconButton` | `ui/tooltip-icon-button.tsx` | Icon button with tooltip + loading state |
| `NameAvatar` | `components/NameAvatar.tsx` | Name-seeded rounded icon (script / subscribe / provider) — see [stored-value type badges](./design-tokens.md#stored-value-type-badges-string--number--boolean--object) |

> No form library (react-hook-form / zod) is used; forms are plain `useState` + controlled components. Keep new forms on this pattern — don't pull in a library unprompted.

### Button variants / sizes

Source: [`button.tsx`](../../src/pages/components/ui/button.tsx).

- **variant:** `default` (brand solid), `destructive`, `outline`, `secondary`, `ghost`, `link`
- **size:** `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

The `default` variant uses `bg-primary-background text-primary-foreground`. Keep `text-primary` / `border-primary`
for accent semantics; do not use `bg-primary` as a solid button fill.

```tsx
import { Button } from "@App/pages/components/ui/button";
import { Plus } from "lucide-react";

<Button>Install</Button>                                   {/* primary action */}
<Button variant="outline">Cancel</Button>                  {/* secondary action */}
<Button variant="destructive">Delete</Button>              {/* dangerous action */}
<Button variant="ghost" size="icon-sm"><Plus /></Button>   {/* icon button; svg auto-sizes to size-4 */}
```

### Badge variants

Source: [`badge.tsx`](../../src/pages/components/ui/badge.tsx). Variants: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`.

```tsx
import { Badge } from "@App/pages/components/ui/badge";

<Badge variant="success">Enabled</Badge>      {/* success-bg / success-fg */}
<Badge variant="warning">Sensitive</Badge>    {/* warning-bg / warning-fg */}
<Badge variant="destructive">Parse failed</Badge>
```

### Toast (sonner + notify)

The container [`sonner.tsx`](../../src/pages/components/ui/sonner.tsx) is theme-aware, **bottom-right on desktop / top-center on mobile** (switched by `useIsMobile()`), with a neutral `popover` surface, a semantic-colored icon + left accent bar, a close button, and at most 3 stacked; mount it once per page entry.

Business code **always uses `notify`** ([`toast.ts`](../../src/pages/components/ui/toast.ts)) — never `import { toast } from "sonner"` directly (an eslint rule enforces this):

```tsx
import { notify } from "@App/pages/components/ui/toast";

notify.success("Script installed");            // 3s
notify.error("Update failed: network error");  // 4s
notify.promise(p, { loading, success, error }); // ∞ until resolve/reject
```

Durations by level: success/info/warning 3s / error 4s / with action 5s / loading·promise ∞.

### Selection guidance

- **Confirmation:** dangerous / irreversible → `AlertDialog`; lightweight inline confirm (e.g. row delete) → `popconfirm`.
- **Confirm vs. act-immediately:** a modal confirm interrupts *every* time, so reserve it for the genuinely irreversible or wide-blast (delete N scripts + their stored values, reset settings). For easily reversible actions, prefer acting immediately over a blocking dialog — fewer interruptions. (`notify` exposes an `action` button if a one-tap undo/retry is genuinely worth offering, but don't add it reflexively.) State the blast radius in the confirm copy ("Delete 3 scripts and their stored values? This cannot be undone.").
- **Transient panels:** mobile nav / side detail → `Sheet`; small anchored layer → `Popover` / `DropdownMenu`.
- **Feedback:** transient → `toast`; persistent / in-page → see [state patterns](./design-patterns.md#state-patterns).
