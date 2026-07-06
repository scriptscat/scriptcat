# Design tokens

## Color Tokens (full light / dark values)

**Single source:** [`src/index.css`](../../src/index.css). `:root` defines light, `.dark` overrides for dark, and `@theme inline` exposes every `--token` as a Tailwind color (`--color-*`), so `bg-<token>` / `text-<token>` / `border-<token>` all work **and switch with the theme automatically**.

**Usage:**
- Background `bg-<token>`, text `text-<token>`, border `border-<token>`, focus ring `ring-ring`.
- Opacity modifiers compose directly: `bg-primary-background/90` (solid primary hover), `ring-destructive/20`, `bg-input/30`.
- **Never hard-code a color value** — see Constraint 1 and [`DEVELOP.md` UI section](../develop/README.md). For dark-only tweaks use the `dark:` variant.

### Base surfaces & text

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#fafafa` | `#1e1e1e` | Page background |
| `foreground` | `#1a1a1a` | `#e5e5e5` | Primary text |
| `card` | `#ffffff` | `#151515` | Card / surface |
| `card-foreground` | `#1a1a1a` | `#e5e5e5` | Text on cards |
| `popover` | `#ffffff` | `#151515` | Floating layers (dropdown/tooltip/toast) surface |
| `popover-foreground` | `#1a1a1a` | `#e5e5e5` | Text in floating layers |
| `overlay` | `rgb(0 0 0 / 0.5)` | `rgb(0 0 0 / 0.6)` | Modal scrim — Dialog / Sheet / AlertDialog backdrop (`bg-overlay`; never hard-code `bg-black/50`) |
| `fg-secondary` | `#666666` | `#b5b5b5` | Secondary text (slightly stronger than `muted-foreground`) |

### Brand primary (blue)

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `primary` | `#1296db` | `#3aacef` | Brand text, icons, borders, indicators, and active-state emphasis; not a solid control fill |
| `primary-background` | `#1296db` | `#0b84d8` | Solid primary control/surface fill paired with `primary-foreground`; dark is deeper and hue-aligned with `primary` for balanced hierarchy |
| `primary-foreground` | `#ffffff` | `#ffffff` | Text/icons on `primary-background` |
| `primary-hover` | `#0a7db8` | `#1296db` | Solid primary gradient/hover endpoint (or use `bg-primary-background/90`) |
| `primary-light` | `#d6ecfa` | `#1e3040` | Soft brand wash — icon backgrounds, chip fills |

### Secondary / muted / accent backgrounds

> Per the shadcn convention, `secondary` / `muted` / `accent` share the **same gray value** here — different semantics, one fill color.

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `secondary` | `#f0f0f0` | `#2a2a2a` | Secondary buttons / fills |
| `secondary-foreground` | `#1a1a1a` | `#e5e5e5` | Text on secondary |
| `muted` | `#f0f0f0` | `#2a2a2a` | Muted background (group fills, placeholders) |
| `muted-foreground` | `#767676` | `#8a8a8a` | De-emphasized / descriptive text. **AA-tuned** (≥4.5:1 on `card`/`background`) — reserve for secondary/large text, not dense body copy ([state & a11y](./patterns.md#accessibility)) |
| `accent` | `#f0f0f0` | `#2a2a2a` | Hover / selected background (menu items, etc.) |
| `accent-foreground` | `#1a1a1a` | `#e5e5e5` | Text on accent |

### Borders, inputs, ring, switch

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `border` | `#e5e5e5` | `#2a2a2a` | Global borders (the `@layer base` reset gives every element `border-border`) |
| `input` | `#e5e5e5` | `#2a2a2a` | Form control borders |
| `ring` | `#1296db` | `#3aacef` | Focus ring (`focus-visible:ring-ring/50`) |
| `switch-off` | `#d0d0d0` | `#3a3a3a` | Switch off-state track |
| `thumb` | `#ffffff` | `#eeeeee` | Switch/Checkbox thumb (stays light even in dark) |

### Status colors

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

### Stored-value type badges (string / number / boolean / object)

For the storage table's "type" column — soft bg, deep fg; in dark the bg darkens and the fg brightens:

| Type | bg (Light → Dark) | fg (Light → Dark) |
| --- | --- | --- |
| `type-string` (green) | `#e4f7ea` → `#1e3520` | `#2ba24e` → `#4ade80` |
| `type-number` (blue) | `#d6ecfa` → `#1e3040` | `#1296db` → `#3aacef` |
| `type-boolean` (amber) | `#fceedb` → `#352c1e` | `#c2710c` → `#fb923c` |
| `type-object` (purple) | `#f3e8ff` → `#2a1e3a` | `#9333ea` → `#c084fc` |

**Categorical label chips (`--label-*`).** A name is hashed to one of **8** fixed hues and rendered as a soft-bg / deep-fg chip (`bg-label-<hue>-bg text-label-<hue>-fg`). Use this family for categorical tag/label chips and name-seeded avatars — never raw `green-50` / `blue-700` palette classes. The hashing lives in one place: [`getNameAvatarTone(seed)`](../../src/pages/components/NameAvatar.tsx) returns the `{ bg, text }` tone, and `<NameAvatar seed size>` wraps it as the rounded icon used by script icons, subscribe icons, and provider badges; the script-list tag chips call the same helper via `getTagColor`. Light bg = each hue's `-50`, light fg = `-700`; dark bg = `-900` @ 40% resolved opaque over the `#151515` card, dark fg = `-300`.

| Hue | bg (Light → Dark) | fg (Light → Dark) |
| --- | --- | --- |
| `label-green` | `#f0fdf4` → `#122e1e` | `#008236` → `#7bf1a8` |
| `label-blue` | `#eff6ff` → `#182345` | `#1447e6` → `#8ec5ff` |
| `label-purple` | `#faf5ff` → `#301644` | `#8200db` → `#dab2ff` |
| `label-orange` | `#fff7ed` → `#3f1d11` | `#ca3500` → `#ffb86a` |
| `label-rose` | `#fff1f2` → `#441022` | `#c70036` → `#ffa1ad` |
| `label-teal` | `#f0fdfa` → `#112c2a` | `#00786f` → `#46ecd5` |
| `label-amber` | `#fffbeb` → `#3e210f` | `#bb4d00` → `#ffd230` |
| `label-indigo` | `#eef2ff` → `#201e42` | `#432dd7` → `#a3b3ff` |

### Sidebar

| Token / class | Light | Dark | Use |
| --- | --- | --- | --- |
| `sidebar` | `#ffffff` | `#1a1a1a` | Sidebar background |
| `sidebar-foreground` | `#1a1a1a` | `#e5e5e5` | Sidebar text |
| `sidebar-primary` | `#1296db` | `#3aacef` | Sidebar emphasis |
| `sidebar-accent` | `#edf5fc` | `#2a2a30` | Sidebar selected background |
| `sidebar-border` | `#e5e5e5` | `#2a2a2a` | Sidebar border |
| `sidebar-ring` | `#1296db` | `#3aacef` | Sidebar focus ring |

(Also `sidebar-primary-foreground` / `sidebar-accent-foreground`, equal to `#ffffff` / the primary text color.)

### Scrollbar

| Token | Light | Dark |
| --- | --- | --- |
| `--scrollbar-thumb` | `rgba(0,0,0,.18)` | `rgba(255,255,255,.16)` |
| `--scrollbar-thumb-hover` | `rgba(0,0,0,.32)` | `rgba(255,255,255,.30)` |

Add the `.scrollbar-custom` class to any scroll container to get a thin, rounded, semi-transparent, theme-aware scrollbar (covers both the Firefox `scrollbar-*` properties and the WebKit pseudo-elements).

### Elevation (shadows)

Shadows signal *how high* a surface floats. There are **no `--shadow-*` tokens** — use the Tailwind utilities, but pick from this fixed ladder so elevation maps to meaning instead of drifting (the codebase currently mixes `shadow-xs … shadow-2xl` ad hoc — converge on these three):

| Level | Class | Use |
| --- | --- | --- |
| **Resting** | *(none)* / `shadow-sm` | Flat cards and list rows that sit on the page. Prefer a `border` over a shadow at rest; add `shadow-sm` only for a subtle lift (e.g. a sticky bar over scrolling content). |
| **Raised** | `shadow-md` | Anchored floating layers tied to a trigger — `DropdownMenu`, `Popover`, `Select`, hover cards. |
| **Overlay** | `shadow-lg` | Detached overlays that own the screen — `Dialog`, `Sheet`, `AlertDialog`. |

- **Don't reach past `shadow-lg`.** `shadow-xl` / `shadow-2xl` read as heavy and inconsistent; if something needs more separation it usually needs a scrim/backdrop, not a bigger shadow.
- **Shadows barely render in dark mode.** On `#151515` cards a black shadow is nearly invisible, so depth in dark relies on the `border` + the surface step (`background #1e1e1e` → `card #151515`). Don't lean on shadow alone to separate layers in dark — keep the border. (If dark-specific depth becomes necessary, introduce `--shadow-*` tokens with separate `.dark` values and document them here — don't hand-tune per component.)
- Pair elevation with the matching radius ([typography & radius](./README.md#typography--radius)): raised → `rounded-lg`, overlay → `rounded-xl`.
