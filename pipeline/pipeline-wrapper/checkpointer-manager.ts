import { PostgresCheckpointer } from "@langchain/langgraph-postgres";
import { RunnableConfig } from "@langchain/core/runnables";
// Assuming GraphState and other required types are available relative to pipeline structure
// Based on environment details, pipeline/types.ts exists.
import { GraphState } from "../types"; 

const POSTGRES_URL = process.env.POSTGRES_URL;

if (!POSTGRES_URL) {
    // This throw is fine for initialization logic, but might need better handling if this is run outside Docker context where env vars are set.
    console.error("POSTGRES_URL environment variable not set for Checkpointer initialization.");
    // Throwing here is fine for a dedicated manager class initialization failure.
    throw new Error("POSTGRES_URL environment variable not set for Checkpointer.");
}

/**
 * Manages loading and saving graph state checkpoints using PostgreSQL.
 */
export class CheckpointerManager {
    private checkpointer: PostgresCheckpointer;
    
    constructor() {
        this.checkpointer = new PostgresCheckpointer({
            connectionString: POSTGRES_URL,
        });
    }

    /**
     * Loads the latest checkpoint state for a given runnable (pipeline).
     * @param config Configuration containing the ID for the runnable (e.g., pipelineId or videoId).
     */
    async loadCheckpoint(config: Partial<RunnableConfig>): Promise<GraphState> {
        const checkpoint = await this.checkpointer.load!(config);
        
        // Placeholder for initial state if no checkpoint is found. 
        // This must be replaced with actual initial state structure later.
        const initialGraphState: GraphState = { 
            scenes: [], 
            currentSceneId: 1,
            globalMetadata: { status: "initialized" }
        } as unknown as GraphState; 
        
        if (!checkpoint || !checkpoint.channel_state) {
            return initialGraphState;
        }

        // The state stored in LangGraph checkpoints is usually in checkpoint.channel_state
        return checkpoint.channel_state as GraphState;
    }
    
    /**
     * Saves the current state to the checkpointer.
     * @param config Configuration containing the ID for the runnable.
     * @param state The state to save.
     */
    async saveCheckpoint(config: Partial<RunnableConfig>, state: GraphState): Promise<void> {
        await this.checkpointer.put(config, { channel_state: state });
    }

    /**
     * Returns the checkpointer object to be used when compiling the graph.
     */
    getCheckpointer() {
        return this.checkpointer;
    }
}