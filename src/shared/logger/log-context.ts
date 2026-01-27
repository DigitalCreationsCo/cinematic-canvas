export interface LogContext {
    commandId?: string;
    jobId?: string;
    projectId?: string;
    w_id: string;
    serverId?: string;
    correlationId: string;
    shouldPublish: boolean;
    functionName?: string;
    [ key: string ]: any;
}