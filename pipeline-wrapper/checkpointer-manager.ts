import { RunnableConfig } from "@langchain/core/runnables";
import { GraphState } from "../pipeline/types"; 
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/**
 * Manages loading and saving graph states (checkpoints) to PostgreSQL using LangGraph's Postgres handler.
 */
export class CheckpointerManager {
  private checkpointer: PostgresSaver | null = null;
  private postgresUrl: string;

  constructor(postgresUrl: string) {
    if (!postgresUrl) {
      throw new Error("POSTGRES_URL must be provided to CheckpointerManager.");
    }
    this.postgresUrl = postgresUrl;
  }

  /**
   * Initializes the PostgresCheckpointer handler.
   */
  public async init(): Promise<void> {
    const checkpointer = PostgresSaver.fromConnString(this.postgresUrl);
    await checkpointer.setup();

    this.checkpointer = checkpointer;
  }

  /**
   * Returns the configured checkpointer instance.
   */
  public getCheckpointer() {
    if (!this.checkpointer) {
      throw new Error("CheckpointerManager has not been initialized. Call init() first.");
    }
    return this.checkpointer;
  }

  /**
   * Loads the latest state for a given run ID.
   * @param runId The unique identifier for the pipeline run.
   */
  public async loadCheckpoint(runId: string): Promise<GraphState> {
    if (!this.checkpointer) {
      throw new Error("CheckpointerManager not initialized.");
    }

    const config: RunnableConfig<GraphState> = { runId: runId };
    const loadedState = await this.checkpointer.get(config);

    return loadedState?.channel_values as GraphState;
  }

  /**
   * Saves the current state for a given run ID.
   * @param runId The unique identifier for the pipeline run.
   * @param state The current graph state.
   */
  public async saveCheckpoint(runId: string, state: GraphState): Promise<void> {
    if (!this.checkpointer) {
      throw new Error("CheckpointerManager not initialized.");
    }

    const config: RunnableConfig = { runId: runId };
    const existingCheckpoint = await this.checkpointer.get(config);
    console.debug('Existing checkpoint:', existingCheckpoint);

    await this.checkpointer.put(config, existingCheckpoint!, {} as any, {});
  }
}

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  throw new Error("POSTGRES_URL is required for CheckpointerManager initialization in environment.");
}

const manager = new CheckpointerManager(POSTGRES_URL);
await manager.init(); 

export const checkpointerManager = manager;
