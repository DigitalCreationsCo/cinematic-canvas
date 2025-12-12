/**
 * Preset generation rules for common domains and quality issues
 * These can be automatically added based on script content or proactively included
 */

export const DOMAIN_SPECIFIC_RULES = {
  surfing: [
    "SURFING TERMINOLOGY: 'barrel' or 'tube' refers to the hollow curved interior of a breaking wave (liquid water forming a tunnel), NOT a physical pipe or solid structure. 'Riding' means actively surfing on moving water, NOT sitting stationary. 'Wipeout' means falling into water, NOT falling on sand.",
    "SURFING ACTIONS: 'Paddling out' shows arms moving in water, 'catching a wave' shows transition from paddling to standing, 'riding' shows active balance and movement on board. All actions must show interaction with liquid water.",
    "OCEAN PHYSICS: Waves are liquid water in motion. Water is translucent/reflective, NOT solid blue or opaque. Breaking waves create spray and foam. Surfboards float on water surface, NOT above or below it artificially."
  ],

  sports: [
    "MOTION AUTHENTICITY: Sports actions (running, jumping, throwing) must show authentic biomechanics with appropriate muscle tension, weight distribution, and momentum. No floating, hovering, or physics-defying poses.",
    "EQUIPMENT HANDLING: Sports equipment must be held and used correctly (proper grip, stance, contact points). Equipment interacts physically with environment (ball bounces, bat hits, racket tension visible)."
  ],

  medical: [
    "MEDICAL TERMINOLOGY: Use anatomically correct terms. 'Operating room' has specific sterile equipment layout, 'patient' is a person receiving care, 'procedure' follows medical protocols with proper protective equipment.",
    "MEDICAL REALISM: Medical settings require appropriate sterile procedures, protective equipment (gloves, masks, gowns), and authentic medical equipment that matches the specified procedure."
  ],

  urban: [
    "URBAN AUTHENTICITY: City streets have consistent architectural styles, appropriate traffic density for time of day, logical signage and storefronts. Background pedestrians behave naturally (walking with purpose, looking ahead, normal pace).",
    "URBAN CONTINUITY: Weather effects persist (wet pavement from rain, snow accumulation, puddles). Lighting matches time of day (streetlights on at night, sun position accurate for time)."
  ],

  nature: [
    "NATURAL PHYSICS: Plants sway in wind, water flows downhill, animals move with species-appropriate gaits. Natural elements interact logically (wind creates ripples on water, rain creates splashes, snow accumulates on surfaces).",
    "ENVIRONMENTAL CONSISTENCY: Natural lighting follows sun position and weather conditions. Shadows cast in correct directions. Seasonal indicators (foliage, snow, temperature effects) remain consistent."
  ]
};

export const QUALITY_ISSUE_RULES = {
  characterConsistency: [
    "CHARACTER IDENTITY: Character gender, age, and core physical features (face structure, build, height) are IMMUTABLE and must match reference images exactly across all scenes.",
    "CHARACTER APPEARANCE: Hair color/style, facial features (eye color, nose shape, jawline), and distinctive marks must match reference images precisely. Clothing specified in character description is mandatory unless scene explicitly changes it.",
    "CHARACTER COUNT EXACTNESS: When a specific number of characters is specified (e.g., 'five surfers', 'three children'), that exact count must be maintained and verifiable in every frame. Each character must be distinct and individually identifiable."
  ],

  spatialContinuity: [
    "SPATIAL LOGIC: Characters cannot teleport. Movement between locations must show physical progression or explicit transition. If character exits frame-left, they enter next frame from frame-right.",
    "POSITIONAL CONSISTENCY: Relative positions of characters and objects persist unless explicit movement occurs. If A is left of B in one frame, this relationship maintains until movement changes it.",
    "ENVIRONMENTAL PERSISTENCE: Broken objects stay broken, moved objects stay moved, spilled liquids remain visible. Damage and changes to environment persist across scenes."
  ],

  motionDirection: [
    "CAMERA-RELATIVE DIRECTIONS: 'Toward camera' shows faces, front bodies approaching. 'Away from camera' shows backs, receding figures. 'Left' and 'right' are from camera perspective, not character perspective.",
    "MOTION CONTINUITY: Action direction specified in scene description must be maintained. 'Running into ocean' means moving from land toward water, NOT parallel to shoreline or away from water."
  ],

  semanticAccuracy: [
    "LITERAL INTERPRETATION: Domain-specific terms must be interpreted according to their literal meaning in that domain. Research domain terminology if uncertain - do not substitute similar-sounding but incorrect interpretations.",
    "NEGATIVE CONSTRAINTS: When terminology could be ambiguous, explicitly specify what it is NOT. Example: 'wave barrel (NOT a pipe, NOT a tunnel structure, specifically curved water)'."
  ],

  technicalQuality: [
    "FRAME STABILITY: Keyframes must show complete, stable poses with weight settled, NOT mid-transition states. Characters should be at clear beginning or end positions, not caught mid-gesture or mid-step.",
    "GENERATION ARTIFACTS: Avoid horizontal banding, digital noise, inconsistent resolution, unnatural blur, or AI artifacts. Images should be clean, professional cinema-grade quality.",
    "FOCUS AND CLARITY: Main subjects in focus with appropriate depth of field. Background blur (bokeh) when shallow DoF specified. No motion blur unless intentional and cinematic."
  ]
};

export const PROACTIVE_QUALITY_RULES = [
  "All character facial features, bone structure, and body proportions must remain pixel-consistent with reference images across all generations. Use reference images as ground truth.",
  "Character count specifications are strict requirements. If '5 characters' specified, all 5 must be visible and distinguishable in every frame where they should appear.",
  "Motion and action verbs specify exact physical movements. 'Sprinting' shows fast running with appropriate biomechanics. 'Walking' shows normal gait. 'Standing' shows stationary position. No ambiguous interpretations.",
  "Temporal state changes accumulate. Wet stays wet until drying scene occurs. Torn stays torn. Dirt accumulates, not disappears. Injuries persist until healing specified.",
  "Camera angles and directions are specified from camera perspective. 'Toward camera' = approaching viewer. 'Away from camera' = receding from viewer. Maintain this perspective.",
  "Background layers specified in composition (crowd, buildings, mountains) are MANDATORY scene elements, not optional. Missing background layers is a critical error.",
];

/**
 * Helper to detect which domain rules might be relevant based on scene content
 */
export function detectRelevantDomainRules(sceneDescriptions: string[]): string[] {
  const allText = sceneDescriptions.join(' ').toLowerCase();
  const relevantRules: string[] = [];

  if (allText.match(/\b(surf|wave|barrel|ocean|beach|board|paddle|ride|wipeout)\b/)) {
    relevantRules.push(...DOMAIN_SPECIFIC_RULES.surfing);
  }

  if (allText.match(/\b(sport|run|sprint|jump|throw|catch|play|athlete|game)\b/)) {
    relevantRules.push(...DOMAIN_SPECIFIC_RULES.sports);
  }

  if (allText.match(/\b(hospital|doctor|surgery|patient|medical|operate|clinic)\b/)) {
    relevantRules.push(...DOMAIN_SPECIFIC_RULES.medical);
  }

  if (allText.match(/\b(city|street|urban|building|sidewalk|traffic|downtown)\b/)) {
    relevantRules.push(...DOMAIN_SPECIFIC_RULES.urban);
  }

  if (allText.match(/\b(forest|mountain|river|lake|tree|wildlife|nature|outdoor)\b/)) {
    relevantRules.push(...DOMAIN_SPECIFIC_RULES.nature);
  }

  return relevantRules;
}

/**
 * Helper to get quality rules based on observed issues
 */
export function getQualityRulesForIssues(issueCategories: string[]): string[] {
  const rules: string[] = [];

  if (issueCategories.some(cat => cat.includes('character') || cat.includes('appearance'))) {
    rules.push(...QUALITY_ISSUE_RULES.characterConsistency);
  }

  if (issueCategories.some(cat => cat.includes('continuity') || cat.includes('spatial'))) {
    rules.push(...QUALITY_ISSUE_RULES.spatialContinuity);
  }

  if (issueCategories.some(cat => cat.includes('motion') || cat.includes('direction'))) {
    rules.push(...QUALITY_ISSUE_RULES.motionDirection);
  }

  if (issueCategories.some(cat => cat.includes('semantic') || cat.includes('interpretation'))) {
    rules.push(...QUALITY_ISSUE_RULES.semanticAccuracy);
  }

  if (issueCategories.some(cat => cat.includes('technical') || cat.includes('artifact'))) {
    rules.push(...QUALITY_ISSUE_RULES.technicalQuality);
  }

  return rules;
}

/**
 * Get all proactive rules to include from the start
 */
export function getProactiveRules(): string[] {
  return [...PROACTIVE_QUALITY_RULES];
}
