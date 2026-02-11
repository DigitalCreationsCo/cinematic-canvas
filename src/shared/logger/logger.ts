import pino from 'pino';
import os from 'os';
import path from 'path';



const isDev = process.env.NODE_ENV !== 'production';
const hostname = os.hostname().toLowerCase();
const pid = process.pid;

const logPath = path.join(process.cwd(), 'logs', 'application.log');

const targets: pino.TransportTargetOptions[] = [
     {
        target: isDev ? 'pino-pretty' : 'pino/file',
        options: isDev ? { 
            colorize: true, 
            translateTime: 'SYS:standard', 
            ignore: 'w_id,env' 
        } : { destination: 1 }, // Explicit stdout in production
        level: process.env.LOG_LEVEL || 'info',
    },
    //  {
    //     target: 'pino-roll',
    //     options: { 
    //         file: logPath,
    //         frequency: 2 * 24 * 60 * 60 * 1000, // ✅ 2 days in milliseconds
    //         limit: {
    //             count: 2 // Keep 2 rotated files
    //         },
    //         mkdir: true,
    //         sync: isDev
    //     },
    //     level: process.env.LOG_LEVEL || 'info',
    // }
];

export const logger = pino({
    level: 'trace',
    base: {
        w_id: `${hostname}-${pid}`,
    },
    formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: () => `,"ts_iso":"${new Date().toISOString()}","ts_human":"${new Date().toLocaleString()}"`,
}, pino.transport({ targets }));
