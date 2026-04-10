// src/shared/messaging/event-bus.types.ts
import { PipelineCommand, PipelineEvent } from '../types/pipeline.types.js';
import { JobEvent } from '../types/job.types.js';

export interface SubscriptionOptions {
    temporary?: boolean; // If true, sub is deleted on close (for cancellation signals)
}

export interface IEventBus {
    publishCommand(command: PipelineCommand): Promise<string>;
    publishPipelineEvent(event: PipelineEvent): Promise<string>;
    publishJobEvent(event: JobEvent): Promise<string>;

    subscribeToCommands(
        name: string,
        handler: (cmd: PipelineCommand) => Promise<void>,
        opts?: SubscriptionOptions & any
    ): Promise<void>;

    subscribeToPipelineEvents(
        name: string,
        handler: (evt: PipelineEvent) => Promise<void>,
        opts?: SubscriptionOptions & any
    ): Promise<void>;

    subscribeToJobEvents(
        name: string,
        handler: (evt: JobEvent) => Promise<void>,
        opts?: SubscriptionOptions & any
    ): Promise<void>;

    unsubscribe(name: string, handler?: (data: any) => Promise<void>): Promise<void>;

    close(): Promise<void>;
}