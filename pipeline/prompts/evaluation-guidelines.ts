/**
 * Enhanced evaluation guidelines for quality control
 * Addresses common failure patterns and semantic misunderstandings
 */

export const ISSUE_CATEGORIZATION_GUIDE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUE SEVERITY CLASSIFICATION GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL (severity: "critical") - Makes content UNUSABLE or breaks core narrative:
  ✓ Semantic misinterpretation (e.g., "barrel" of wave → physical pipe/tunnel)
  ✓ Character teleportation or impossible spatial jumps
  ✓ Character gender swap or complete appearance change
  ✓ Missing primary action specified in scene description
  ✓ Characters are entirely absent when they should be present
  ✓ Fundamental physics violations (water behaves like solid, gravity reversed)
  ✓ Scene makes no logical sense or is incomprehensible
  ✓ Technical artifacts that obscure entire frame (not localized glitches)

MAJOR (severity: "major") - Significantly impacts quality, immersion, or continuity:
  ✓ Wrong number of characters (4 instead of 5)
  ✓ Character holding wrong prop or missing critical prop
  ✓ Action direction reversed (running toward instead of away)
  ✓ Disjointed cuts or jarring transitions within scene
  ✓ Significant lighting discontinuity (day→night with no transition)
  ✓ Character facial features noticeably different from reference
  ✓ Wrong shot type (close-up when wide shot specified)
  ✓ Major composition errors (character cut off, poor framing)
  ✓ Persistent technical issues (banding, severe blur, low resolution)

MINOR (severity: "minor") - Noticeable but doesn't break immersion:
  ✓ Background elements missing (crowd layer absent)
  ✓ Accessory color wrong (yellow surfboard → white surfboard)
  ✓ Costume detail variation (long pants vs shorts)
  ✓ Hair shade slightly different
  ✓ Minor continuity errors (wet to dry transition too fast)
  ✓ Lighting slightly off from specification
  ✓ Framing not perfect but acceptable
  ✓ Small technical artifacts (localized blur, minor aliasing)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEMANTIC UNDERSTANDING CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When evaluating, verify NO semantic misinterpretations occurred:

SURFING CONTEXT:
  ❌ "barrel of the wave" → Physical blue tunnel/pipe on sand
  ✓ "barrel of the wave" → Hollow curved interior of breaking wave (water)

  ❌ "riding a wave" → Character sitting on stationary water
  ✓ "riding a wave" → Character surfing on moving, breaking wave

  ❌ "wipeout" → Character falling on sand
  ✓ "wipeout" → Character falling off board into water

MOTION CONTEXT:
  ❌ "sprinting into ocean" → Characters wading slowly/standing
  ✓ "sprinting into ocean" → Fast running motion toward water

  ❌ "running away from camera" → Running toward camera
  ✓ "running away from camera" → Backs visible, moving into distance

CHARACTER CONSISTENCY:
  ❌ "28-year-old man" → Female character appears
  ✓ "28-year-old man" → Male character with masculine features

  ❌ "Five surfers" → Four or six characters visible
  ✓ "Five surfers" → Exactly five distinct characters

SPATIAL LOGIC:
  ❌ Character teleports locations between frames
  ✓ Character movement follows physical possibility

  ❌ Character inside pipe (dry) → surfing on water (no transition)
  ✓ Continuous spatial progression through scene

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RATING THRESHOLDS FOR DIMENSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each dimension (narrativeFidelity, characterConsistency, etc.), use:

PASS:
  • Primary action/requirement is present and correct
  • No critical or major issues
  • Minor issues (if any) don't impact core functionality
  • Meets or exceeds specifications

MINOR_ISSUES:
  • Primary action/requirement is present but slightly off
  • No critical issues, only minor issues
  • Small deviations that don't break immersion
  • Core specifications met with room for improvement

MAJOR_ISSUES:
  • Primary action present but significantly flawed
  • OR one major issue present
  • Impacts quality/immersion but scene still usable
  • Specifications partially met with notable gaps

FAIL:
  • Primary action missing or completely wrong
  • OR one or more critical issues present
  • Scene is unusable or breaks narrative
  • Specifications fundamentally not met

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT CORRECTION PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When suggesting prompt corrections (promptCorrections field):

1. BE EXPLICIT ABOUT SEMANTICS:
   ❌ Vague: "barrel of the wave"
   ✓ Explicit: "the hollow, curved interior tunnel of water formed by a breaking wave (not a physical tunnel or pipe structure)"

2. SPECIFY EXACT COUNTS:
   ❌ Vague: "group of surfers"
   ✓ Explicit: "exactly five surfers, each clearly visible and distinguishable"

3. CLARIFY MOTION DIRECTION:
   ❌ Vague: "running into the ocean"
   ✓ Explicit: "sprinting away from camera toward the ocean, backs visible, forward momentum clear"

4. ANCHOR CHARACTER IDENTITY:
   ❌ Vague: "young person"
   ✓ Explicit: "28-year-old male with [specific features from reference], masculine build"

5. DEFINE SPATIAL RELATIONSHIPS:
   ❌ Vague: "characters together"
   ✓ Explicit: "five characters in single horizontal line, spaced 6 feet apart, positions maintained throughout"

6. ADD NEGATIVE CONSTRAINTS:
   ❌ Missing: "barrel of wave"
   ✓ Enhanced: "barrel of wave (hollow water tunnel, NOT a solid blue pipe, NOT an artificial structure)"

7. MAKE CORRECTIONS ADDITIVE, NOT REDUCTIVE:
   ❌ Bad: Remove details to simplify
   ✓ Good: Add specificity to eliminate ambiguity

   If prompt is getting shorter on corrections, you're likely REMOVING needed detail.
   Corrections should typically INCREASE prompt length by adding clarification.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRECTION EFFECTIVENESS ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If this is attempt 2 or 3, consider:

DECLINING QUALITY PATTERN:
If quality decreased from previous attempt:
  • Previous corrections may have been too aggressive
  • May have removed important context
  • Consider suggesting to RESTORE original context + ADD clarifications
  • Flag this in feedback

RECURRING ISSUE PATTERN:
If same issue appears across attempts:
  • Previous correction was ineffective or misunderstood
  • Suggest MORE EXPLICIT language with NEGATIVE constraints
  • Example: "NOT a pipe, NOT a tunnel, specifically a curved wall of water"

PROMPT LENGTH ANALYSIS:
  • Attempt 1: 11,670 chars, score 62.5%
  • Attempt 2: 11,076 chars (-594), score 76.0% ✓ (improved)
  • Attempt 3: 11,335 chars (+259), score 74.5% ✗ (declined)

  If length dramatically decreased AND quality declined:
    → Suggest more detailed corrections, not simplified ones

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERATION RULE SUGGESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Suggest a global generation rule (ruleSuggestion field) when:

✓ Same issue type appears in multiple scenes
✓ Fundamental misunderstanding of domain terms (surfing, medical, technical)
✓ Systematic character appearance drift
✓ Consistent spatial logic violations
✓ Recurring technical artifacts of same type

❌ DON'T suggest rules for:
  • Scene-specific content ("character should smile here")
  • One-off mistakes
  • Context-dependent decisions

✓ GOOD RULE EXAMPLES:
  • "All surfing terminology must be interpreted literally according to surfing domain: 'barrel' means hollow wave interior (water), 'ride' means active surfing motion, 'wipeout' means falling into water."
  • "Character counts must be exact and maintained throughout the scene. If '5 surfers' specified, exactly 5 distinct individuals must be visible in every frame."
  • "Character gender specifications are mandatory and immutable. Male characters must have masculine features throughout all scenes."
  • "All motion directions specified relative to camera ('toward', 'away', 'left', 'right') must be interpreted from camera's perspective and maintained consistently."
`;

export const EVALUATION_CALIBRATION_GUIDE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVALUATION CALIBRATION & CONSISTENCY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCORING MUST BE CONSISTENT:

narrativeFidelity (30% weight):
  • FAIL if primary action missing or fundamentally wrong
  • MAJOR_ISSUES if action present but significantly wrong (direction reversed, wrong participants)
  • MINOR_ISSUES if action correct but lacks nuance
  • PASS if action matches description and emotional beat

characterConsistency (25% weight):
  • FAIL if character gender wrong, unrecognizable, or completely absent
  • MAJOR_ISSUES if wrong number of characters or major appearance deviation
  • MINOR_ISSUES if accessory/detail wrong but character recognizable
  • PASS if character matches reference within reasonable tolerance

technicalQuality (20% weight):
  • FAIL if unwatchable due to artifacts, corruption, or resolution
  • MAJOR_ISSUES if persistent technical flaws throughout
  • MINOR_ISSUES if localized artifacts that don't break immersion
  • PASS if cinema-grade production quality

emotionalAuthenticity (15% weight):
  • FAIL if emotion completely wrong or nonexistent
  • MAJOR_ISSUES if emotion present but wrong type/intensity
  • MINOR_ISSUES if emotion slightly stilted but appropriate
  • PASS if genuine human emotional performance

continuity (10% weight):
  • FAIL if spatial impossibility or character teleportation
  • MAJOR_ISSUES if major continuity break (costume swap, lighting jump)
  • MINOR_ISSUES if minor continuity issue (wet→dry too fast)
  • PASS if logical progression from previous scene

OVERALL RATING CALCULATION:
  score = Σ(dimension_score × weight)
  where: PASS=1.0, MINOR_ISSUES=0.7, MAJOR_ISSUES=0.4, FAIL=0.0

  score >= 0.95 → ACCEPT
  0.90 <= score < 0.95 → ACCEPT_WITH_NOTES
  0.70 <= score < 0.90 → REGENERATE_MINOR
  score < 0.70 → FAIL

EXAMPLE SCORING:
  Scene with "barrel" → solid pipe:
    • narrativeFidelity: MAJOR_ISSUES (0.4) - semantic misinterpretation
    • characterConsistency: MAJOR_ISSUES (0.4) - wrong gender
    • continuity: FAIL (0.0) - teleportation
    • Overall: 0.4×0.3 + 0.4×0.25 + 1.0×0.2 + 1.0×0.15 + 0.0×0.1 = 0.57 = FAIL ✓

  Scene with minor issues:
    • narrativeFidelity: MINOR_ISSUES (0.7) - action slightly off
    • characterConsistency: MINOR_ISSUES (0.7) - wrong accessory color
    • technicalQuality: PASS (1.0)
    • emotionalAuthenticity: PASS (1.0)
    • continuity: PASS (1.0)
    • Overall: 0.7×0.3 + 0.7×0.25 + 1.0×0.2 + 1.0×0.15 + 1.0×0.1 = 0.835 = REGENERATE_MINOR ✓
`;
