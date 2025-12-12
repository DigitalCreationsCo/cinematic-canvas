export class RAIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RAIError';
    }
}
