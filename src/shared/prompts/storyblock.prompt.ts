const GENRE_RULES: Record<string, string[]> = {
    politics: [
        "This is a story about people who want power, use people to get it, and pay a personal price. Keep the focus on what ambition costs characters emotionally, not just strategically.",
        "The central tension is loyalty against self-interest. Show what a character is willing to give up to win — and what they find out they can't give up.",
        "Dialogue should carry real weight. A hesitation before answering, a subject that gets changed — what characters avoid saying matters as much as what they say.",
        "Avoid: characters who deliver political speeches, institutions with no human face, betrayals that serve the plot but have no emotional cause.",
    ],
    mystery: [
        "This is a story about a question that needs answering — and a person who may not like what they find. Every scene should reveal something and conceal something else. The reader should be slightly behind the detective — close enough to feel engaged, never so lost they feel cheated.",
        "Clues belong in behavior, not narration. A character who avoids eye contact or straightens something on a shelf tells us more than a paragraph explaining their guilt.",
        "The external mystery should connect to something the detective is working through internally. What they're investigating outside should reflect something they're avoiding inside.",
        "Avoid: discoveries that happen by coincidence, characters who explain their own motives, false leads that go nowhere and mean nothing.",
    ],
    adventure: [
        "This is a story about people being tested by the world — physically, mentally, and morally — and finding out what they're made of. Action is the primary mode, but action only matters when something real is at risk.",
        "The physical world should push back. Terrain, weather, hunger, and exhaustion are obstacles with real consequences, not just backdrop.",
        "Bravery means acting while afraid, hurt, or unsure — not the absence of those things. Show characters doing hard things in difficult conditions.",
        "Avoid: heroes who succeed without effort, danger that feels abstract, action scenes that end without changing anything emotionally.",
    ],
    horror: [
        "This is a story about something wrong that can't be ignored — and what it costs people to face it. Fear builds through atmosphere, not mechanics. What the reader imagines is usually scarier than what you describe directly.",
        "Start with the familiar, then make one detail wrong. A normal setting that's slightly off is more unsettling than an overtly monstrous one.",
        "Characters don't make stupid decisions — they make understandable ones under stress, and that's how they end up somewhere terrible.",
        "Avoid: graphic detail that replaces tension, characters who exist only to be in danger.",
    ],
    drama: [
        "This is a story about people who are struggling to understand each other — or themselves — and mostly failing. No explosions, no chase scenes. The entire story runs on human stakes, which makes it as high-pressure as any other genre.",
        "Conflict lives in the space between people. A silence over dinner, a question no one answers, a decision made years ago that everyone is still dealing with.",
        "The turning points are small: a word chosen poorly, a moment of honesty that comes too late, a door left open that should have been closed.",
        "Characters are trying to connect — and either don't know how, or know how and are afraid, or once knew how and can't find their way back.",
        "Avoid: big emotional outbursts in place of actual depth, conflict that escalates without cause, realizations that resolve everything too neatly.",
    ],
    crime: [
        "This is a story about what drives ordinary people to do things they can't take back. No one here is purely innocent or purely guilty — moral lines are blurry, and the story should treat them that way.",
        "The crime is the starting point, not the subject. Under it: desperation, loyalty, old history, bad timing.",
        "Pace deliberately. Let pressure build slowly. When something breaks, it should hit hard because the reader felt it coming.",
        "Avoid: villains with no understandable motive, confessions that arrive conveniently, violence that leaves the people involved unchanged.",
    ],
};

const BASE_RULES = [
    "Human drama is a constant: character development is the story.",
    "Plot events are interesting because of the reason: who it's happening to and how it affects those involved.",
    "Character relationships have nuance and can shift: loyalty, love, betrayal, resentment, need. The story is a forcing function that builds, develops and shifts relationships.",
    "A story with no personal stakes sucks. Develop consequences and developments that last.",
];

const contentBlacklist = [
    "No 'tapestry of', 'anomaly', 'symphony of', 'glyph', 'dust motes', 'faint whisper', 'dance of light', or baroque decoration.",
    "No starting with 'Suddenly' or 'In that moment'.",
    "No characters trembling or gasping at minor events.",
    "No over-explained reactions. If a gun goes off, don't write 'She realized the danger was real.'",
    "No wisdom dispensed by side characters unprompted.",
    "No complex, run-on sentences. Not 'The icy mist swirled, obscuring the path forward, but the pulse grew stronger, beckoning her' - 'The icy mist swirled, obscuring the path forward.'.",
];

const authorFlair = [
    "Author Flair:",
    "Show, don't tell. Don't use 'She was afraid', use 'Her hand found the wall'.",

    "Use Simple language. Don't use 'luminescence', use 'glow'.",

    "Communicate one idea per story block. Less is more.",

    "Use literal over abstract language. Don't use 'Her focus sharpened', use 'Her eyes narrowed on the door'.",

    "Use simple descriptions. Don't use 'A tiny, almost invisible inscription was etched into the silver frame.', use 'A small inscription was etched into the silver frame.'.",

    "Use active voice and strong verbs. Don't use 'She hauled herself up over the ledge, lungs burning.', use 'She hauled herself up over the ledge. Her lungs burned.'",

    "Characters are complete and flawed. They each react uniquely. They can make mistakes. They can hesitate. They want things they won't say out loud.",

    `For character introspection, complex past tense is ok: e.g. "She had seen the light go dark from the cliff road."`,

    "Dialogue can be subtextual. 'Your coffee's getting cold' can be used in place of 'I love you.'",

    "Reserve big emotions for big moments. Earn them.",
];

const examples = [
    `Here are some examples of blocks to guide your writing composition:`,
    `1. "Vance slammed his fist onto the manual override. The airlock sealed, trapping the breach but sealing off the engineering bay. The ship shuddered, stabilizing."`,
    `2. "Platform nine was empty except for the echo of her footsteps. The last train south sat waiting. Its windows were dark. Elena set down her suitcase and looked back at the station. She gazed at the grand arches one last time. This city had given her everything and taken it all back. Now the only direction that made sense was away."`,
    `3. "Rain hammered the cobblestones in sheets. The drops were tiny bursts of light swallowed by the gas lamps. Elena pressed herself into the doorway of a shuttered bookshop, her coat already soaked through. Somewhere ahead, past the narrow bend where the alley swallowed itself, a door had slammed."`,
    `4. "The lighthouse keeper had not answered his radio in three days. Coast guard blamed the storm -- the worst November squall in forty years -- but Helen knew better. She had seen the light go dark from the cliff road, a sudden extinguishing. Now, standing at the harbour wall with salt spray stinging her face, she watched the black Atlantic heave its dark mass."`,
];

export const createStoryBlockInstructions = ({
    previousBlock,
    ragContext,
    isResolving,
    genre = "adventure",
    // Stateful Chronicle RAG parameters
    lore,
    summary,
}: {
    previousBlock: string;
    ragContext?: string;
    isResolving?: boolean;
    genre?: keyof typeof GENRE_RULES;
    lore?: string[];
    summary?: string;
}) => {

    const previousContext = ragContext
        ? ragContext
        : previousBlock;

    const storyRules = GENRE_RULES[genre] ?? GENRE_RULES.adventure;

    // Build the chronicle/summary section if available
    const loreSection = [];
    if (summary) {
        loreSection.push(`SUMMARY (Earlier Events):\n${summary}`);
    }
    if (lore && lore.length > 0) {
        lore.forEach(event => {
            loreSection.push(`${event}`);
        });
    }

    const loreText = loreSection.length > 0
        ? loreSection.join("\n") + "\n\n"
        : "";

    const instructions = [
        `Produce the next moment:
You are a best-selling author writing an intriguing, continuous story. Make the reader interested to continue reading.`,

        ...storyRules,

        loreText,

        previousContext,

        ...BASE_RULES,
        ...authorFlair,

        ...contentBlacklist,

        isResolving
            ? "Resolve tension decisively. Let the human cost of the story land - No new threads."
            : "Close with an implication the reader has to sit with.",

        `Format: [establishment] [evolution] [inspection]`,

        "Max 35 words.",

        ...examples,

    ].join("\n");

    return instructions;
};