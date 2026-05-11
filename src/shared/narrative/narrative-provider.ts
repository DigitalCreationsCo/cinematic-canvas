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

  // Public overloads
  async getHybridSearchCandidates(
    projectId: string,
    query: string,
    limit: number,
  ): Promise<HybridCandidate<Block>[]>;
  async getHybridSearchCandidates(
    projectId: string,
    queries: string[],
    limit: number,
  ): Promise<Map<string, HybridCandidate<Block>[]>>;
  async getHybridSearchCandidates(
    projectId: string,
    queryOrQueries: string | string[],
    limit: number,
  ): Promise<HybridCandidate<Block>[] | Map<string, HybridCandidate<Block>[]>> {
    if (Array.isArray(queryOrQueries)) {
      return this.batchHybridSearch(projectId, queryOrQueries, limit);
    }
    const map = await this.batchHybridSearch(projectId, [queryOrQueries], limit);
    return map.get(queryOrQueries) ?? [];
  }

  // Single DB round-trip for N queries via UNION ALL
  private async batchHybridSearch(
    projectId: string,
    queries: string[],
    limit: number,
  ): Promise<Map<string, HybridCandidate<Block>[]>> {
    if (queries.length === 0) return new Map();

    const subqueries = queries.map((q) =>
      this.db
        .select({
          queryTag: sql<string>`${q}::text`.as("query_tag"),
          id: blocks.id,
          index: blocks.index,
          projectId: blocks.projectId,
          title: blocks.title,
          content: blocks.content,
          imageUrl: blocks.imageUrl,
          isNotable: blocks.isNotable,
          createdAt: blocks.createdAt,
          rawTsRank: sql<number>`ts_rank(${blocks.searchVector}, plainto_tsquery('english', ${q}))`.as("raw_ts_rank"),
        })
        .from(blocks)
        .where(
          and(
            eq(blocks.projectId, projectId),
            sql`${blocks.searchVector} @@ plainto_tsquery('english', ${q})`,
          ),
        ),
    );

    const [first, ...rest] = subqueries;
    if (!first) return new Map();

    // Single DB call
    const rows = await rest.reduce((acc, q) => acc.unionAll(q) as any, first);

    // Group by originating query
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const bucket = grouped.get(row.queryTag) ?? [];
      bucket.push(row);
      grouped.set(row.queryTag, bucket);
    }

    // Normalise scores within each group, sort, cap at limit
    const result = new Map<string, HybridCandidate<Block>[]>();
    for (const [query, group] of grouped) {
      const maxRank = Math.max(...group.map((r) => r.rawTsRank), 1);
      const candidates: HybridCandidate<Block>[] = group
        .map((row) => ({
          block: {
            id: row.id,
            index: row.index,
            projectId: row.projectId,
            title: row.title,
            content: row.content,
            imageUrl: row.imageUrl,
            isNotable: row.isNotable ?? false,
            createdAt: row.createdAt ?? null,
            happenedAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
          },
          scoreKeywordSparse: row.rawTsRank / maxRank,
          scoreVectorDense: 0,
        }))
        .sort((a, b) => b.scoreKeywordSparse - a.scoreKeywordSparse)
        .slice(0, limit);
      result.set(query, candidates);
    }

    // Guarantee every requested query has an entry, even if FTS returned no rows
    for (const q of queries) {
      if (!result.has(q)) result.set(q, []);
    }

    return result;
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