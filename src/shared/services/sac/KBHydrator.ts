// backend/services/kb-hydrator.service.ts

import * as cheerio from 'cheerio';
import { WorldRepository, HydrationPayload } from '../world-repository.js';

export interface HydrationContext {
    userId: string;
    projectId: string;
    htmlInput: string;
}

export interface HandleMatch {
    handle: string;
    markupOriginal: string;
}

export interface HydrationResult {
    success: boolean;
    prompt: string | null;
    errors: string[];
}

export class KBHydrator {
    constructor(private readonly repoWorld: WorldRepository) { }

    public async execute(context: {
        userId: string;
        projectId: string;
        htmlInput: string
    }): Promise<HydrationResult> {

        console.trace({ projectId: context.projectId }, 'KBHydrator: Starting hydration');

        try {
            // 1. Parse & Sanitize: Identify all <span data-type="mention">
            const html = this.sanitize(context.htmlInput);
            const matches = this.extractMatches(html);

            if (matches.length === 0) return { success: true, prompt: html, errors: [] };

            const uniqueHandles = [...new Set(matches.map(m => m.handle))];

            // 2. Permission Check: Filter handles by Project & World scope
            const authorizedHandles = await this.repoWorld.verifyHandleAccessBulk(
                context.userId,
                context.projectId,
                uniqueHandles
            );

            const unauthorized = uniqueHandles.filter(h => !authorizedHandles.includes(h));

            // 3. Retrieval: Fetch raw entity data for authorized handles
            const entities = await this.repoWorld.getHydrationPayloadsBulk(authorizedHandles);

            // 4. Integrity Check: Hard fail if authorized handles don't have backing data
            const missing = authorizedHandles.filter(h => !entities.find(e => e.handle === h));
            if (missing.length > 0) {
                return {
                    success: false,
                    prompt: '',
                    errors: missing.map(h => `Resolution Error: @${h} exists in registry but data is missing.`)
                };
            }

            // 5. Injection: Convert HTML to LLM prompt + Knowledge Block
            const finalPrompt = this.buildPrompt(html, matches, entities, unauthorized);

            return { success: true, prompt: finalPrompt, errors: [] };
        } catch (e) {
            console.error(e, 'KBHydrator: Critical Failure');
            return { success: false, prompt: '', errors: ['Internal Hydration Error'] };
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
            matches.push({ handle: $(el).attr('data-handle')!, raw: $.html(el) });
        });
        return matches;
    }

    private buildPrompt(html: string, matches: any[], entities: any[], unauthorized: string[]) {
        let text = html;
        let kb = '\n\n### ENTITY KNOWLEDGE BASE ###\n';

        // Authorized: Replace with @handle and add to KB
        entities.forEach(e => {
            matches.filter(m => m.handle === e.handle).forEach(m => {
                text = text.replace(m.raw, `@${e.handle}`);
            });
            kb += `\n[Entity: @${e.handle}]\nName: ${e.name}\nTraits: ${JSON.stringify(e.traits)}\n`;
        });

        // Unauthorized: Replace with @handle but NO KB entry (Fair Use)
        unauthorized.forEach(h => {
            matches.filter(m => m.handle === h).forEach(m => {
                text = text.replace(m.raw, `@${h}`);
            });
        });

        return text + (entities.length > 0 ? kb : '');
    }
}