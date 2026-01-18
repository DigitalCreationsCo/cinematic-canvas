import { logger } from './logger';
import { LogContext } from './log-context';
import { format } from 'util';
import os from 'os';
import { AsyncLocalStorage } from 'async_hooks';



export { LogContext };
export const logContextStore = new AsyncLocalStorage<LogContext>();

export function initLogger(
    publishPipelineEvent?: (event: any) => Promise<void>
) {

    const handleIntercept = async (level: 'info' | 'warn' | 'error', args: any[]) => {
        const context = logContextStore.getStore();

        const hasObject = typeof args[ 0 ] === 'object' && args[ 0 ] !== null;
        const metadata = hasObject ? args[ 0 ] : {};
        const messageArgs = hasObject ? args.slice(1) : args;
        const message = format(...messageArgs);

        const { shouldPublishLog, ...cleanContext } = context || {};

        logger[ level ]({ ...cleanContext, ...metadata }, message);

        if (shouldPublishLog === true && context && context.projectId && publishPipelineEvent) {
            publishPipelineEvent({
                type: "LOG",
                projectId: context.projectId,
                correlationId: context.correlationId,
                payload: {
                    level,
                    message,
                    job_id: context.jobId,
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