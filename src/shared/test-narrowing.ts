export interface TestConfig {
    foo?: string;
    bar: string | null;
}

export function testNarrowing(config?: TestConfig) {
    if (config) {
        // config is narrowed to TestConfig
        console.log(config.bar);
        if (config.foo) {
            // config.foo is narrowed to string
            const s: string = config.foo;
            console.log(s);
        }
        if (config.bar !== null) {
            // config.bar is narrowed to string
            const s: string = config.bar;
            console.log(s);
        }
    }
}
