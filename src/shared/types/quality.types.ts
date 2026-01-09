import { z } from "zod";

// ============================================================================
// QUALITY EVALUATION SCHEMAS (Quality Control Supervisor)
// ============================================================================


export const DepartmentEnum = z.enum([
    "director",
    "cinematographer",
    "gaffer",
    "script_supervisor",
    "costume",
    "production_design"
]);
export type Department = z.infer<typeof DepartmentEnum>;


// Shared severity enum
export const SeverityEnum = z.enum([ "critical", "major", "minor" ]);
export type Severity = z.infer<typeof SeverityEnum>;


// Shared rating enum
export const RatingEnum = z.enum([ "PASS", "MINOR_ISSUES", "MAJOR_ISSUES", "FAIL" ]);
export type Rating = z.infer<typeof RatingEnum>;


export const QualityScoreSchema = z.object({
    rating: RatingEnum,
    weight: z.number().min(0).max(1),
    details: z.string().describe("Detailed explanation"),
});
export type QualityScore = z.infer<typeof QualityScoreSchema>;


export const QualityIssueSchema = z.object({
    department: DepartmentEnum.describe("Which department's specs were not met"),
    category: z.string().describe("Issue category (narrative, composition, lighting, continuity, appearance)"),
    severity: SeverityEnum,
    description: z.string().describe("Specific problem observed"),
    videoTimestamp: z.string().optional().describe("Timestamp in video (e.g., 0:02-0:04)"),
    locationInFrame: z.string().optional().describe("Location in frame for image issues"),
    suggestedFix: z.string().describe("How the department should revise specs"),
});
export type QualityIssue = z.infer<typeof QualityIssueSchema>;


export const PromptCorrectionSchema = z.object({
    department: DepartmentEnum,
    issueType: z.string(),
    originalPromptSection: z.string(),
    correctedPromptSection: z.string(),
    reasoning: z.string(),
});
export type PromptCorrection = z.infer<typeof PromptCorrectionSchema>;


export const QualityEvaluationSchema = z.object({
    scores: z.object({
        narrativeFidelity: QualityScoreSchema,
        characterConsistency: QualityScoreSchema,
        technicalQuality: QualityScoreSchema,
        emotionalAuthenticity: QualityScoreSchema,
        continuity: QualityScoreSchema,
    }),
    issues: z.array(QualityIssueSchema),
    feedback: z.string().describe("Overall summary of quality assessment"),
    promptCorrections: z.array(PromptCorrectionSchema).optional(),
    ruleSuggestion: z.string().optional().describe("A new global rule to prevent future systemic issues"),
});


export const QualityEvaluationResultSchema = QualityEvaluationSchema.extend(
    z.object({
        overall: z.enum([ "ACCEPT", "ACCEPT_WITH_NOTES", "REGENERATE_MINOR", "REGENERATE_MAJOR", "FAIL" ]),
    }).shape
);
export type QualityEvaluationResult = z.infer<typeof QualityEvaluationResultSchema>;


export interface QualityConfig {
    enabled: boolean;
    acceptThreshold: number;
    minorIssueThreshold: number;
    majorIssueThreshold: number;
    failThreshold: number;
    maxRetries: number;
    safetyRetries: number;
}
