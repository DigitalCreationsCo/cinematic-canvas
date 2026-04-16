/**
 * PubSub Testing Module
 *
 * REPL-friendly testing utilities for Google Cloud PubSub.
 *
 * @example
 * ```typescript
 * import pubsubTesting from "./pubsub-testing/index.js";
 *
 * // Publish a FULL_STATE event
 * await pubsubTesting.givenFullState({ scenario: "rich" });
 *
 * // Dispatch a job
 * await pubsubTesting.givenJobDispatch("EXPAND_CREATIVE_PROMPT", "proj-123");
 *
 * // Dispatch a chain of jobs
 * await pubsubTesting.givenJobChain("proj-123", 500);
 *
 * // Complete workflow
 * await pubsubTesting.givenWorkflow({ audio: true, sceneCount: 5 });
 * ```
 *
 * Or use the REPL:
 * ```bash
 * npx tsx scripts/pubsub-testing/repl.ts
 * ```
 */

export { pubsubTesting as default, pubsubTesting } from "./repl.js";
export type { PubSubTestPublisher, PublisherConfig, PublishResult, BatchPublishOptions, BatchPublishResult } from "./publisher.js";
export {
    TestScenarios,
    createTestScene,
    createTestCharacter,
    createTestLocation,
    createTestStoryboard,
    createTestProjectMetadata,
    createTestProject,
    createMockJobPayload,
    createTestJob,
    createFullStateEvent,
    createJobEvent,
    type PublishableEvent,
} from "./fixtures.js";
