import pino from 'pino';
import os from 'os';



const isDev = process.env.NODE_ENV !== 'production';
const hostname = os.hostname().toLowerCase();
const pid = process.pid;

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // Base identity
    base: {
        w_id: `${hostname}-${pid}`,
    },
    formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: () => `,"ts_iso":"${new Date().toISOString()}","ts_human":"${new Date().toLocaleString()}"`,
    transport: isDev ? {
        target: 'pino-pretty',
        options: {
            colorize: true, translateTime: 'SYS:standard', ignore: 'w_id,env'
        }
    } : undefined,
});
