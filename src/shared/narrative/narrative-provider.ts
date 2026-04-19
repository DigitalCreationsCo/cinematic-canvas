import { sql, asc, eq, and, count, inArray } from "drizzle-orm";
import { NarrativeProvider as BaseNarrativeProvider, HybridCandidate } from "narrative-engine";
import { DbTransaction } from "#shared/db/index.js";
import { blocks, lore, Block, Lore } from "#shared/narrative/narrative.types.js";

// TODO IPLEMENT SCHEMA TABLES
// TODO IMPLEMENT TABLE INDEXES
// TDODO ACTIVATE TSVECTOR EXTENSTION IN DB
// TODO CHOOSE VECTOR SEARCH OR NO VECTOR SEARCH??
// TEST ALL QUERIES AS VALID

/**
 * Retrieval provider for long-horizon context - used by narrative engine to generate context-aware story blocks.
 */
export class NarrativeProvider implements BaseNarrativeProvider {

  constructor(
    private db: DbTransaction
  ) { }

  getProviderType(): string {
    return "rag-pg";
  }

  async getBlockCount(projectId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(blocks)
      .where(eq(blocks.projectId, projectId));
    return result?.value ?? 0;
  }

  async getLoreAtoms(projectId: string): Promise<Lore[]> {
    const result = await this.db
      .select()
      .from(lore)
      .where(and(eq(lore.projectId, projectId), eq(lore.isActive, true)))
      .orderBy(asc(lore.id));
    return result.map(row => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      happenedAt: row.createdAt ? new Date(row.createdAt).getTime() : new Date().getTime()
    }));
  }

  async getHybridSearchCandidates(projectId: string, query: string, limit: number): Promise<HybridCandidate<Block>[]> {
    const matchedBlocks = this.db.$with("matched_blocks").as(
      this.db
        .select({
          id: blocks.id,
          index: blocks.index,
          projectId: blocks.projectId,
          title: blocks.title,
          content: blocks.content,
          imageUrl: blocks.imageUrl,
          isNotable: blocks.isNotable,
          createdAt: blocks.createdAt,
          rawTsRank: sql<number>`ts_rank(${blocks.searchVector}, plainto_tsquery('english', ${query}))`.as("raw_ts_rank"),
        })
        .from(blocks)
        .where(
          and(
            eq(blocks.projectId, projectId),
            sql`${blocks.searchVector} @@ plainto_tsquery('english', ${query})`
          )
        )
    );

    // 2. Define the second CTE: max_ts
    const maxTs = this.db.$with("max_ts").as(
      this.db
        .select({
          maxRank: sql<number>`COALESCE(MAX(${matchedBlocks.rawTsRank}), 1)`.as("max_rank"),
        })
        .from(matchedBlocks)
    );

    // 3. Final Selection
    const result = await this.db
      .with(matchedBlocks, maxTs)
      .select({
        // Spread the matched blocks
        block: {
          id: matchedBlocks.id,
          index: matchedBlocks.index,
          projectId: matchedBlocks.projectId,
          title: matchedBlocks.title,
          content: matchedBlocks.content,
          imageUrl: matchedBlocks.imageUrl,
          isNotable: matchedBlocks.isNotable,
          createdAt: matchedBlocks.createdAt,
        },
        // Calculate Hybrid Search Scores
        scoreKeywordSparse: sql<number>`COALESCE(${matchedBlocks.rawTsRank} / NULLIF(${maxTs.maxRank}, 0), 0)`.as("score_keyword_sparse"),
      })
      .from(matchedBlocks)
      .innerJoin(maxTs, sql`true`)
      .orderBy(sql`score_keyword_sparse DESC`)
      .limit(limit);

    // 4. Transform to your desired output shape
    return result.map((row) => ({
      block: {
        ...row.block,
        index: row.block.index,
        isNotable: row.block.isNotable ?? false,
        happenedAt: row.block.createdAt ? new Date(row.block.createdAt).getTime() : 0,
      },
      scoreKeywordSparse: Number(row.scoreKeywordSparse) || 0,
      scoreVectorDense: 0,
    }));
  }

  async getNotableEvents(projectId: string): Promise<Block[]> {
    const result = await this.db
      .select()
      .from(blocks)
      .where(and(eq(blocks.projectId, projectId), eq(blocks.isNotable, true)))
      .orderBy(asc(blocks.id));
    return result.map(row => ({
      ...row,
      index: row.index,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      happenedAt: row.createdAt ? new Date(row.createdAt).getTime() : new Date().getTime()
    }));
  }

  async getBlocksByIndices(projectId: string, indices: number[]): Promise<Block[]> {
    return await this.getBlocksBySequence(projectId, indices);
  }

  private async getBlocksBySequence(projectId: string, indices: number[]): Promise<Block[]> {
    if (indices.length === 0) return [];

    // 1. Define the CTE with the row number calculation
    const numberedBlocks = this.db.$with("numbered").as(
      this.db
        .select({
          id: blocks.id,
          index: blocks.index,
          projectId: blocks.projectId,
          title: blocks.title,
          content: blocks.content,
          dialogue: blocks.dialogue,
          imageUrl: blocks.imageUrl,
          isNotable: blocks.isNotable,
          createdAt: blocks.createdAt,
          happenedAt: blocks.happenedAt,
          rowNum: sql<number>`ROW_NUMBER() OVER (ORDER BY ${blocks.index} ASC)`.as("row_num"),
        })
        .from(blocks)
        .where(eq(blocks.projectId, projectId))
    );

    // 2. Query from the CTE using inArray for the indices
    const result = await this.db
      .with(numberedBlocks)
      .select({
        id: numberedBlocks.id,
        index: numberedBlocks.index,
        projectId: numberedBlocks.projectId,
        title: numberedBlocks.title,
        content: numberedBlocks.content,
        dialogue: numberedBlocks.dialogue,
        imageUrl: numberedBlocks.imageUrl,
        isNotable: numberedBlocks.isNotable,
        createdAt: numberedBlocks.createdAt,
        happenedAt: numberedBlocks.happenedAt,
      })
      .from(numberedBlocks)
      .where(inArray(numberedBlocks.rowNum, indices))
      .orderBy(numberedBlocks.rowNum);

    // 3. Map the results
    // Note: Drizzle automatically handles camelCase mapping if your 
    // schema/config is set up for it, removing the need for manual row.id -> id mapping.
    return result.map((row) => ({
      ...row,
      isNotable: row.isNotable ?? false,
      // Drizzle automatically parses timestamps into Date objects if defined in schema
      createdAt: row.createdAt ?? null,
      happenedAt: row.createdAt ? new Date(row.createdAt).getTime() : new Date().getTime()
    }));
  }
}