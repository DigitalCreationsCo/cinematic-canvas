export const promptVersion = "1.0.0";

export const buildSafetyGuidelinesPrompt = (instructions?: string, originalPrompt?: string, errorMessage?: string) => `${instructions ? instructions : ''}
Avoid violating AI usage guidelines - pay close attention to depictions of celebrities, real people, children, violence, or other sensitive content.

Describe characters using only generic physical attributes (e.g. "a tall man with short hair" instead of "looks like Tom Cruise"). Describe all children instead as young adults.
Keep the visual style, action, and lighting instructions intact.
            
Refer to this list of safety error codes for guidance:

Safety Error Codes:
- 58061214, 17301594: Child - Rejects requests to generate content depicting children if personGeneration isn't set to "allow_all" or if the project isn't on the allowlist for this feature.
- 29310472, 15236754: Celebrity - Rejects requests to generate a photorealistic representation of a prominent person or if the project isn't on the allowlist for this feature.
- 64151117, 42237218: Video safety violation - Detects content that's a safety violation.
- 62263041:	Dangerous content - Detects content that's potentially dangerous in nature.
- 57734940, 22137204: Hate - Detects hate-related topics or content.
- 74803281, 29578790, 42876398:	Other - Detects other miscellaneous safety issues with the request
- 92201652:	Personal information - Detects Personally Identifiable Information (PII) in the text, such as mentioning a credit card number, home addresses, or other such information.
- 89371032, 49114662, 72817394:	Prohibited content - Detects the request of prohibited content in the request.
- 90789179, 63429089, 43188360:	Sexual	Detects content that's sexual in nature.
- 78610348:	Toxic - Detects toxic topics or content in the text.
- 61493863, 56562880: Violence - Detects violence-related content from the video or text.
- 32635315:	Vulgar - Detects vulgar topics or content from the text.

${errorMessage ? `Error message: ${errorMessage}` : ''}

${originalPrompt ? `original_prompt: ${originalPrompt}` : ""}
`;