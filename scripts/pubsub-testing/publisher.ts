/**
 * PubSub Publisher for Testing
 * Provides type-safe utilities for publishing messages to pubsub topics
 */

import * as dotenv from "dotenv";
dotenv.config();

import { PubSub } from "@google-cloud/pubsub";
import type { PipelineEvent, PipelineCommand } from "../../src/shared/types/pipeline.types.js";
import type { JobEvent } from "../../src/shared/types/job.types.js";
import {
    JOB_EVENTS_TOPIC_NAME,
    PIPELINE_EVENTS_TOPIC_NAME,
    PIPELINE_COMMANDS_TOPIC_NAME,
} from "../../src/shared/config.js";

// ============================================================================
// PUBLISHER CONFIGURATION
// ============================================================================

export interface PublisherConfig {
    projectId?: string;
    emulatorHost?: string;
    dryRun?: boolean;
}

export interface PublishResult {
    success: boolean;
    messageId?: string;
    error?: string;
    topicName: string;
    payload: unknown;
}

// ============================================================================
// PUBLISHER CLASS
// ============================================================================

export class PubSubTestPublisher {
    private pubsub: PubSub;
    private config: Required<PublisherConfig>;

    constructor(config: PublisherConfig = {}) {
        this.config = {
            projectId: config.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? "test-project",
            emulatorHost: config.emulatorHost ?? process.env.PUBSUB_EMULATOR_HOST,
            dryRun: config.dryRun ?? false,
        };

        this.pubsub = new PubSub({
            projectId: this.config.projectId,
            ...(this.config.emulatorHost ? { apiEndpoint: this.config.emulatorHost } : undefined),
        });
    }

    /**
     * Publish a job event to the job-events topic
     */
    async publishJobEvent(event: JobEvent): Promise<PublishResult> {
        return this.publish(JOB_EVENTS_TOPIC_NAME, event, { type: event.type });
    }

    /**
     * Publish a pipeline event to the pipeline-events topic
     */
    async publishPipelineEvent(event: PipelineEvent): Promise<PublishResult> {
        return this.publish(PIPELINE_EVENTS_TOPIC_NAME, event, { type: event.type });
    }

    /**
     * Publish a command to the pipeline-commands topic
     */
    async publishCommand(command: PipelineCommand): Promise<PublishResult> {
        return this.publish(PIPELINE_COMMANDS_TOPIC_NAME, command, { type: command.type });
    }

    /**
     * Publish raw message to a specific topic
     */
    async publishRaw(
        topicName: string,
        data: unknown,
        attributes?: Record<string, string>
    ): Promise<PublishResult> {
        return this.publish(topicName, data, attributes);
    }

    /**
     * Internal publish method
     */
    private async publish(
        topicName: string,
        data: unknown,
        attributes: Record<string, string> = {}
    ): Promise<PublishResult> {
        const payload = typeof data === 'object' && data !== null
            ? { ...data, timestamp: new Date().toISOString() }
            : { data, timestamp: new Date().toISOString() };

        // Log in dry-run mode
        if (this.config.dryRun) {
            console.log(`[DRY RUN] Would publish to ${topicName}:`, JSON.stringify(payload, null, 2));
            return {
                success: true,
                topicName,
                payload,
            };
        }

        try {
            const topic = this.pubsub.topic(topicName);
            const messageId = await topic.publishMessage({
                data: Buffer.from(JSON.stringify(payload)),
                attributes,
            });

            console.log(`✅ Published to ${topicName}: ${messageId}`);
            return {
                success: true,
                messageId,
                topicName,
                payload,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to publish to ${topicName}:`, errorMessage);
            return {
                success: false,
                error: errorMessage,
                topicName,
                payload,
            };
        }
    }

    /**
     * Close the pubsub client
     */
    async close(): Promise<void> {
        await this.pubsub.close();
    }

    /**
     * Get publisher status and configuration
     */
    getStatus(): Record<string, unknown> {
        return {
            projectId: this.config.projectId,
            emulatorHost: this.config.emulatorHost,
            dryRun: this.config.dryRun,
            topics: {
                jobEvents: JOB_EVENTS_TOPIC_NAME,
                pipelineEvents: PIPELINE_EVENTS_TOPIC_NAME,
                pipelineCommands: PIPELINE_COMMANDS_TOPIC_NAME,
            },
        };
    }
}

// ============================================================================
// BATCH PUBLISHING
// ============================================================================

export interface BatchPublishOptions {
    delayMs?: number;
    continueOnError?: boolean;
}

export interface BatchPublishResult {
    total: number;
    successful: number;
    failed: number;
    results: PublishResult[];
}

export async function publishBatch(
    publisher: PubSubTestPublisher,
    events: Array<{ type: "job" | "pipeline" | "command"; data: JobEvent | PipelineEvent | PipelineCommand }>,
    options: BatchPublishOptions = {}
): Promise<BatchPublishResult> {
    const { delayMs = 100, continueOnError = true } = options;
    const results: PublishResult[] = [];

    for (let i = 0; i < events.length; i++) {
        const { type, data } = events[i];

        try {
            let result: PublishResult;
            switch (type) {
                case "job":
                    result = await publisher.publishJobEvent(data as JobEvent);
                    break;
                case "pipeline":
                    result = await publisher.publishPipelineEvent(data as PipelineEvent);
                    break;
                case "command":
                    result = await publisher.publishCommand(data as PipelineCommand);
                    break;
            }
            results.push(result);

            if (!result.success && !continueOnError) {
                break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.push({
                success: false,
                error: errorMessage,
                topicName: "unknown",
                payload: data,
            });

            if (!continueOnError) {
                break;
            }
        }

        // Add delay between publishes
        if (delayMs > 0 && i < events.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
        total: events.length,
        successful,
        failed,
        results,
    };
}
