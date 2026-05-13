import { customType } from "drizzle-orm/pg-core";
import { z } from "zod";

// custom tsvector type since Drizzle doesn't have it natively
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
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
      return "uuid";
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
      return "text";
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
      return "integer";
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
      return "boolean";
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
      return "timestamp";
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
  return customType<{
    data: T | undefined;
    driverData: string | null; // Changed from T | null
  }>({
    dataType() {
      return "jsonb";
    },
    fromDriver(value: string | null): T | undefined {
      if (value === null) return undefined;
      // Handle cases where the driver might return an object or a string
      try {
        return typeof value === "string" ? JSON.parse(value) : (value as T);
      } catch (e) {
        return value as unknown as T;
      }
    },
    toDriver(value: T | undefined): string | null {
      if (value === undefined) return null;
      // CRITICAL: Explicitly stringify to prevent [object Object] or malformed data
      return JSON.stringify(value);
    },
  })(name);
}

