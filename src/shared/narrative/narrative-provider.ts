import { sql, asc, eq, and, count } from "drizzle-orm";
import { NarrativeProvider as BaseNarrativeProvider, BaseNarrativeBlock, BaseNarrativeLore, HybridCandidate } from "narrative-engine";
import { blocks, Block, lore, Lore } from "#shared/db/schema.js";
import { DbTransaction } from "#shared/db/index.js";

// TODO IPLEMENT SCHEMA TABLES
// TODO IMPLEMENT TABLE INDEXES
// TDODO ACTIVATE TSVECTOR EXTENSTION IN DB
// TODO CHOOSE VECTOR SEARCH OR NO VECTOR SEARCH??
// TEST ALL QUERIES AS VALID

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

  async getLoreAtoms(channelId: string): Promise<BaseNarrativeLore[]> {
    const result = await this.db
      .select()
      .from(lore)
      .where(and(eq(lore.channelId, channelId), eq(lore.isActive, true)))
      .orderBy(asc(lore.id));
    return result.map(row => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      happenedAt: row.createdAt ? new Date(row.createdAt).getTime() : new Date().getTime()
    }));
  }

  async getHybridSearchCandidates(channelId: string, query: string, limit: number): Promise<HybridCandidate<BaseNarrativeBlock>[]> {
    const queryEmbedding = await generateEmbedding(query);
    const queryEmbeddingStr = JSON.stringify(queryEmbedding);

    const result = await this.db.execute(sql`
          WITH 
            matched_blocks AS (
              SELECT 
                b.id,
                b.channel_id,
                b.title,
                b.content,
                b.image_url,
                b.option_a,
                b.option_b,
                b.is_notable,
                b.embedding,
                b.created_at,
                ts_rank(b.search_vector, plainto_tsquery('english', ${query})) AS raw_ts_rank
              FROM blocks b
              WHERE b.channel_id = ${channelId}
                AND b.embedding IS NOT NULL
                AND b.search_vector @@ plainto_tsquery('english', ${query})
            ),
            max_ts AS (
              SELECT COALESCE(MAX(raw_ts_rank), 1) as max_rank FROM matched_blocks
            )
          SELECT 
            m.*,
            1 - (m.embedding <=> ${queryEmbeddingStr}::vector) AS score_vector_dense,
            COALESCE(m.raw_ts_rank / NULLIF(mt.max_rank, 0), 0) AS score_keyword_sparse
          FROM matched_blocks m, max_ts mt
          ORDER BY score_vector_dense DESC, score_keyword_sparse DESC
          LIMIT ${limit}
        `);

    return (result.rows as any[]).map(row => ({
      block: {
        id: row.id,
        index: row.id,
        channelId: row.channel_id,
        title: row.title,
        content: row.content,
        imageUrl: row.image_url,
        optionA: row.option_a,
        optionB: row.option_b,
        isNotable: row.is_notable ?? false,
        embedding: row.embedding,
        createdAt: row.created_at ? new Date(row.created_at) : null,
        happenedAt: row.created_at ? new Date(row.created_at).getTime() : 0,
      },
      scoreVectorDense: Number(row.score_vector_dense) || 0,
      scoreKeywordSparse: Number(row.score_keyword_sparse) || 0,
    }));
  }

  async getNotableEvents(channelId: string): Promise<BaseNarrativeBlock[]> {
    const result = await this.db
      .select()
      .from(blocks)
      .where(and(eq(blocks.channelId, channelId), eq(blocks.isNotable, true)))
      .orderBy(asc(blocks.id));
    return result.map(row => ({
      ...row,
      index: row.id,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      happenedAt: row.createdAt ? new Date(row.createdAt).getTime() : new Date().getTime()
    }));
  }

  async getBlocksByIndices(projectId: string, indices: number[]): Promise<BaseNarrativeBlock[]> {
    return (await this.getBlocksBySequence(projectId, indices)).map((row) => ({
      ...row,
      index: row.id,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      happenedAt: row.createdAt ? new Date(row.createdAt).getTime() : new Date().getTime()
    }));
  }

  private async getBlocksBySequence(projectId: string, indices: number[]): Promise<Block[]> {
    if (indices.length === 0) return [];

    const result = await this.db.execute(sql`
      WITH numbered AS (
        SELECT b.*, ROW_NUMBER() OVER (ORDER BY b.id ASC) as row_num
        FROM blocks b
        WHERE b.project_id = ${projectId}
      )
      SELECT * FROM numbered WHERE row_num IN ${indices}
      ORDER BY row_num ASC
    `);

    return (result.rows as any[]).map(row => ({
      id: row.id,
      channelId: row.channel_id,
      sessionId: row.session_id,
      title: row.title,
      content: row.content,
      imageUrl: row.image_url,
      optionA: row.option_a,
      optionB: row.option_b,
      isNotable: row.is_notable ?? false,
      embedding: row.embedding,
      createdAt: row.created_at ? new Date(row.created_at) : null,
    })) as Block[];
  }
}