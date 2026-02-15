# Industrial Minimalist Design System Implementation

## Overview
Complete redesign of the Cinematic Canvas application client and documentation website following an **Industrial-Minimalist** aesthetic with sharp edges, hairline dividers, slim timelines, and a modular grid system.

---

## Typography System

### Font Stack
- **Headings**: Zalando Sans Expanded - Weight 400, tracking wide, capitalize
- **Body/Subheadings**: Host Grotesk - Weight 400
- **Technical Labels/Mono**: IBM Plex Mono - Weight 400/500/600

### Implementation
- **Client**: Google Fonts loaded via `index.html`
- **Docs**: Next.js `next/font/google` in `layout.tsx`

### CSS Variables
```css
--font-sans: Host Grotesk, sans-serif
--font-mono: IBM Plex Mono, monospace
--font-heading: Zalando Sans Expanded, sans-serif
```

---

## Color System

### Dark Mode (Default)
```css
--background: 0 0% 4%        /* #0a0a0a - Near black */
--foreground: 0 0% 95%       /* #f2f2f2 - Off white */
--card: 0 0% 6%              /* #0f0f0f - Slightly lighter */
--border: 0 0% 16%           /* #292929 - Visible hairline */
--muted: 0 0% 12%            /* #1f1f1f */
--muted-foreground: 0 0% 60% /* #999999 */
--accent: 0 0% 15%           /* #262626 */
--primary: 0 0% 98%          /* #fafafa */
```

### Light Mode
```css
--background: 0 0% 98%       /* #fafafa */
--foreground: 0 0% 5%        /* #0d0d0d */
--card: 0 0% 100%            /* #ffffff */
--border: 0 0% 85%           /* #d9d9d9 */
--muted: 0 0% 94%            /* #f0f0f0 */
--muted-foreground: 0 0% 45% /* #737373 */
--accent: 0 0% 90%           /* #e5e5e5 */
--primary: 0 0% 9%           /* #171717 */
```

---

## Shape & Spacing

### Border Radius
**All corners are sharp (0rem)**:
```javascript
borderRadius: {
  lg: "0rem",
  md: "0rem",
  sm: "0rem",
  xl: "0rem",
  "2xl": "0rem",
  DEFAULT: "0rem",
}
```

### Spacing Scale
- **Vertical**: Medium-high (4) - Generous breathing room
- **Horizontal**: Medium (2) - Efficient use of space
- **Component padding**: Compact (p-2) for information density

---

## Component Updates

### SceneCard.tsx
- Sharp corners (border-radius: 0)
- Semi-transparent card background (`bg-card/50 backdrop-blur-sm`)
- Hairline borders (`border-border/40`)
- Compact header with uppercase tracking
- Technical details grid with mono font
- Overlay effects on hover
- Industrial play button styling

### Timeline.tsx
- Slimmed height from `h-20` to `h-12`
- Sharp segment edges
- Grayscale images with color on hover
- Bold mono typography for scene numbers
- Technical tooltip styling

### PipelineHeader.tsx
- Backdrop blur effect
- Hairline divider with 60% opacity
- Mono uppercase labels
- Sharp buttons with tracking
- Vertical separators between sections

### StatusBadge.tsx
- Sharp corners
- Mono uppercase text
- Compact sizing (h-4/h-5)
- Tight tracking

### Dashboard Tabs
- Sharp tab triggers
- Mono uppercase labels
- Muted background for list
- No shadow on active state

---

## Documentation Site Updates

### Layout (layout.tsx)
- Host Grotesk, IBM Plex Mono, Zalando Sans Expanded fonts
- Dark mode as default
- Sharp edges throughout

### Header (header.tsx)
- Sticky with backdrop blur
- Mono uppercase navigation
- Hairline border

### Theme Toggle (theme-toggle.tsx)
- Sharp square button
- Reduced size (h-9 w-9)
- Border styling

### Home Page (page.tsx)
- Heading font styling
- Mono uppercase buttons
- Generous spacing

---

## Files Modified

### Client (`src/client/`)
1. `tailwind.config.ts` - Border radius, font families
2. `src/index.css` - CSS variables, color system
3. `index.html` - Font imports
4. `src/lib/store.ts` - Dark mode default
5. `src/components/SceneCard.tsx` - Card redesign
6. `src/components/Timeline.tsx` - Timeline redesign
7. `src/components/PipelineHeader.tsx` - Header redesign
8. `src/components/StatusBadge.tsx` - Badge styling
9. `src/pages/Dashboard.tsx` - Tabs styling

### Documentation (`cinematic-canvas-docs/`)
1. `app/layout.tsx` - Fonts, theme default
2. `app/globals.css` - CSS variables
3. `components/header.tsx` - Header styling
4. `components/theme-toggle.tsx` - Button styling
5. `app/page.tsx` - Home page styling

---

## Design Principles Applied

1. **Sharp Edges**: Zero border radius throughout
2. **Hairline Dividers**: Subtle 1px borders at 40-60% opacity
3. **Slim Timelines**: Reduced height, efficient space usage
4. **Modular Grid**: Information-dense layouts with clear separation
5. **Semi-transparent Overlays**: Backdrop blur and opacity layers
6. **Vertical Rhythm**: Medium-high spacing (4) for readability
7. **Horizontal Efficiency**: Medium spacing (2) for density
8. **Typography Hierarchy**:
   - Headings: Zalando Sans Expanded, capitalize, wide tracking
   - Body: Host Grotesk
   - Technical: IBM Plex Mono, uppercase
9. **No Uppercase**: Capitalize used instead (per requirements)
10. **Quick Animations**: Fast, responsive transitions

---

## Theme Configuration

### Client
- Dark mode default in store (`isDark: true`)
- CSS class toggled on document root

### Documentation
- Dark mode default in ThemeProvider (`defaultTheme="dark"`)
- `enableSystem: false` to enforce default

---

## Verification

All changes have been:
- TypeScript type-checked
- Following industrial-minimalist aesthetic
- Unified across client and documentation
- Defaulting to dark mode
- Using specified font stack
- Implementing sharp edges (0 radius)
