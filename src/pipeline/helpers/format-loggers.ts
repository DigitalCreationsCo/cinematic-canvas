// Only intercept console methods when projectId context exists AND filter out LLM response JSON
function shouldPublishLog(message: any): boolean {
    // Don't publish if message looks like LLM JSON response
    if (typeof message === 'string') {
        const trimmed = message.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                JSON.parse(trimmed);
                return false; // It's valid JSON, likely an LLM response
            } catch {
                // Not valid JSON, safe to publish
            }
        }
    }
    return true;
}

export function formatLoggers(store: { getStore: () => string | undefined; }, publishPipelineEvent: (event: any) => Promise<void>) {
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    
    console.log = (message?: any, ...optionalParams: any[]) => {
        originalConsoleLog(message, ...optionalParams);
    
        const projectId = store.getStore();
        if (projectId && shouldPublishLog(message)) {
            const formattedMessage = [ message, ...optionalParams ]
                .map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
                .join(' ');
    
            publishPipelineEvent({
                type: "LOG",
                projectId,
                payload: { level: "info", message: formattedMessage },
                timestamp: new Date().toISOString(),
            }).catch(err => originalConsoleError("Failed to publish log event:", err));
        }
    };
    
    console.warn = (message?: any, ...optionalParams: any[]) => {
        originalConsoleLog(message, ...optionalParams);
    
        const projectId = store.getStore();
        if (projectId && shouldPublishLog(message)) {
            const formattedMessage = [ message, ...optionalParams ]
                .map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
                .join(' ');
    
            publishPipelineEvent({
                type: "LOG",
                projectId,
                payload: { level: "warning", message: formattedMessage },
                timestamp: new Date().toISOString(),
            }).catch(err => originalConsoleError("Failed to publish log event:", err));
        }
    };
    
    console.error = (message?: any, ...optionalParams: any[]) => {
        originalConsoleLog(message, ...optionalParams);
    
        const projectId = store.getStore();
        if (projectId && shouldPublishLog(message)) {
            const formattedMessage = [ message, ...optionalParams ]
                .map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))
                .join(' ');
    
            publishPipelineEvent({
                type: "LOG",
                projectId,
                payload: { level: "error", message: formattedMessage },
                timestamp: new Date().toISOString(),
            }).catch(err => originalConsoleError("Failed to publish log event:", err));
        }
    };
}