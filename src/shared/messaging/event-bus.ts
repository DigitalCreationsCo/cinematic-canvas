// src/shared/services/event-bus.ts
import { EventEmitter } from 'events';
import { TOPIC_NAMES } from '../config.js';
import { PipelineCommand, PipelineEvent } from '../types/pipeline.types.js';
import { JobEvent } from '../types/job.types.js';
import { IEventBus } from '#shared/messaging/event-bus.types.js';

export class InMemoryEventBus implements IEventBus {
    private emitter = new EventEmitter();

    /**
     * Maps subscriptionName -> { topic, wrapper }
     * Mirrors the 'activeSubscriptions' pattern in your PubSubEventBus.
     */
    private activeSubscriptions = new Map<string, {
        topic: string;
        wrapper: (data: any) => void
    }>();

    constructor() {
        this.emitter.setMaxListeners(100);
    }

    // ─── Publishing ──────────────────────────────────────────────────────────

    async publishCommand(command: PipelineCommand): Promise<string> {
        return this.internalPublish(TOPIC_NAMES.PIPELINE_COMMANDS_TOPIC_NAME, command);
    }

    async publishPipelineEvent(event: PipelineEvent): Promise<string> {
        return this.internalPublish(TOPIC_NAMES.PIPELINE_EVENTS_TOPIC_NAME, event);
    }

    async publishJobEvent(event: JobEvent): Promise<string> {
        return this.internalPublish(TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME, event);
    }

    private internalPublish(topic: string, data: any): string {
        const messageId = `local_${Date.now()}`;
        // setImmediate ensures this stays async, preventing stack overflows
        // and matching the behavior of a real network-based PubSub.
        setImmediate(() => this.emitter.emit(topic, data));
        return messageId;
    }

    // ─── Subscribing ──────────────────────────────────────────────────────────

    async subscribeToCommands(name: string, handler: (cmd: PipelineCommand) => Promise<void>) {
        this.setupLocalSub(TOPIC_NAMES.PIPELINE_COMMANDS_TOPIC_NAME, name, handler);
    }

    async subscribeToPipelineEvents(name: string, handler: (evt: PipelineEvent) => Promise<void>) {
        this.setupLocalSub(TOPIC_NAMES.PIPELINE_EVENTS_TOPIC_NAME, name, handler);
    }

    async subscribeToJobEvents(name: string, handler: (evt: JobEvent) => Promise<void>) {
        this.setupLocalSub(TOPIC_NAMES.JOB_EVENTS_TOPIC_NAME, name, handler);
    }

    private setupLocalSub(topic: string, name: string, handler: (data: any) => Promise<void>) {
        // Prevent duplicate subscriptions with the same name
        if (this.activeSubscriptions.has(name)) return;

        const wrapper = (data: any) => {
            handler(data).catch(err => console.error(`[EventBus:${name}] Handler error:`, err));
        };

        this.emitter.on(topic, wrapper);
        this.activeSubscriptions.set(name, { topic, wrapper });
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    async unsubscribe(name: string): Promise<void> {
        const sub = this.activeSubscriptions.get(name);
        if (sub) {
            this.emitter.removeListener(sub.topic, sub.wrapper);
            this.activeSubscriptions.delete(name);
        }
    }

    async close(): Promise<void> {
        this.emitter.removeAllListeners();
        this.activeSubscriptions.clear();
    }
}