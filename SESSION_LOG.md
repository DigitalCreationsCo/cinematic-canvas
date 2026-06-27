# Session Log

## Goal
- Implement scroll-controlled video sequencing for feature cards with visible opacity crossfade, AND add a scroll-controlled workflow step sequencer with horizontal step reveal and per-step connected content.

## Constraints & Preferences
- **Features**: scroll hijacks track, one shared `<video>` reused across cards, opacity transitions must visibly animate (150ms), all videos preloaded, extensible via `data-video` attrs, must not break hero/CTA video play/pause.
- **Workflow**: start with step 1 visible, scrolling advances steps one at a time, steps in a single horizontal row (overflow hidden, even on mobile), unique connected content per step that crossfades, normal scroll resumes after last step.
- `.editor-root .hero-grain { opacity: 0.5 }` (0,2,0) beats `.feature-card-video { opacity: 0.35 }` (0,1,0) in specificity — actual resting opacity is 0.5.
- The shared video player gets BOTH classes: `feature-card-video hero-grain`.

## Progress
### Done
- Rebuilt index.astro with scroll-track architecture for both features and workflow sections.
- Feature grid: 2-column CSS grid with `translateY()` at row boundary.
- Shared video player: created once, moved via `card.prepend(player)`, source swapped on activation.
- State machine with `isTransitioning` guard and `pendingIndex` catch-up for rapid scrolling.
- All videos preloaded via `<link rel="preload">` injection loop.
- **Opacity Transition Fix (Round 1)**: replaced all `removeProperty("opacity")` with explicit `RESTING_OPACITY = "0.5"` constant; added `void player.offsetHeight` reflow trigger.
- **Opacity Transition Fix (Round 2)**: replaced CSS-transition fade-in with manual `requestAnimationFrame` interpolation (`animateOpacity()`) — CSS transitions are unreliable after DOM moves (`prepend()`) because the browser may not paint the starting opacity state before the ending value is applied. Added 30ms safety buffer to fade-out timeout (`FADE_MS + 30`).
- Hover effect: `.feature-card:hover .feature-card-video { opacity: 0.55 !important; }`.
- **Workflow step sequencer**: `#workflow-track` + `#workflow-sticky` (scroll-hijacking), `#steps-row` with horizontal flex layout, `#connected-wrap` with per-step crossfade connected content (grid-area stacking + opacity transition).
- Per-step connected content: unique icon, title, description, and tag pills for each of 5 steps (Concept, Structure, Characters, Write, Export).
- **Fixed translation alignment bug**: changed from `stepsRow.parentElement.offsetWidth` (included parent padding, misaligned steps) to `steps[0].offsetWidth` (actual step rendered width).
- **Restructured steps row**: added `.steps-viewport` wrapper with `overflow: hidden` (separates clip from translate), `.steps-row` uses `width: max-content` + `display: flex` (no overflow — prevents flexbox clipping of non-visible steps).
- **Replaced `::before` pseudo-element line** with real `<div id="steps-line" class="steps-line">` element inside `.steps-row`. Width set in JS to `stepsRow.scrollWidth` (spans from first step's circle center to last step's circle center).
- **`--step-width` CSS variable**: each step's width matches the viewport container via `viewport.offsetWidth`, set in JS on init + on `resize`. Replaced brittle `100vw` usage.
- Removed old workflow reveal IntersectionObserver JS, CSS, `.workflow-steps` grid HTML, and `.workflow-reveal` class.

### Fixed — Mobile Workflow Sequencer (3 issues)
- **Removed `min-width: 100%` mobile CSS override** on `.steps-row .workflow-step` (line 1262-1264 of old code). This created a circular sizing dependency with `.steps-row { width: max-content }` — CSS couldn't resolve percentage-of-max-content, causing each step to be as wide as the entire row (5× viewport). After the first translate, no step content was visible in the viewport.
- **Changed sticky height to `100dvh`** with `100vh` fallback on both `.features-sticky` and `.workflow-sticky`. On iOS Safari, `100vh` includes the URL bar area, making the sticky element taller than the visible viewport. `100dvh` dynamically matches the actual visible area.
- **Changed track height to pixel values** (`NUM_STEPS × window.innerHeight` px instead of `NUM_STEPS × 100vh`). Avoids the iOS Safari `vh` URL-bar quirk where `100vh` ≠ visible viewport height. Merged into the existing `measure()` function so it recalculates on resize (orientation changes). Also added resize handler to the features sequencer.

### Blocked
- (none)

## Key Decisions
- Single shared `<video>` with `prepend()` repositioning — avoids redundant DOM and simplifies source management.
- `RESTING_OPACITY = "0.5"` used everywhere instead of `removeProperty` — avoids cascade specificity battle with `.hero-grain`.
- Fade-out uses CSS transition (element stays in old card, DOM position is stable). Fade-in uses manual rAF interpolation (reliable after DOM move).
- Workflow steps in a horizontal flex row with viewport wrapper (`overflow: hidden`) and `translateX` animation — enter stage right, exit left behavior for all steps.
- Connected content uses `display: grid; grid-area: 1 / 1` stacking for crossfade via CSS opacity transition.
- Gradient connecting line uses a real `<div>` element sized in JS to `stepsRow.scrollWidth` — spans from first step's circle to last step's circle.
- Step width set via `--step-width` CSS variable from JS — avoids circular dependency with `width: max-content` parent.

## Critical Context
- `.editor-root .hero-grain { opacity: 0.5 }` (0,2,0) beats `.feature-card-video { opacity: 0.35 }` (0,1,0). Player has both classes, so effective resting opacity is 0.5.
- Hover uses `!important` (0.55) to temporarily override inline JS opacity — intentional and acceptable.
- CSS transitions are unreliable after DOM `prepend()` moves — browser may not paint start state. rAF interpolation avoids this.
- Workflow steps row uses `.steps-viewport` (`overflow: hidden`) around `.steps-row` (no overflow, just flex + translate). This prevents flexbox from clipping non-visible steps.
- The gradient line is a real `<div id="steps-line">` inside `.steps-row`, with width set in JS to `stepsRow.scrollWidth`. Previously used `::before` with percentage positioning that only covered the first viewport.
- Hero and CTA videos use a separate IntersectionObserver for play/pause — independent of both sequencers.

## Relevant Files
- `/Users/vibrantceo/Projects/portals/website/src/pages/index.astro` — landing page with inline JS sequencers and CSS for both features and workflow sections.
- `/Users/vibrantceo/Projects/portals/src/shared/design-system/cinematic.css` — defines `.editor-root .hero-grain`, `.workflow-step`, `.step-circle`, `.step-title`, `.step-desc` and most cinematic component styles.
- `/Users/vibrantceo/Projects/portals/src/shared/design-system/index.base.css` — Tailwind base layer, CSS variables, `@apply bg-card/10` utilities.
