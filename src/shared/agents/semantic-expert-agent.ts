import { TextModelController, UserMessage } from "#shared/lm/text-model-controller.js";
import { Storyboard } from "#shared/types/workflow.types.js";
import { getModelCompatibleSchema } from '#shared/utils/utils.js';
import { buildSemanticRulesPrompt } from "#shared/prompts/rules.prompt.js";
import { z } from "zod";
import { GenerativeResultSemanticAnalysis } from "#shared/types/job.types.js";

const SemanticRuleSchema = z.object({
    category: z.string(),
    rule: z.string()
});

const SemanticRulesResponseSchema = z.object({
    rules: z.array(SemanticRuleSchema)
});

export class SemanticExpertAgent {
    private lm: TextModelController;

    constructor(lm: TextModelController) {
        this.lm = lm;
    }

    async generateRules(storyboard: Storyboard): Promise<GenerativeResultSemanticAnalysis> {
        console.log("   🧠 SEMANTIC EXPERT: Analyzing storyboard for constraints...");
        const context = `
      ${JSON.stringify(storyboard.metadata)}
      
      SCENES SUMMARY:
      ${(storyboard.scenes || []).map(s => `- Scene ${s.id}: ${s.description}`).join('\n')}
    `;

        const prompt = buildSemanticRulesPrompt(context);

        try {
            const response = await this.lm.generateContent({
                model: this.lm.qualityCheckModel,
                messages: [new UserMessage({ content: [{ type: 'text', text: prompt }] })],
                config: {
                    responseJsonSchema: getModelCompatibleSchema(SemanticRulesResponseSchema),
                    temperature: 0.4
                }
            });

            if (!response.text) {
                console.warn("   ⚠️ Semantic Expert returned no text.");
                return { data: { dynamicRules: [] }, metadata: { model: this.lm.qualityCheckModel, attempts: 1, acceptedAttempt: 1 } };
            }

            const data = JSON.parse(response.text);
            const parsed = SemanticRulesResponseSchema.parse(data);

            console.log(`   ✓ Generated ${parsed.rules.length} semantic constraints.`);

            const dynamicRules = parsed.rules.map(r => r.rule);
            return { data: { dynamicRules }, metadata: { model: this.lm.qualityCheckModel, attempts: 1, acceptedAttempt: 1 } };

        } catch (error) {
            console.error("   ✗ Failed to generate semantic rules:", error);
            return { data: { dynamicRules: [] }, metadata: { model: this.lm.qualityCheckModel, attempts: 1, acceptedAttempt: 1 } };
        }
    }
}
