// src/shared/services/sac/KBHydrator.ts
import * as cheerio from "cheerio";
import { generateId } from "#shared/utils/id.js";
import { TagRegistryService } from "#shared/services/tag-registry.js";
import { Character, HydratedEntityEnvelope, Location, Prop } from "#shared/types/workflow.types.js";
import { EntityMentionableType } from "#shared/types/entity.types.js";

export interface HydrationContext {
  userId: string;
  projectId: string;
  htmlInput: string;
}

export type HydrationPayload = Character | Location | Prop;

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

// Knowledge Base Hydrator for Entity Mention System
export class KBHydrator {
  constructor(private readonly tagRegistry: TagRegistryService = new TagRegistryService()) {}

  /**
   * Hydrates an HTML string with entity knowledge base data.
   * Verifies handle access, extracts entities, and builds a knowledge base prompt.
   */
  public async execute(context: { userId: string; projectId: string; htmlInput: string }): Promise<HydrationResult> {
    const traceId = generateId();
    const startTime = Date.now();

    console.trace({ traceId, projectId: context.projectId, userId: context.userId }, "KBHydrator: Starting hydration");

    try {
      const html = this.sanitize(context.htmlInput);
      const { matches, transformedText } = this.extractAndTransformMatches(html);

      const processingTime = Date.now() - startTime;

      if (matches.length === 0) {
        console.debug({ traceId, processingTimeMs: processingTime }, "KBHydrator: No mentions found");
        return {
          success: true,
          prompt: html,
          unauthorizedHandles: [],
          errors: [],
          metadata: { resolvedCount: 0, unauthorizedCount: 0, processingTimeMs: processingTime },
        };
      }

      const uniqueHandles = [...new Set(matches.map((m) => m.handle))];
      console.debug({ traceId, handleCount: uniqueHandles.length }, "KBHydrator: Extracted handles");

      const authorizedHandles = await this.tagRegistry.verifyHandleAccessBulk({
        handles: uniqueHandles,
        userId: context.userId,
        projectId: context.projectId,
      });

      const unauthorizedHandles = uniqueHandles.filter((h) => !authorizedHandles.includes(h));
      console.debug(
        {
          traceId,
          authorizedCount: authorizedHandles.length,
          unauthorizedCount: unauthorizedHandles.length,
        },
        "KBHydrator: Access verification complete",
      );

      const entities = await this.tagRegistry.getHydrationPayloadsBulk(authorizedHandles);

      // TODO ENSURE REFERENCE ALWAYS MAPS TO HANDLE
      const missingHandles = authorizedHandles.filter((h) => !entities.find((e) => e.data.referenceId === h));
      if (missingHandles.length > 0) {
        const errors = missingHandles.map((h) => `Resolution Error: @${h} exists in registry but data is missing.`);
        console.error({ traceId, missingHandles }, "KBHydrator: Orphaned handles detected");
        return {
          success: false,
          prompt: "",
          unauthorizedHandles,
          errors,
          metadata: {
            resolvedCount: 0,
            unauthorizedCount: unauthorizedHandles.length,
            processingTimeMs: Date.now() - startTime,
          },
        };
      }

      const finalPrompt = this.buildPrompt(transformedText, entities, unauthorizedHandles);

      const totalTime = Date.now() - startTime;
      console.info(
        {
          traceId,
          resolvedCount: entities.length,
          unauthorizedCount: unauthorizedHandles.length,
          totalTimeMs: totalTime,
        },
        "KBHydrator: Hydration complete",
      );

      return {
        success: true,
        prompt: finalPrompt,
        unauthorizedHandles,
        errors: [],
        metadata: {
          resolvedCount: entities.length,
          unauthorizedCount: unauthorizedHandles.length,
          processingTimeMs: totalTime,
        },
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      console.error({ traceId, error: errorMessage }, "KBHydrator: Critical Failure");
      return {
        success: false,
        prompt: "",
        unauthorizedHandles: [],
        errors: ["Internal Hydration Error"],
        metadata: { resolvedCount: 0, unauthorizedCount: 0, processingTimeMs: Date.now() - startTime },
      };
    }
  }

  /**
   * Strip all remaining non-mention elements but preserve their text content
   * explicitly remove dangerous elements and their content before the text-preserving pass.
   */
  private sanitize(html: string): string {
    const $ = cheerio.load(html, null, false);
    $("script, style, iframe, object, embed, form, noscript").remove();

    $("*")
      .not('span[data-type="mention"]')
      .each(function () {
        $(this).replaceWith($(this).text());
      });

    return $.html();
  }

  /**
   * Extracts mention handles and returns a version of the HTML
   * where mention chips are replaced by plain text handles.
   */
  private extractAndTransformMatches(html: string) {
    const $ = cheerio.load(html, null, false);
    const matches: { handle: string; raw: string }[] = [];
    $('span[data-type="mention"]').each((_, el) => {
      const handle = $(el).attr("data-handle");
      if (handle) {
        // Store the original markup for metadata
        matches.push({ handle, raw: $.html(el) });

        // Normalize handle (remove @ if present) and replace the node
        const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
        $(el).replaceWith(`${cleanHandle}`);
      }
    });

    return {
      matches,
      transformedText: $.html(),
    };
  }

  private buildPrompt(
    transformedText: string,
    entities: HydratedEntityEnvelope<EntityMentionableType>[],
    unauthorized: string[],
  ) {
    // If there are no entities, just return the text as-is
    if (entities.length === 0) {
      return transformedText;
    }

    // 1. Start with the already-transformed HTML
    let kb = "\n\n### ENTITY KNOWLEDGE BASE ###\n";

    // 2. Simply append the JSON data for authorized entities
    entities.forEach((entity) => {
      kb += `${JSON.stringify(entity)}\n`;
    });

    return transformedText + kb;
  }

  /**
   * Parses an HTML string containing mention chips.
   * Validates handles against the TagRegistry.
   * Removes resolved mentions from the string, leaves unresolved mentions as plain text handles.
   */
  async extractAndResolveMentions(params: {
    htmlInput: string;
    projectId: string;
    userId: string;
  }): Promise<ResultMentionsParsed> {
    const idTrace = generateId();
    console.trace({ idTrace, idProject: params.projectId }, "[extractAndResolveMentions] Starting mention extraction");

    // Handle empty or pure string fallbacks
    if (!params.htmlInput || typeof params.htmlInput !== "string") {
      return { handlesResolved: [], textPlain: params.htmlInput || "" };
    }

    const $ = cheerio.load(params.htmlInput, null, false);
    const handlesDiscovered: string[] = [];
    const mapNodesMention = new Map<string, any[]>();

    // 1. Identify all mention nodes
    $('span[data-type="mention"]').each((_, el) => {
      const handleRaw = $(el).attr("data-handle");
      if (handleRaw) {
        const handleClean = handleRaw.replace("@", "");
        handlesDiscovered.push(handleClean);

        const nodes = mapNodesMention.get(handleClean) || [];
        nodes.push(el);
        mapNodesMention.set(handleClean, nodes);
      }
    });

    console.debug(
      { idTrace, countHandles: handlesDiscovered.length },
      "[extractAndResolveMentions] Discovered handles",
    );

    let handlesAuthorized: string[] = [];

    // 2. Verify access / existence via Registry
    if (handlesDiscovered.length > 0) {
      handlesAuthorized = await this.tagRegistry.verifyHandleAccessBulk({
        handles: handlesDiscovered,
        userId: params.userId,
        projectId: params.projectId,
      });
    }

    // 3. Mutate the DOM based on resolution rules
    $('span[data-type="mention"]').each((_, el) => {
      const handleRaw = $(el).attr("data-handle");
      if (handleRaw) {
        const handleClean = handleRaw.replace("@", "");
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
    const textCleaned = $.text().replace(/\s+/g, " ").trim();

    console.debug({ idTrace, textCleaned }, "[extractAndResolveMentions] Extraction complete");

    return {
      handlesResolved: handlesAuthorized,
      textPlain: textCleaned,
    };
  }
}
