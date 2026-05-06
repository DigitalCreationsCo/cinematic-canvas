# White skeuomorphic system diagram style

Reproduce the visual language of the reference authorization diagram exactly.

## Canvas and background

- White canvas (`#FFFFFF`) with no border or outer frame
- Subtle overall light
- No dark mode
- No gradients on the canvas itself

## Color palette

- Primary blue (fills, icons, arrows): `#4D8EF5`
- Secondary / lighter blue (panel headers, highlights): `#7AB3F8`
- Soft blue-grey (panel body backgrounds): `#EEF4FF`
- White (card interiors): `#FFFFFF`
- Dark label text: `#1A2B4A`
- Secondary / caption text: `#6B7FA3`
- Arrow stroke: `#4D8EF5`
- Drop shadow: `rgba(77, 142, 245, 0.12)` with soft, low-spread edges

## Panel and card anatomy

- Group related concepts inside rounded rectangle panels with `border-radius: 18px`
- Each panel should use:
  - a bold ALL CAPS header label in `#1A2B4A`
  - a `#EEF4FF` fill
  - a `1px` solid border at `rgba(77,142,245,0.2)`
- Inner cards should use:
  - white fill (`#FFFFFF`)
  - `border-radius: 12px`
  - the same soft blue drop shadow
- Cards may contain:
  - a blue-filled icon at top-center or left
  - 1 to 2 lines of label text in sentence case
  - an optional small monospaced code snippet block in light grey

## Icons

- Use simple, filled, single-color icons in `#4D8EF5`
- No outlines
- No multi-color icons
- Choose icon subjects that match the content:
  - locks for security or auth
  - database cylinders for storage
  - cloud shapes for object storage
  - API circles for service endpoints
  - person silhouettes for users
  - gear-plus-person for roles or teams
- Place icons on a soft `#EEF4FF` circular or square bubble

## Typography

- Font: Inter or an equivalent geometric grotesk
- No serif fonts
- No decorative fonts
- Panel headers: ALL CAPS, `font-weight: 700`, about `13px`, color `#1A2B4A`
- Card labels: sentence case, `font-weight: 600`, about `12px`, color `#1A2B4A`
- Sub-labels or captions beneath cards: `font-weight: 400`, about `10px`, color `#6B7FA3`, centered
- Code snippets: monospaced, about `9px`, color `#4D8EF5`, on a `#F0F4FF` background block

## Arrows and connectors

- All arrows should be directional with a single filled blue arrowhead
- Use `#4D8EF5` and a `2px` stroke
- Use straight or right-angled connector lines only
- Do not use curved or bezier paths
- Use short inline connector labels such as `Pass`, `Deny`, or `Authenticated Token`
- Connector labels should use `font-weight: 500`, about `10px`, color `#6B7FA3`

## Layout

- Use left-to-right flow for sequential or pipeline diagrams
- Use top-to-bottom flow for hierarchical diagrams
- Keep generous whitespace between panels
- Do not crowd the composition
- Cap each graphic at about 5 to 6 named nodes
- If more are needed, group them inside a labeled panel instead of adding more loose nodes
- No decorative elements
- No gradients
- No text shadows
- No photographic textures
- Proofread every text label before output
- Do not mention "Google"
