import fs from 'fs';
import path from 'path';
import { logContextStore } from '../logger/index.js';

export class PromptLogger {
    private static sanitize(obj: any): any {
        if (!obj) return obj;
        if (typeof obj === 'string') {
            // Heuristic: Truncate very long strings that look like base64 or binary data
            // But keep prompts intact.
            // If it's > 5KB and has no spaces, likely base64.
            if (obj.length > 5000 && !obj.includes(' ')) {
                return `<truncated_string_len_${obj.length}>`;
            }
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitize(item));
        }
        if (typeof obj === 'object') {
            const newObj: any = {};
            for (const key in obj) {
                if (key === 'inlineData' && obj[key]?.data) {
                    newObj[key] = { ...obj[key], data: `<base64_data_truncated_len_${obj[key].data.length}>` };
                } else if ((key === 'image' || key === 'video') && typeof obj[key] === 'string' && obj[key].length > 1000) {
                    newObj[key] = `<binary_data_truncated_len_${obj[key].length}>`;
                } else if (key === 'imageBytes') {
                    newObj[key] = `<image_bytes_truncated>`;
                } else {
                    newObj[key] = this.sanitize(obj[key]);
                }
            }
            return newObj;
        }
        return obj;
    }

    private static getLogDirectory(projectId: string, jobId: string, jobType: string): string {
        const baseDir = process.env.PROMPT_LOG_DIR || path.join(process.cwd(), 'logs', 'prompts');
        // Organize by Project -> Job -> Stage (Job Type)
        return path.join(baseDir, projectId, jobId, jobType);
    }

    static async log(params: {
        model: string;
        type: 'text' | 'image' | 'video' | 'quality';
        input: any;
        parameters?: any;
    }) {
        if (process.env.LOG_PROMPTS !== 'true') {
            return;
        }

        try {
            const context = logContextStore.getStore();
            const projectId = context?.projectId || 'unknown-project';
            const jobId = context?.jobId || 'unknown-job';
            // Default to 'unknown-stage' if jobType is not set in context yet
            const jobType = context?.['jobType'] || 'unknown-stage';
            const attempt = context?.['attempt'] || 0;

            const logDir = this.getLogDirectory(projectId, jobId, jobType);

            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            // Use attempt number to allow overwriting on retries of the same attempt

            const filename = `${attempt}-${params.type}.json`;


            const filePath = path.join(logDir, filename);


            const logEntry = this.sanitize({
                timestamp: new Date().toISOString(),
                ...context,
                ...params
            });

            await fs.promises.writeFile(filePath, JSON.stringify(logEntry, null, 2));

        } catch (error) {
            console.warn('Failed to log prompt:', error);
            // Don't fail the job just because logging failed
        }
    }
}
