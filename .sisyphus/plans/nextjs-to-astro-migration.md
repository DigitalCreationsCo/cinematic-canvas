# Next.js to Astro Migration Work Plan

**Objective**: Refactor Next.js website into Astro-based React website with high performance and static generation.

---

## Phase 1: Project Setup

### Task 1.1: Initialize Astro Project
- Create new Astro project in **`website/`** directory (NEW directory, not root)
- Install dependencies:
  - `@astrojs/react` - React integration
  - `@astrojs/tailwind` - Tailwind CSS
  - `tailwindcss` - v4
  - `@astrojs/mdx` - MDX support for docs
  - `clsx`, `tailwind-merge` - Utility functions (from old-website)
- Initialize git repository

### Task 1.2: Configure Astro
- Create `astro.config.mjs` with:
  - React integration
  - Tailwind integration
  - MDX integration
  - Output: 'static'
  - Build format: 'directory'
- Configure `tsconfig.json` for Astro + React

---

## Phase 2: Design System & Styles

### Task 2.1: Copy Design System CSS
- Copy `src/shared/design-system/index.base.css` → `src/styles/index.base.css`
- Copy `src/shared/design-system/cinematic.css` → `src/styles/cinematic.css`
- Create `src/styles/global.css`:
  ```css
  @import "./index.base.css";
  @import "./cinematic.css";
  @import "tailwindcss";
  @plugin "@tailwindcss/typography";
  ```

### Task 2.2: Configure Tailwind Theme
- Update tailwind config to reference design tokens
- Add custom utilities for font-heading, font-sans, font-mono
- Verify CSS variables work correctly

---

## Phase 3: Base Components & Layout

### Task 3.1: Create Base Layout
- Create `src/layouts/BaseLayout.astro`
- Include:
  - `<head>` with metadata, fonts
  - Global CSS import
  - `<slot />` for content

### Task 3.2: Create Navigation Component (Astro)
- Create `src/components/Navigation.astro`
- Port from old-website `components/header.tsx`
- Make static where possible
- Use client-side script for scroll detection

### Task 3.3: Create Footer Component (Astro)
- Create `src/components/Footer.astro`
- Port from old-website `components/navigation/footer.tsx`

---

## Phase 4: Homepage Migration

### Task 4.1: Create Homepage Structure
- Create `src/pages/index.astro`
- Include all static sections:
  - Hero section with background effects
  - Feature showcase (6 feature cards)
  - Demo/workspace preview
  - Workflow section (5 steps)
  - Testimonials carousel
  - Comparison table
  - Pricing section (3 tiers)
  - CTA section

### Task 4.2: Create Interactive React Components
- **CustomCursor** (`src/components/react/CustomCursor.tsx`):
  - Port from `components/custom-cursor.tsx`
  - Use `client:load`
- **CounterAnimation** (`src/components/react/Counter.tsx`):
  - Animate numbers on scroll
  - Use `client:visible`
- **ScrollReveal** (`src/components/react/ScrollReveal.tsx`):
  - Intersection Observer for reveal animations
  - Use `client:idle`

### Task 4.3: Hook Up Interactive Components
- Import and use React components in homepage with appropriate client directives
- Verify animations work correctly

---

## Phase 5: Updates/Blog Page

### Task 5.1: Create Updates Page Structure
- Create `src/pages/updates/index.astro`
- Layout: header, filter bar, updates grid, signup bar, changelog

### Task 5.2: Create Filter Component (React)
- Create `src/components/react/UpdateFilter.tsx`
- Categories: All, Features, AI Improvements, Performance, Exports, Collaboration, Bug Fixes
- Use `client:load`

### Task 5.3: Port Update Cards
- Port `components/update-card.tsx` to React
- Create mock data for updates (v2.4.0, v2.3.0, v2.2.0, etc.)

---

## Phase 6: Docs Page (Content Collections)

### Task 6.1: Set Up Content Collections
- Create `src/content/config.ts`
- Define docs collection schema:
  ```typescript
  defineCollection({
    type: 'content',
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      order: z.number().optional(),
    })
  })
  ```

### Task 6.2: Copy Docs Content
- Copy MDX files from `old-website/content/docs/` to `src/content/docs/`
- Or create placeholder docs

### Task 6.3: Create Docs Layout
- Create `src/layouts/DocsLayout.astro`
- Include sidebar navigation
- Table of contents component

### Task 6.4: Create Docs Pages
- Create `src/pages/docs/[...slug].astro`
- Use `getStaticPaths` to generate all doc pages
- Render MDX content

---

## Phase 7: Gallery Page

### Task 7.1: Create Gallery Page Structure
- Create `src/pages/gallery.astro`
- Layout: header, gallery grid

### Task 7.2: Create Video Modal (React)
- Create `src/components/react/VideoModal.tsx`
- Features:
  - Full-screen modal
  - Media Chrome video player
  - Keyboard navigation (arrow keys, escape)
  - Previous/Next navigation
- Use `client:load`

### Task 7.3: Port Gallery Data
- Copy example videos from old-website
- Create EXAMPLES constant with thumbnails and video URLs

---

## Phase 8: Build & Verification

### Task 8.1: Run Build
- Run `npm run build`
- Verify no errors

### Task 8.2: Verify Static Output
- Check `dist/` directory for:
  - HTML files for all routes
  - CSS assets
  - JavaScript bundles (should be minimal)

### Task 8.3: Test Pages
- Verify homepage renders correctly
- Verify updates page with filtering works
- Verify docs navigation works
- Verify gallery modal opens/closes

---

## Key Implementation Notes

### Client Directives Strategy
- `client:load` - Custom cursor, video modal, filter buttons
- `client:visible` - Counter animations
- `client:idle` - Scroll reveal animations
- Static where possible - Header (scroll only), Footer, Most content

### Dependencies to Install
```json
{
  "dependencies": {
    "@astrojs/react": "^4.x",
    "@astrojs/tailwind": "^6.x",
    "@astrojs/mdx": "^4.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "tailwindcss": "^4.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "lucide-react": "^0.400+"
  }
}
```

### File Mapping (Old → New)
- `app/layout.tsx` → `src/layouts/BaseLayout.astro`
- `app/page.tsx` → `src/pages/index.astro`
- `app/updates/page.tsx` → `src/pages/updates/index.astro`
- `app/docs/page.tsx` → `src/pages/docs/[...slug].astro`
- `app/gallery/page.tsx` → `src/pages/gallery.astro`
- `components/header.tsx` → `src/components/Navigation.astro`
- `components/navigation/footer.tsx` → `src/components/Footer.astro`
- `components/custom-cursor.tsx` → `src/components/react/CustomCursor.tsx`

---

## Acceptance Criteria

1. ✅ All 4 pages render correctly (/, /updates, /docs, /gallery)
2. ✅ Homepage animations work (scroll reveal, counters)
3. ✅ Updates filtering works
4. ✅ Docs navigation works with sidebar
5. ✅ Gallery video modal opens/closes with keyboard
6. ✅ Build produces static HTML (no SSR)
7. ✅ JavaScript is minimal - only loaded where needed
8. ✅ Same visual design as old website