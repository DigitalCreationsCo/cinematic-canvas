---
trigger: glob
globs: src/client
---

# Design Guidelines: Cinematic Video Generation Pipeline Frontend

Design system is defined in `src/shared/design-system/`. All components inherit from the shared design tokens in `index.base.css`.

## Application Overview

A single-page application interface frontend for a cinematic video generation pipeline, including scene generation views, start and end reference image views, performance metrics, and asynchronous handling and UI updates for the user during pipeline processes (segment skeletons, messages, error messages).
UI is space-efficient, dense yet readable, logically organized, and well-designed.

## Design Approach

**Framework**: Custom Cinematic Design System built on Tailwind CSS v4 with CSS custom properties
**Design Language**: Cinematic glass morphism with adaptive light/dark modes
**Rationale**: Production tool requiring real-time state management, visual depth through glass effects, and professional workflow efficiency with smooth cinematic animations.

---

## Core Design Principles

1. **Cinematic Depth**: Layered glass surfaces with subtle light rims and depth shadows
2. **Adaptive Theming**: Full light/dark mode support with consistent visual hierarchy
3. **Motion as Communication**: Easing curves and animations convey state changes and interactions
4. **Workflow Efficiency**: Dense information display with clear visual hierarchy

---

## Design Token Architecture

All design tokens are defined as CSS custom properties in `index.base.css` and registered as Tailwind v4 theme variables via `@theme`.

### File Structure

```
src/shared/design-system/
├── index.base.css    # All design tokens, animations, component classes

website/app/globals.css    # Website-specific overrides
src/client/src/index.css   # Client-specific utilities and React Flow styling
```

### CSS Custom Property Naming Conventions

| Pattern | Purpose |
|---------|---------|
| `--color-*` | Semantic color tokens |
| `--shadow-*` | Elevation and depth tokens |
| `--ease-*` | Animation easing curves |
| `--duration-*` | Animation timing values |
| `--radius-*` | Border radius values |
| `--gap-*` | Layout rhythm spacing |
| `--padding-*` | Consistent padding values |

---

## Typography System

### Font Families

| Token | Font | Use Case |
|-------|------|----------|
| `--font-heading` | "Zalando Sans SemiExpanded" | Page titles, section headers |
| `--font-body` | "Zalando Sans SemiExpanded" | Body text, UI labels |
| `--font-mono` | "Zalando Sans SemiExpanded" | Technical data, code, IDs |

**Note**: Client uses font-weight 700 for headings; Website uses font-weight 600.

### Type Scale

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Page Titles | text-2xl (24px) | font-semibold | Uses `tracking-tight` |
| Section Headers | text-lg (18px) | font-semibold | Uses `tracking-tight` |
| Card Titles | text-base (16px) | font-medium | - |
| Body Text | text-base (16px) | font-normal | Client overrides to text-xs |
| Labels/Metadata | text-xs (12px) | font-medium | Uses `tracking-wide` |
| Technical Data | text-xs (12px) | font-mono | Timestamps, IDs, URLs |

### Font Utility Classes

```css
@utility font-heading {
  font-family: "Zalando Sans SemiExpanded", ui-sans-serif, system-ui, sans-serif;
  font-weight: 700; /* Client: 700, Website: 600 */
  @apply tracking-tight;
}

@utility font-sans {
  font-family: "Zalando Sans", ui-sans-serif, system-ui, sans-serif;
}

@utility font-mono {
  font-family: "Zalando Sans SemiExpanded", ui-monospace, SFMono-Regular, monospace;
}
```

---

## Color System

### Semantic Color Tokens

All colors use HSLA format for consistent theming across light/dark modes.

#### Light Mode (Default)

```css
:root {
  /* Core Surfaces */
  --background: hsla(0, 0%, 98%, 1);      /* #FAFAFA - App background */
  --foreground: hsla(0, 0%, 5%, 1);       /* #0D0D0D - Primary text */

  /* Cards & Popovers */
  --card: hsla(0, 0%, 100%, 1);           /* #FFFFFF */
  --card-foreground: hsla(0, 0%, 5%, 1);
  --popover: hsla(0, 0%, 100%, 1);
  --popover-foreground: hsla(0, 0%, 5%, 1);

  /* Interactive Elements */
  --primary: hsla(0, 0%, 9%, 1);           /* #171717 - Buttons, active states */
  --primary-foreground: hsla(0, 0%, 98%, 1);
  --secondary: hsla(0, 0%, 94%, 1);       /* #F0F0F0 */
  --secondary-foreground: hsla(0, 0%, 9%, 1);

  /* Muted & Accent */
  --muted: hsla(0, 0%, 94%, 1);            /* Subdued backgrounds */
  --muted-foreground: hsla(0, 0%, 45%, 1); /* #737373 - Secondary text */
  --accent: hsla(0, 0%, 90%, 1);          /* #E6E6E6 */
  --accent-foreground: hsla(0, 0%, 9%, 1);

  /* Canvas (Graph/Diagram) */
  --canvas-lines: hsla(0, 0%, 94%, 1);
  --canvas-background: hsla(0, 0%, 60%, 1);
  --canvas-gradient: hsla(0, 0%, 94%, 1);

  /* Feedback Colors */
  --destructive: hsla(0, 84%, 60%, 1);     /* #EF4444 - Red */
  --destructive-foreground: hsla(0, 0%, 98%, 1);

  /* Borders & Inputs */
  --border: hsla(0, 0%, 75%, 1);           /* #BFBFBF */
  --input: hsla(0, 0%, 85%, 1);
  --ring: hsla(0, 0%, 9%, 1);             /* Focus rings */
}
```

#### Dark Mode (`.dark`)

```css
.dark {
  /* Core Surfaces - Dark cinematic background */
  --background: hsla(0, 0%, 2%, 1);       /* #050505 - Near black */
  --foreground: hsla(0, 0%, 98%, 1);      /* #FAFAFA */

  /* Cards & Popovers - Subtle blue-gray tint */
  --card: hsla(240, 5%, 4%, 1);           /* #0A0A0D */
  --card-foreground: hsla(0, 0%, 98%, 1);
  --popover: hsla(240, 5%, 4%, 1);
  --popover-foreground: hsla(0, 0%, 98%, 1);

  /* Interactive Elements - Inverted */
  --primary: hsla(0, 0%, 98%, 1);         /* White primary buttons */
  --primary-foreground: hsla(240, 5%, 4%, 1);
  --secondary: hsla(240, 5%, 10%, 1);     /* #141416 */
  --secondary-foreground: hsla(0, 0%, 98%, 1);

  /* Muted & Accent - Dark gray-blue */
  --muted: hsla(240, 5%, 10%, 1);
  --muted-foreground: hsla(240, 5%, 60%, 1);
  --accent: hsla(240, 5%, 10%, 1);
  --accent-foreground: hsla(0, 0%, 98%, 1);

  /* Canvas - Higher contrast for diagrams */
  --canvas-lines: hsla(0, 0%, 48%, 1);
  --canvas-background: hsla(0, 0%, 3%, 1);
  --canvas-gradient: hsla(0, 0%, 20%, 1);

  /* Feedback Colors - Muted in dark mode */
  --destructive: hsla(0, 62%, 30%, 1);    /* Darker red */
  --destructive-foreground: hsla(0, 0%, 98%, 1);

  /* Borders & Inputs */
  --border: hsla(0, 0%, 15%, 1);          /* #262626 */
  --input: hsla(0, 0%, 15%, 1);
  --ring: hsla(0, 0%, 80%, 1);
}
```

### Sidebar Colors

```css
/* Light Mode */
--sidebar: hsla(0, 0%, 96%, 1);
--sidebar-foreground: hsla(0, 0%, 5%, 1);
--sidebar-border: hsla(0, 0%, 85%, 1);
--sidebar-primary: hsla(0, 0%, 9%, 1);
--sidebar-primary-foreground: hsla(0, 0%, 98%, 1);
--sidebar-accent: hsla(0, 0%, 92%, 1);
--sidebar-accent-foreground: hsla(0, 0%, 9%, 1);
--sidebar-ring: hsla(0, 0%, 9%, 1);

/* Dark Mode */
--sidebar: hsla(0, 0%, 5%, 1);
--sidebar-foreground: hsla(0, 0%, 95%, 1);
--sidebar-border: hsla(0, 0%, 14%, 1);
--sidebar-primary: hsla(0, 0%, 98%, 1);
--sidebar-primary-foreground: hsla(0, 0%, 9%, 1);
--sidebar-accent: hsla(0, 0%, 12%, 1);
--sidebar-accent-foreground: hsla(0, 0%, 98%, 1);
--sidebar-ring: hsla(0, 0%, 80%, 1);
```

### Glass Border Tokens

Used for cinematic glass morphism effects - fixed opacities that work across themes:

```css
--border-glass: color-mix(in srgb, ..., transparent 92%);      /* 8% opacity */
--border-glass-hover: color-mix(in srgb, ..., transparent 85%); /* 15% opacity */
--border-gradient-start: color-mix(in srgb, ..., transparent 80%); /* 20% opacity */
--border-gradient-end: color-mix(in srgb, ..., transparent 95%);   /* 5% opacity */
```

### Elevation Overlay Tokens

Used with `.hover-elevate`, `.active-elevate`, `.toggle-elevate` utilities:

```css
/* Light Mode */
--elevate-1: hsla(0, 0%, 80%, 1);   /* Subtle highlight */
--elevate-2: hsla(0, 0%, 70%, 0.9);
--elevate-3: hsla(0, 0%, 60%, 0.8);
--elevate-4: hsla(0, 0%, 50%, 0.7);

/* Dark Mode */
--elevate-1: hsla(0, 0%, 10%, 0.5);
--elevate-2: hsla(0, 0%, 30%, 0.6);
--elevate-3: hsla(0, 0%, 50%, 0.7);
--elevate-4: hsla(0, 0%, 70%, 0.8);
```

---

## Animation System

### Easing Curves

| Token | Value | Use Case |
|-------|-------|----------|
| `--ease-out-expo` | `cubic-bezier(0.165, 0.84, 0.44, 1)` | Button hover transforms |
| `--ease-out-cubic` | `cubic-bezier(0.33, 1, 0.68, 1)` | Text micro-interactions |
| `--ease-cinematic` | `cubic-bezier(0.25, 0.46, 0.45, 0.74)` | Cinematic transitions |
| `--ease-bounce-cinematic` | `cubic-bezier(0.275, 0.885, 0.32, 1.175)` | Bouncy text reveals |

### Animation Durations

| Token | Value | Use Case |
|-------|-------|----------|
| `--duration-fast` | `0.2s` | Micro-interactions, hover states |
| `--duration-base` | `0.3s` | Default transitions |
| `--duration-medium` | `0.5s` | Text scaling animations |
| `--duration-slow` | `0.6s` | Cinematic card hover |
| `--duration-slower` | `1s` | Text cinematic go animation |
| `--duration-slowest` | `1.2s` | Text cinematic scale animation |
| `--duration-gradient-bg` | `15s` | Background gradient loop |

### Keyframe Animations

```css
/* Accordion expand/collapse */
--animate-accordion-down: accordion-down var(--duration-fast) ease-out;
--animate-accordion-up: accordion-up var(--duration-fast) ease-out;

/* Cinematic text effects */
--animate-text-scale-cinematic: text-scale-cinematic var(--duration-slowest) var(--ease-cinematic) forwards;
--animate-text-go-cinematic: text-go-cinematic var(--duration-slower) var(--ease-bounce-cinematic);

/* Background gradient animation */
--animate-gradient-bg: gradientBG var(--duration-gradient-bg) ease infinite;
```

### Cinematic Text Animation

The text scale animation creates a "noticeable jump then slow creep" effect:

```css
@keyframes text-scale-cinematic {
  0% { transform: scale(1); }
  20% { transform: scale(1.045); }      /* Quick initial jump */
  100% { transform: scale(1.09); }      /* Slow creep to final */
}
```

---

## Shadow & Elevation System

### Dynamic Shadow Opacity

Shadows use variable alpha values that adapt between light and dark modes:

```css
/* Light Mode - Subtle, low opacity */
--shadow-alpha-xs: 0.05;
--shadow-alpha-md: 0.10;
--shadow-alpha-xl: 0.25;

/* Dark Mode - Fully opaque for hard edges */
--shadow-alpha-xs: 1;
--shadow-alpha-md: 1;
--shadow-alpha-xl: 1;
```

### Shadow Scale

| Token | Light Mode | Dark Mode | Use Case |
|-------|-----------|-----------|----------|
| `--shadow-2xs` | `0px 1px 0px 0px` | Full opacity | Hairline dividers |
| `--shadow-xs` | `0px 1px 2px 0px` | Full opacity | Subtle elevation |
| `--shadow-sm` | `0px 1px 2px 0px` | Full opacity | Base cards |
| `--shadow` | `0px 1px 3px + 0px 1px 2px` | Full opacity | Default elevation |
| `--shadow-md` | `0px 4px 6px -1px + 0px 2px 4px` | Full opacity | Dropdown menus |
| `--shadow-lg` | `0px 10px 15px -3px + 0px 4px 6px` | Full opacity | Modals |
| `--shadow-xl` | `0px 20px 25px -5px + 0px 8px 10px` | Full opacity | Heavy overlays |
| `--shadow-2xl` | `0px 25px 50px -12px` | Full opacity | Dialogs |

### Cinematic Glass Card Shadows

Used for the `.card-cinematic-glass` component:

```css
/* Light Mode */
--shadow-glass-rim: inset 0 1px 20px color-mix(in srgb, white, transparent 70%);    /* Top light rim */
--shadow-glass-inner: inset 0 2px 20px -3px color-mix(in srgb, rgb(95,95,95), transparent 70%); /* Inner shadow */
--shadow-glass-reflect: inset 0 -2px 0px 0px var(--border-glass);                     /* Bottom rim */
--shadow-glass-drop: 0 5px 5px -2px color-mix(in srgb, black, transparent 60%);      /* External depth */

/* Dark Mode */
--shadow-glass-rim: inset 0 1px 0px color-mix(in srgb, white, transparent 70%);
--shadow-glass-inner: inset 0 10px 20px 5px color-mix(in srgb, black, transparent 70%);
--shadow-glass-reflect: inset 0 -2px 20px 0px var(--border-glass);
--shadow-glass-drop: 0 12px 24px -8px color-mix(in srgb, black, transparent 50%);
```

---

## Component Classes

### Cinematic Glass Card

The signature component with layered glass effects:

```css
.card-cinematic-glass {
  background: color-mix(in srgb, var(--card), transparent 15%);
  backdrop-filter: blur(16px) saturate(180%);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-glass);
  box-shadow:
    var(--shadow-glass-rim),
    var(--shadow-glass-inner),
    var(--shadow-glass-reflect),
    var(--shadow-glass-drop);
  transition:
    transform var(--duration-base) ease,
    border-color var(--duration-fast) ease;
}

.cinematic-glass-card:hover {
  border-color: var(--border-glass-hover);
  transform: translateY(-2px);
}
```

### Gradient Border

For cards with gradient top/bottom borders:

```css
.border-gradient {
  position: relative;
  background-clip: padding-box;
  border: 1px solid transparent;
}

.border-gradient::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  margin: -1px;
  border-radius: inherit;
  background: linear-gradient(to bottom, var(--border-gradient-start), var(--border-gradient-end));
}
```

### Cinematic Button

Button with text scaling animation on hover:

```css
.btn-cinematic {
  display: inline-block;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  transition: transform var(--duration-slow) var(--ease-out-expo);
  will-change: transform;
}

.btn-cinematic-text {
  display: inline-block;
  will-change: transform;
  transition: transform var(--duration-medium) var(--ease-out-cubic);
}

.btn-cinematic:hover .btn-cinematic-text {
  animation: var(--animate-text-scale-cinematic);
}
```

### Elevation Utilities

Interactive overlays for hover/active/toggle states:

```css
/* Toggle states (persists until clicked again) */
.toggle-elevate,
.toggle-elevate-2 {
  position: relative;
  z-index: 0;
}

.toggle-elevate.toggle-elevated::before {
  background-color: var(--elevate-2);
}

/* Hover states (only while hovering) */
.hover-elevate::after,
.active-elevate::after {
  content: "";
  position: absolute;
  inset: 0px;
  border-radius: inherit;
  z-index: 999;
}

.hover-elevate:hover::after {
  background-color: var(--elevate-1);
}

.hover-elevate-2:hover::after {
  background-color: var(--elevate-2);
}

/* Escape hatch for custom hover behavior */
.no-default-hover-elevate {}
.no-default-active-elevate {}
```

### Layout Rhythm Utilities

```css
/* Content and inline gaps */
.content-gap { gap: var(--gap-content); }    /* 1.2em */
.inline-gap { gap: var(--gap-inline); }       /* 0.7em */

/* Header and tab padding */
.header-padding { padding-top/bottom: var(--padding-header-y); }  /* 1.5em */
.tab-padding { padding-top/bottom: var(--padding-tab-y); }       /* 1.3em */
```

### Canvas Node States

For React Flow graph nodes:

```css
.node {
  border-width: 2px;
  border-color: var(--elevate-1);
}

.node:hover {
  border-color: var(--elevate-2);
}

.node-selected {
  border-color: var(--elevate-3);
  box-shadow: var(--shadow-glass-drop);
  z-index: 10;
}

.node-selected:hover {
  border-color: var(--elevate-4);
}
```

### React Flow Edge Animations

```css
@keyframes flow-dash {
  to { stroke-dashoffset: -20; }
}

.react-flow__edge-path {
  stroke-linecap: round;
}

.react-flow__edge.animated .react-flow__edge-path {
  stroke-dasharray: 8 4;
  animation: flow-dash 0.8s linear infinite;
}

.react-flow__edge.forward-flow .react-flow__edge-path {
  animation-direction: normal;
}

.react-flow__edge.backward-flow .react-flow__edge-path {
  animation-direction: reverse;
  stroke: #f59e0b;  /* Amber tint for pull indicators */
}

.react-flow__edge.selected .react-flow__edge-path {
  stroke-width: 3;
}

/* Pending changes overlay */
.edge-confirming-overlay {
  stroke-dasharray: 5 5;
  animation: dashdraw 0.5s linear infinite;
  stroke: white;
  opacity: 0.8;
}
```

---

## Border Radius Scale

```css
--radius-none: 0rem;
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.375rem;   /* 6px */
--radius-lg: 0.5rem;     /* 8px */
--radius-xl: 0.75rem;    /* 12px */
--radius-2xl: 1rem;      /* 16px */
```

---

## Layout System

### Spacing Primitives

Use Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16.

### Grid Structure

- **Storyboard cards**: 3-column grid (`lg:grid-cols-3`)
- **Metadata pairs**: 2-column grid (`md:grid-cols-2`)
- **Performance stats**: 4-column grid (`lg:grid-cols-4`)
- **Detail panels**: 70/30 split (video preview / metadata sidebar)

### Container Strategy

- Full-width app with `max-w-screen-2xl` for ultra-wide displays
- Animated gradient background (subtle, continuous movement)
- Dense padding: `px-4 py-3` for main containers
- Nested cards use `p-3` for compact information display

---

## Component Library

### Navigation & Structure

- **Top Bar**: Fixed header with project selector, user menu, global actions (`h-14`)
- **Side Panel**: Collapsible navigation (`w-64` expanded, `w-16` collapsed)
- **Tab Navigation**: For switching between Storyboard, Scenes, Metrics, Characters, Locations views

### Data Display Components

**Scene Cards**: Compact cards showing:
- Scene ID badge (top-left, small pill)
- Shot type and duration (header row)
- Video thumbnail with play overlay (16:9 aspect ratio)
- Inline metadata grid: camera movement, lighting, mood (2-column, text-xs)
- Quality score bar (horizontal, color-coded)
- AssetStatus indicator (pulsing dot for generating, checkmark for complete)

**Timeline Visualization**:
- Horizontal scrollable timeline showing all audio segments
- Height: `h-24`, segments as colored blocks with duration labels
- Lyric overlay on hover, transition markers between segments

**Metrics Dashboard**:
- Stat cards in 4-column grid: Avg Attempts, Quality Trend, Total Duration, Rules Added
- Large number (`text-3xl`), label below (`text-xs`)
- Sparkline charts showing trends (compact, `h-12`)

**Quality Evaluation Panel**:
- Horizontal score bars for each dimension (narrativeFidelity, characterConsistency, etc.)
- Rating badges (PASS=green, MINOR_ISSUES=yellow, MAJOR_ISSUES=orange, FAIL=red)
- Expandable issue list with severity icons and timestamps

**Reference Image Gallery**:
- Masonry grid for character/location reference images (`grid-cols-2 md:grid-cols-3`)
- Image cards with overlay text showing ID and name
- State tracking indicators (last seen scene, current appearance notes)

### Interactive Elements

**Status Indicators**:
- Pulsing animation for "generating" state (`animate-pulse` on status dot)
- Progress bars with percentage (`h-2`, `rounded-full`)
- Toast notifications for errors/warnings (fixed bottom-right, stack vertically)

**Action Buttons**:
- Primary: Solid background (`--primary`), medium size (`px-4 py-2`)
- Secondary: Outline style with `border` utility
- Icon-only: Square (`w-8 h-8`) for compact toolbars

**Cinematic Button Effects**:
- Text scales up subtly on hover (`--animate-text-scale-cinematic`)
- Smooth transform transitions using `--ease-out-expo`

**Form Inputs** (when needed for prompts):
- Textarea with character count (`h-32` for creative prompts)
- Dropdown selects for duration, shot type (`h-10`)
- File upload dropzone for audio (`border-dashed`, `h-40`)

---

## Real-Time Update Patterns

### Loading States

- Skeleton screens for scene cards during initial load (`animate-pulse` on empty cards)
- Inline spinners for individual scene generation (`w-4 h-4` next to scene ID)
- Progress bars showing completion percentage for pipeline steps

### WebSocket Status

- Connection indicator in top bar (green dot = connected, red = disconnected)
- Message queue display showing recent events (scrollable list, `max-h-32`, `text-xs`)

### Error Display

- Error cards with red left border (`border-l-4`)
- Expandable stack trace for technical details
- Dismissible toast notifications for transient errors

---

## Visual Hierarchy & Density

### Card Elevation

Use the elevation system with glass morphism:

- **Base**: `.card-cinematic-glass` with layered shadows
- **Hover**: `.cinematic-glass-card:hover` with translateY(-2px) lift
- **Interactive States**: `.hover-elevate`, `.active-elevate`, `.toggle-elevate`

### Border Strategy

- Glass borders (`--border-glass`) for cinematic cards
- Subtle borders (`border border-border`) for standard card separation
- Thicker accent borders (`border-l-4`) for status/severity indicators
- No borders on main containers, rely on spacing and background differentiation

### Whitespace Management

- Tight line-height (`leading-tight`, `leading-snug`) for dense data
- Consistent `gap-3` or `gap-4` between related elements
- Layout rhythm utilities for header/tab padding
- Generous `gap-8` between major sections

---

## Global Styles

### Lucide Icons

```css
svg.lucide {
  stroke-width: var(--icon-stroke-width) !important;  /* 1.5px */
  stroke-linecap: square !important;
  stroke-linejoin: miter !important;
}
```

### Body Styles

**Client App**:
```css
body {
  @apply font-sans antialiased bg-background text-foreground text-xs cursor-default select-none;
  overscroll-behavior: none;
}
```

**Website**:
```css
body {
  @apply text-base bg-background font-normal text-foreground antialiased overflow-x-hidden font-sans;
  font-feature-settings: "rlig" 1, "calt" 1;
}
```

### Placeholder Styling

```css
[contenteditable][data-placeholder]:empty::before {
  content: attr(data-placeholder);
  color: var(--muted-foreground);
  pointer-events: none;
}
```

---

## Accessibility & Responsiveness

- Maintain ARIA labels for all interactive elements
- Keyboard navigation: Tab through scenes, Enter to expand details
- Focus indicators: Use `ring` utility with `--ring` token
- Mobile: Stack cards vertically, collapsible panels become drawers
- Tablet: 2-column grids, side panel overlays instead of fixed
- Desktop: Full 3-4 column layouts, persistent navigation

---

## Animation Guidelines

**Cinematic Animations**:

- Cinematic text scaling on button hover (`--animate-text-scale-cinematic`)
- Background gradient animation (`--animate-gradient-bg`, 15s loop)
- Accordion expand/collapse (`--animate-accordion-down/up`)
- Card lift on hover with border color transition

**Functional Animations**:

- Loading spinners for async operations (`animate-spin`)
- Pulsing dots for "generating" status (`animate-pulse`)
- Smooth transitions for panel collapse/expand (`transition-all duration-200`)
- React Flow edge animations for pipeline flow visualization

**Principle**: Every animation serves functional feedback or enhances state communication. Decorative animations use the cinematic easing curves for premium feel.
