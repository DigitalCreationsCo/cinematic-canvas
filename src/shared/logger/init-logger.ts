import { logger } from './logger.js';
import { LogContext } from './log-context.js';
import { format } from 'util';
import { AsyncLocalStorage } from 'async_hooks';
import { Topic } from '@google-cloud/pubsub';
import { PipelineEvent } from '../types/pipeline.types.js';

export type { LogContext };
export const logContextStore = new AsyncLocalStorage<LogContext>();

export function initLogger(
    publishMessage?: Topic['publishMessage']
) {

    const publishPipelineEventInternal = async (event: PipelineEvent) => {
        if (publishMessage) {
            const dataBuffer = Buffer.from(JSON.stringify(event));
            await publishMessage({
                data: dataBuffer,
                attributes: { type: event.type, projectId: event.projectId }
            });
        }
    }

    const handleIntercept = async (level: 'info' | 'warn' | 'error', args: any[]) => {
        const context = logContextStore.getStore();

        const hasObject = typeof args[0] === 'object' && args[0] !== null;
        let metadata = hasObject ? { ...args[0] } : {};
        const messageArgs = hasObject ? args.slice(1) : args;
        const message = format(...messageArgs);

        const { shouldPublish = false, ...cleanContext } = context || {};

        // Robust error extraction
        let errorToLog = metadata.error || metadata.err;
        if (!errorToLog) {
            errorToLog = args.find(a => a instanceof Error);
        }

        if (errorToLog instanceof Error) {
            metadata.error = {
                name: errorToLog.name,
                message: errorToLog.message,
                stack: errorToLog.stack,
                cause: errorToLog.cause,
                ...(errorToLog as any).metadata // Capture any custom metadata attached to the error
            };
        }

        logger[level]({ ...cleanContext, ...metadata }, message);

        if (shouldPublish === true && context && context.projectId && publishPipelineEventInternal) {
            let refinedMessage = message;

            if (level === 'error' || metadata.error) {
                if (metadata.error) {
                    refinedMessage = `${metadata.error.name}: ${metadata.error.message}`;
                } else {
                    refinedMessage = message.split('Execution failed:').pop()?.trim() || message;
                }
            }

            publishPipelineEventInternal({
                type: "LOG",
                projectId: context.projectId,
                correlationId: context.correlationId,
                timestamp: new Date().toISOString(),
                payload: {
                    level,
                    message: refinedMessage,
                    job_id: context.jobId,
                    ...(metadata.error && { error: metadata.error })
                },
            }).catch(err => {
                logger.error({ err }, "Failed to publish log to pipeline");
            });
        }
    };

    console.log = (...args) => handleIntercept('info', args);
    console.warn = (...args) => handleIntercept('warn', args);
    console.error = (...args) => handleIntercept('error', args);
}