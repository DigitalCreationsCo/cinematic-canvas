// src/shared/messaging/pubsub-event-bus.ts
// ─────────────────────────────────────────────────────────────────────────────
// CHANGES:
//   publishJobEvent — adds `userId` as a message attribute so GCP PubSub
//   subscriptions can filter per-user at the broker level, avoiding fan-out
//   to every connected SSE session.
// ─────────────────────────────────────────────────────────────────────────────
import { PubSub, Topic, Message, Subscription, CreateSubscriptionOptions } from '@google-cloud/pubsub';
import { IEventBus, SubscriptionOptions as EventBusSubscriptionOptions } from './event-bus.types.js';
import { TOPIC_NAMES } from '../config.js';
import { PipelineCommand, PipelineEvent } from '../types/pipeline.types.js';
import { JobEvent } from '../types/job.types.js';

type SubscriptionOptions = EventBusSubscriptionOptions & CreateSubscriptionOptions

export class PubSubEventBus implements IEventBus {
    private pubsub: PubSub;
    private activeSubscriptions: Map<string, { sub: Subscription; handler: (data: any) => Promise<void>; opts?: SubscriptionOptions }> = new Map();

    constructor(projectId: string) {
        this.pubsub = new PubSub({
            projectId,
            ...(process.env.PUBSUB_EMULATOR_HOST ? { apiEndpoint: process.env.PUBSUB_EMULATOR_HOST } : {}),
        });
    }

    async publishCommand(command: PipelineCommand) {
        const topic = await this.ensureTopic(TOPIC_NAMES.PIPELINE_COMMANDS_TOPIC_NAME);
        const data = Buffer.from(JSON.stringify(command));
        return topic.publishMessage({
            data,
            attributes: {
                type: command.type,
                projectId: command.projectId,
            }
        });
    }

    async publishPipelineEvent(event: PipelineEvent) {
        const topic = await this.ensureTopic(TOPIC_NAMES.PIPELINE_EVENTS_TOPIC_NAME);
        const data = Buffer.from(JSON.stringify(event));
        return topic.publishMessage({
            data,
            attributes: {
                type: event.type,
                projectId: event.projectId,
            }
        });
    }

    async publishJobEvent(event: JobEvent) {
        const topic = await this.ensureTopic(TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME);
        const data = Buffer.from(JSON.stringify(event));
        return topic.publishMessage({
            data,
            attributes: {
                type: event.type,
                projectId: event.projectId,
                // ── NEW ──────────────────────────────────────────────────────
                // userId is published as a message attribute so per-user
                // PubSub subscription filters work:
                //   filter: `attributes.projectId = "..." AND attributes.userId = "..."`
                // Without this attribute the filter would be silently ignored,
                // causing all job events to fan-out to every SSE session.
                userId: event.userId,
            }
        });
    }

    async subscribeToCommands(name: string, handler: (c: PipelineCommand) => Promise<void>, opts?: SubscriptionOptions) {
        await this.setupSubscription(TOPIC_NAMES.PIPELINE_COMMANDS_TOPIC_NAME, name, handler, opts);
    }

    async subscribeToPipelineEvents(name: string, handler: (e: PipelineEvent) => Promise<void>, opts?: SubscriptionOptions) {
        await this.setupSubscription(TOPIC_NAMES.PIPELINE_EVENTS_TOPIC_NAME, name, handler, opts);
    }

    async subscribeToJobEvents(name: string, handler: (j: JobEvent) => Promise<void>, opts?: SubscriptionOptions) {
        await this.setupSubscription(TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME, name, handler, opts);
    }

    private async setupSubscription(
        topicName: string,
        subName: string,
        handler: (data: any) => Promise<void>,
        opts?: SubscriptionOptions
    ) {
        const { temporary, ...pubsubOpts } = opts || {};

        const topic = await this.ensureTopic(topicName);
        await this.ensureSubscription(topic, subName, pubsubOpts);

        const sub = this.pubsub.subscription(subName, { flowControl: { maxMessages: 1 } });
        sub.on('message', async (message: Message) => {
            try {
                const data = JSON.parse(message.data.toString());
                message.ackWithResponse();
                await handler(data);
            } catch (error) {
                console.error(`[PubSub] Error processing message ${message.id}:`, error);
                message.nack();
            }
        });

        this.activeSubscriptions.set(subName, { sub, handler, opts });
    }

    private async ensureTopic(name: string): Promise<Topic> {
        const topic = this.pubsub.topic(name);
        const [exists] = await topic.exists();
        if (!exists) await topic.create();
        return topic;
    }

    private async ensureSubscription(topic: Topic, name: string, opts?: CreateSubscriptionOptions) {
        const sub = this.pubsub.subscription(name);
        const [exists] = await sub.exists();
        if (!exists) await topic.createSubscription(name, opts);
    }

    async unsubscribe(name: string): Promise<void> {
        const sub = this.activeSubscriptions.get(name);
        if (sub) {
            sub.sub.removeListener('message', sub.handler)
            if (sub.opts?.temporary) {
                await sub.sub.delete().catch(() => { });
            } else {
                await sub.sub.close().catch(() => { });
            }
            this.activeSubscriptions.delete(name);
        }
    }

    async close(): Promise<void> {
        const teardown = Array.from(this.activeSubscriptions.values()).map(async ({ sub, opts }) => {
            if (opts?.temporary) {
                await sub.delete().catch(() => { });
            } else {
                await sub.close().catch(() => { });
            }
        });
        await Promise.all(teardown);
        await this.pubsub.close();
    }
}