/**
 * PubSub Publisher for Testing
 * Provides type-safe utilities for publishing messages to pubsub topics
 */

import * as dotenv from "dotenv";
dotenv.config();

import { PubSub } from "@google-cloud/pubsub";
import type { PipelineEvent, PipelineCommand } from "../../src/shared/types/pipeline.types.js";
import type { JobEvent } from "../../src/shared/types/job.types.js";
import { TOPIC_NAMES } from "../../src/shared/config.js";
import { PublishableEvent } from "./fixtures.js";

// ============================================================================
// PUBLISHER CONFIGURATION
// ============================================================================

export interface PublisherConfig {
    projectId?: string;
    emulatorHost?: string;
    dryRun?: boolean;
}

export type PublishResult<T extends PublishableEvent> = {
    success: boolean;
    messageId?: string;
    error?: string;
    topicName: string;
    payload: T;
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
            emulatorHost: config.emulatorHost ?? process.env.PUBSUB_EMULATOR_HOST ?? "localhost:8085",
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
    async publishJobEvent(event: JobEvent): Promise<PublishResult<JobEvent>> {
        return await this.publish(TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME, event, { type: event.type, projectId: event.projectId, userId: event.userId });
    }

    async publishPipelineEvent(event: PipelineEvent): Promise<PublishResult<PipelineEvent>> {
        return await this.publish(
            TOPIC_NAMES.PIPELINE_EVENTS_TOPIC_NAME,
            event,
            { type: event.type, projectId: event.projectId }
        );
    }

    /**
     * Publish a command to the pipeline-commands topic
     */
    async publishCommand(command: PipelineCommand): Promise<PublishResult<PipelineCommand>> {
        return await this.publish(TOPIC_NAMES.PIPELINE_COMMANDS_TOPIC_NAME, command, { type: command.type, projectId: command.projectId });
    }

    /**
     * Publish raw message to a specific topic
     */
    async publishRaw(
        topicName: string,
        data: unknown,
        attributes?: Record<string, string>
    ): Promise<PublishResult<PublishableEvent>> {
        return this.publish(topicName, data, attributes);
    }

    private async publish(
        topicName: string,
        data: unknown,
        attributes: Record<string, string> = {}
    ): Promise<PublishResult<PublishableEvent>> {
        const payload = typeof data === 'object' && data !== null
            ? { ...data, timestamp: new Date().toISOString() }
            : { data, timestamp: new Date().toISOString() };

        if (this.config.dryRun) {
            console.log(`[DRY RUN] Would publish to ${topicName}:`, JSON.stringify(payload, null, 2));
            return { success: true, topicName, payload: payload as any };
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
                payload: payload as any,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to publish to "${topicName}":`, errorMessage);
            return {
                success: false,
                error: errorMessage,
                topicName,
                payload: payload as any,
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
                jobEvents: TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME,
                pipelineEvents: TOPIC_NAMES.PIPELINE_EVENTS_TOPIC_NAME,
                pipelineCommands: TOPIC_NAMES.PIPELINE_COMMANDS_TOPIC_NAME,
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
    results: PublishResult<PublishableEvent>[];
}

export async function publishBatch(
    publisher: PubSubTestPublisher,
    events: Array<{ type: "job" | "pipeline" | "command"; data: JobEvent | PipelineEvent | PipelineCommand }>,
    options: BatchPublishOptions = {}
): Promise<BatchPublishResult> {
    const { delayMs = 100, continueOnError = true } = options;
    const results: PublishResult<PublishableEvent>[] = [];

    for (let i = 0; i < events.length; i++) {
        const { type, data } = events[i];

        try {
            let result: PublishResult<PublishableEvent>;
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
