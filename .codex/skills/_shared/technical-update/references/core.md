# Cinematic Canvas technical update workflow

Use this workflow unless the user explicitly narrows the request to one part of it.

## 1. Gather context

1. Review recent repo activity.
   - Prefer `git log --since "1 week ago"` or a window anchored to the most recent published update.
   - Refresh remote refs only if the user wants remote freshness and permissions allow it.
2. Read the previous weekly update in `website/content/updates/` to maintain continuity.
3. Update `CHANGELOG.md` with the most meaningful commits since the date of the latest published update.
   - Do not duplicate entries already in the changelog.
   - Keep entries in descending date order.
   - Maintain a rolling 30-day / 4-week window.

## 2. Draft the document

- Keep the update under 1200 words unless the user asks otherwise.
- Write for technical product builders, creators, and cinema fans.
- Use product-centric language. Make **Cinematic Canvas** the subject of the action.
- Lead with creator benefit. If a detail does not materially improve the creator experience, leave it out.
- Support each claim with proof. Explain how the change directly helps the creator.
- Use punchy lead-ins, bold sub-labels for technical specs, and concise bullet points.
- Include quantitative benefits only when they are backed by real data.
- Bold every mention of **Cinematic Canvas**.
- Italicize specific in-product systems or components like _AssetHistoryPicker_ or _@Mention System_.

## Required conclusion

After `## What's Shipping Next`, write a 3-paragraph conclusion that blends principal-engineer precision with cinematic world-building:

1. **The Philosophy:** connect the week's technical theme to creator workflow or storytelling craft.
2. **The Direct Impact:** anchor the reflection in the shipped changes and end the paragraph with this exact sentence: `We are building the studio for digital storytelling.`
3. **The Sign-off:** close warmly, reiterate the mission, and thank the community for building alongside the team.

## Output structure

Use this exact skeleton:

```markdown
---
title: "[Title summarizing the featureset]"
authors: [bryant]
date: YYYY-MM-DD
description: "[Stylized one-liner theme (for example: Architecting The Parallel Studio)]"
coverImage: "/images/[filename].png"
---

## [Document Title]

[Paragraph 1: Outline the problem addressed.]
_[One-line hook statement or question central to the problem.]_
[Paragraph 2: Explain the implications and benefits of the solution.]
[Paragraph 3: **Cinematic Canvas** introduces or enhances the main update and summarizes the outcome.]

![[Cover Image Alt Text]](/images/[filename].png)
*[Cover Image Caption]*

### What is Cinematic Canvas?
[Core project description outlining purpose, constraints, and goals]

[Technology Stack Summary]

## What's New: [Broad Title Summary]
[Paragraph 1: Outline previous progress or context.]
[Paragraph 2: State the direct creator benefit of this update set.]

---

## 1. [Update Title]
[Detailed technical description body. Use bolded sub-labels such as Syncing or Performance.]

![[Diagram Alt Text]](/images/[filename].png)
*[Contextual image caption explaining the technical relationship]*

**The Result:** [Concise statement describing how this improves the creator experience.]

---

## 2. [Update Title]
[Repeat structure: description -> image -> The Result]

---

## 3. [Update Title]
[Repeat structure: description -> image -> The Result]

## What's Shipping Next
[Description of next planned enhancements]
* **[Feature #1 Title]:** [Description]
* **[Feature #2 Title]:** [Description]
* **[Feature #3 Title]:** [Description]

---

[Paragraph 1: The Philosophy]
[Paragraph 2: The Direct Impact. End with: "We are building the studio for digital storytelling."]
[Paragraph 3: The Sign-off]
**Read the full changelog:** [github.com/digitalcreationsco/cinematic-canvas/blob/main/CHANGELOG.md](https://github.com/digitalcreationsco/cinematic-canvas/blob/main/CHANGELOG.md)

Thank you for building with us.

[Up to 8 hashtags]
```

## 3. Visual assets

Generate 4 images: 1 cover image and 3 technical graphics.

- Use the `brand-aware-nano-banana` skill for image generation.
- Place generated assets in `website/public/images/`.
- Refer to them in the document as `/images/[filename]` with the correct extension.

### Cover image rules

- Make the cover image visually striking, like a dramatic still pulled from the middle of a masterfully shot scene.
- The image can connect directly to the week's technical theme, but it does not have to.
- Append these terms to the cover image prompt: `cinematic still, 1970's camera view, Atmospheric, film grain`
- Add a bold aesthetic description such as `post-modern noir`, `golden age`, `far tech`, `exploration`, or `wilderness`.
- Do not use the words `cinema`, `film`, or `director` as the subject framing for the image request.
- Avoid cluttered, dirty, or disorganized spaces. Avoid trash. Only include cigarettes when they clearly serve an intentional luxurious or dramatic composition.

### Technical graphics

Read the diagram-style reference selected by the active skill before generating the 3 technical graphics.

### Fail-safe

If the image tool fails:

- Keep the image markdown, captions, and expected file paths in the document as placeholders.
- Return the image prompts to the user.

For each image, define:

```json
{
  "image_content": "[Description]",
  "prompt": "[Style and lighting instructions]",
  "placement": "[Heading]",
  "img": "/images/[filename].png",
  "caption": "[Contextual technical caption]"
}
```

## 4. Finalization

- Review every direct-benefit statement for clarity and evidence.
- When the task includes publication, update the changelog, weekly update, and image assets together.
- Commit and push only if the user asked for it or the current workflow explicitly includes publication.
- Return a 200-character preview post for a social thread plus a one-line summary of the main improvements.
