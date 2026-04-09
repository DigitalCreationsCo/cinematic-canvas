// src/shared/services/sac/KBHydrator.ts
// Knowledge Base Hydrator for Entity Mention System
import * as cheerio from 'cheerio';
import { generateId } from "#shared/utils/id.js";
import { TagRegistryService } from '#shared/services/tag-registry.js';
import { Character, Location, Prop } from '#shared/types/index.js';

export interface HydrationContext {
    userId: string;
    projectId: string;
    htmlInput: string;
}

export type HydrationPayload = |
    Character |
    Location |
    Prop;

export interface HandleMatch {
    handle: string;
    markupOriginal: string;
}

export interface HydrationResult {
    success: boolean;
    prompt: string | null;
    unauthorizedHandles: string[];
    errors: string[];
    metadata: {
        resolvedCount: number;
        unauthorizedCount: number;
        processingTimeMs: number;
    };
}

interface ResultMentionsParsed {
    handlesResolved: string[];
    textPlain: string;
}



export class KBHydrator {
    public async execute(context: {
        userId: string;
        projectId: string;
        htmlInput: string
    }): Promise<HydrationResult> {
        const traceId = generateId();
        const startTime = Date.now();

        console.trace({ traceId, projectId: context.projectId, userId: context.userId }, 'KBHydrator: Starting hydration');

        try {
            const html = this.sanitize(context.htmlInput);
            const matches = this.extractMatches(html);

            const processingTime = Date.now() - startTime;

            if (matches.length === 0) {
                console.debug({ traceId, processingTimeMs: processingTime }, 'KBHydrator: No mentions found');
                return {
                    success: true,
                    prompt: html,
                    unauthorizedHandles: [],
                    errors: [],
                    metadata: { resolvedCount: 0, unauthorizedCount: 0, processingTimeMs: processingTime }
                };
            }

            const uniqueHandles = [...new Set(matches.map(m => m.handle))];
            console.debug({ traceId, handleCount: uniqueHandles.length }, 'KBHydrator: Extracted handles');

            const authorizedHandles = await new TagRegistryService().verifyHandleAccessBulk({
                handles: uniqueHandles,
                userId: context.userId,
                projectId: context.projectId,
            });

            const unauthorizedHandles = uniqueHandles.filter(h => !authorizedHandles.includes(h));
            console.debug({
                traceId,
                authorizedCount: authorizedHandles.length,
                unauthorizedCount: unauthorizedHandles.length
            }, 'KBHydrator: Access verification complete');

            const entities = await new TagRegistryService().getHydrationPayloadsBulk(authorizedHandles);

            const missingHandles = authorizedHandles.filter(h => !entities.find(e => e.handle === h));
            if (missingHandles.length > 0) {
                const errors = missingHandles.map(h => `Resolution Error: @${h} exists in registry but data is missing.`);
                console.error({ traceId, missingHandles }, 'KBHydrator: Orphaned handles detected');
                return {
                    success: false,
                    prompt: '',
                    unauthorizedHandles,
                    errors,
                    metadata: { resolvedCount: 0, unauthorizedCount: unauthorizedHandles.length, processingTimeMs: Date.now() - startTime }
                };
            }

            const finalPrompt = this.buildPrompt(html, matches, entities, unauthorizedHandles);

            const totalTime = Date.now() - startTime;
            console.info({
                traceId,
                resolvedCount: entities.length,
                unauthorizedCount: unauthorizedHandles.length,
                totalTimeMs: totalTime
            }, 'KBHydrator: Hydration complete');

            return {
                success: true,
                prompt: finalPrompt,
                unauthorizedHandles,
                errors: [],
                metadata: {
                    resolvedCount: entities.length,
                    unauthorizedCount: unauthorizedHandles.length,
                    processingTimeMs: totalTime
                }
            };
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            console.error({ traceId, error: errorMessage }, 'KBHydrator: Critical Failure');
            return {
                success: false,
                prompt: '',
                unauthorizedHandles: [],
                errors: ['Internal Hydration Error'],
                metadata: { resolvedCount: 0, unauthorizedCount: 0, processingTimeMs: Date.now() - startTime }
            };
        }
    }

    private sanitize(html: string): string {
        const $ = cheerio.load(html, null, false);
        $('*').not('span[data-type="mention"]').each(function () {
            $(this).replaceWith($(this).text());
        });
        return $.html();
    }

    private extractMatches(html: string) {
        const $ = cheerio.load(html, null, false);
        const matches: { handle: string; raw: string }[] = [];
        $('span[data-type="mention"]').each((_, el) => {
            const handle = $(el).attr('data-handle');
            if (handle) {
                matches.push({ handle, raw: $.html(el) });
            }
        });
        return matches;
    }

    private buildPrompt(html: string, matches: { handle: string; raw: string }[], entities: HydrationPayload[], unauthorized: string[]) {
        let text = html;
        let kb = '\n\n### ENTITY KNOWLEDGE BASE ###\n';

        entities.forEach(entity => {
            matches.filter(m => m.handle === entity.referenceId).forEach(match => {
                text = text.replace(match.raw, `@${entity.referenceId}`);
            });
            kb += `${JSON.stringify(entity)}\n`;
        });

        unauthorized.forEach(handle => {
            matches.filter(m => m.handle === handle).forEach(match => {
                text = text.replace(match.raw, `@${handle}`);
            });
        });

        return text + (entities.length > 0 ? kb : '');
    }

    /**
     * Parses an HTML string containing mention chips.
     * Validates handles against the TagRegistry.
     * Removes resolved mentions from the string, leaves unresolved mentions as plain text handles.
     */
    async extractAndResolveMentions(
        paramsParsing: {
            textInputHtml: string;
            idProject: string;
            idUser: string;
        },
    ): Promise<ResultMentionsParsed> {
        const idTrace = generateId();
        console.trace({ idTrace, idProject: paramsParsing.idProject }, '[extractAndResolveMentions] Starting mention extraction');

        // Handle empty or pure string fallbacks
        if (!paramsParsing.textInputHtml || typeof paramsParsing.textInputHtml !== 'string') {
            return { handlesResolved: [], textPlain: paramsParsing.textInputHtml || "" };
        }

        const $ = cheerio.load(paramsParsing.textInputHtml, null, false);
        const handlesDiscovered: string[] = [];
        const mapNodesMention = new Map<string, any[]>();

        // 1. Identify all mention nodes
        $('span[data-type="mention"]').each((_, el) => {
            const handleRaw = $(el).attr('data-handle');
            if (handleRaw) {
                const handleClean = handleRaw.replace('@', '');
                handlesDiscovered.push(handleClean);

                const nodes = mapNodesMention.get(handleClean) || [];
                nodes.push(el);
                mapNodesMention.set(handleClean, nodes);
            }
        });

        console.debug({ idTrace, countHandles: handlesDiscovered.length }, '[extractAndResolveMentions] Discovered handles');

        let handlesAuthorized: string[] = [];

        // 2. Verify access / existence via Registry
        if (handlesDiscovered.length > 0) {
            handlesAuthorized = await new TagRegistryService().verifyHandleAccessBulk({
                handles: handlesDiscovered,
                userId: paramsParsing.idUser,
                projectId: paramsParsing.idProject
            });
        }

        // 3. Mutate the DOM based on resolution rules
        $('span[data-type="mention"]').each((_, el) => {
            const handleRaw = $(el).attr('data-handle');
            if (handleRaw) {
                const handleClean = handleRaw.replace('@', '');
                if (handlesAuthorized.includes(handleClean)) {
                    // Match found: Remove the entity from the plain text
                    $(el).remove();
                } else {
                    // No match found: Revert to plain text handle
                    $(el).replaceWith(`@${handleClean}`);
                }
            }
        });

        // Clean up residual whitespace caused by node removal
        const textCleaned = $.text().replace(/\s+/g, ' ').trim();

        console.debug({ idTrace, textCleaned }, '[extractAndResolveMentions] Extraction complete');

        return {
            handlesResolved: handlesAuthorized,
            textPlain: textCleaned
        };
    }
}