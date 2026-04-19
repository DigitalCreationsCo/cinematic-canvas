import { customType } from 'drizzle-orm/pg-core';

// custom tsvector type since Drizzle doesn't have it natively
export const tsvector = customType<{ data: string }>({
    dataType() {
        return 'tsvector';
    },
});

/**
 * Creates a custom column type that normalizes null <-> undefined
 * 
 * Database: stores NULL
 * Application: uses undefined
 */
export function optionalUUID(name: string) {
    return customType<{
        data: string | undefined;
        driverData: string | null;
    }>({
        dataType() {
            return 'uuid';
        },
        fromDriver(value: string | null): string | undefined {
            // Explicitly map null to undefined for the app
            return value === null ? undefined : value;
        },
        toDriver(value: string | undefined): string | null {
            // Explicitly map undefined to null for the DB
            return value === undefined ? null : value;
        },
    })(name);
}

export function nullableText(name: string) {
    return customType<{
        data: string | undefined;
        driverData: string | null;
    }>({
        dataType() {
            return 'text';
        },
        fromDriver(value: string | null): string | undefined {
            return value === null ? undefined : value;
        },
        toDriver(value: string | undefined): string | null {
            return value === undefined ? null : value;
        },
    })(name);
}

export function nullableInteger(name: string) {
    return customType<{
        data: number | undefined;
        driverData: number | null;
    }>({
        dataType() {
            return 'integer';
        },
        fromDriver(value: number | null): number | undefined {
            return value === null ? undefined : value;
        },
        toDriver(value: number | undefined): number | null {
            return value === undefined ? null : value;
        },
    })(name);
}

export function nullableBoolean(name: string) {
    return customType<{
        data: boolean | undefined;
        driverData: boolean | null;
    }>({
        dataType() {
            return 'boolean';
        },
        fromDriver(value: boolean | null): boolean | undefined {
            return value === null ? undefined : value;
        },
        toDriver(value: boolean | undefined): boolean | null {
            return value === undefined ? null : value;
        },
    })(name);
}

export function nullableTimestamp(name: string) {
    return customType<{
        data: Date | undefined;
        driverData: string | null;
    }>({
        dataType() {
            return 'timestamp';
        },
        fromDriver(value: string | null): Date | undefined {
            return value === null ? undefined : new Date(value);
        },
        toDriver(value: Date | undefined): string | null {
            return value === undefined ? null : value.toISOString();
        },
    })(name);
}

export function nullableJsonb<T = any>(name: string) {
    // return customType<{
    //     data: T | undefined;
    //     driverData: string | null;
    // }>({
    //     dataType() {
    //         return 'jsonb';
    //     },
    //     fromDriver(value): T | undefined {
    //         return value === null ? undefined : JSON.parse(JSON.stringify(value));
    //     },
    //     toDriver(value): string | null {
    //         return value === undefined ? null : JSON.stringify(value);
    //     },
    // })(name);
    return customType<{
        data: T | undefined;
        driverData: T | null;
    }>({
        dataType() {
            return 'jsonb';
        },
        fromDriver(value): T | undefined {
            return value === null ? undefined : JSON.parse(JSON.stringify(value));
        },
        toDriver(value): T | null {
            return value === undefined ? null : value;
        },
    })(name);
}