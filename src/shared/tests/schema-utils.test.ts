// import { describe, it, expect, beforeEach } from 'vitest';
// import { drizzle } from 'drizzle-orm/node-postgres';
// import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';
// import { eq } from 'drizzle-orm';
// import {
//     nullableText,
//     nullableInteger,
//     nullableBoolean,
//     nullableTimestamp,
//     nullableJsonb
// } from '../db/schema-utils.js';

// // ============================================================================
// // TEST SCHEMA
// // ============================================================================

// const users = pgTable('users', {
//     id: integer('id').primaryKey(),
//     name: text('name').notNull(),
//     email: nullableText('email'),
//     bio: nullableText('bio'),
//     age: nullableInteger('age'),
//     isActive: nullableBoolean('is_active'),
//     lastLoginAt: nullableTimestamp('last_login_at'),
//     settings: nullableJsonb<{ theme?: string; lang?: string; }>('settings'),
//     createdAt: timestamp('created_at').notNull().defaultNow(),
// });

// // ============================================================================
// // UNIT TESTS FOR CUSTOM TYPES
// // ============================================================================

// describe('nullableText customType', () => {
//     it('should convert null from DB to undefined in app', () => {
//         const column = nullableText('test');
//         const result = column.mapFromDriverValue(null);
//         expect(result).toBeUndefined();
//     });

//     it('should convert undefined from app to null for DB', () => {
//         const column = nullableText('test');
//         const result = column.mapToDriverValue(undefined);
//         expect(result).toBeNull();
//     });

//     it('should preserve string values both ways', () => {
//         const column = nullableText('test');

//         // From DB
//         const fromDb = column.mapFromDriverValue('test@example.com');
//         expect(fromDb).toBe('test@example.com');

//         // To DB
//         const toDb = column.mapToDriverValue('test@example.com');
//         expect(toDb).toBe('test@example.com');
//     });
// });

// describe('nullableInteger customType', () => {
//     it('should convert null from DB to undefined in app', () => {
//         const column = nullableInteger('test');
//         const result = column.mapFromDriverValue(null);
//         expect(result).toBeUndefined();
//     });

//     it('should convert undefined from app to null for DB', () => {
//         const column = nullableInteger('test');
//         const result = column.mapToDriverValue(undefined);
//         expect(result).toBeNull();
//     });

//     it('should preserve number values both ways', () => {
//         const column = nullableInteger('test');

//         const fromDb = column.mapFromDriverValue(42);
//         expect(fromDb).toBe(42);

//         const toDb = column.mapToDriverValue(42);
//         expect(toDb).toBe(42);
//     });

//     it('should preserve zero value', () => {
//         const column = nullableInteger('test');

//         const fromDb = column.mapFromDriverValue(0);
//         expect(fromDb).toBe(0);

//         const toDb = column.mapToDriverValue(0);
//         expect(toDb).toBe(0);
//     });
// });

// describe('nullableBoolean customType', () => {
//     it('should convert null from DB to undefined in app', () => {
//         const column = nullableBoolean('test');
//         const result = column.mapFromDriverValue(null);
//         expect(result).toBeUndefined();
//     });

//     it('should convert undefined from app to null for DB', () => {
//         const column = nullableBoolean('test');
//         const result = column.mapToDriverValue(undefined);
//         expect(result).toBeNull();
//     });

//     it('should preserve boolean values both ways', () => {
//         const column = nullableBoolean('test');

//         const trueFromDb = column.mapFromDriverValue(true);
//         expect(trueFromDb).toBe(true);

//         const falseFromDb = column.mapFromDriverValue(false);
//         expect(falseFromDb).toBe(false);

//         const trueToDb = column.mapToDriverValue(true);
//         expect(trueToDb).toBe(true);

//         const falseToDb = column.mapToDriverValue(false);
//         expect(falseToDb).toBe(false);
//     });
// });

// describe('nullableTimestamp customType', () => {
//     it('should convert null from DB to undefined in app', () => {
//         const column = nullableTimestamp('test');
//         const result = column.mapFromDriverValue(null);
//         expect(result).toBeUndefined();
//     });

//     it('should convert undefined from app to null for DB', () => {
//         const column = nullableTimestamp('test');
//         const result = column.mapToDriverValue(undefined);
//         expect(result).toBeNull();
//     });

//     it('should convert timestamp string from DB to Date in app', () => {
//         const column = nullableTimestamp('test');
//         const isoString = '2024-01-01T10:30:00.000Z';
//         const result = column.mapFromDriverValue(isoString);

//         expect(result).toBeInstanceOf(Date);
//         expect(result?.toISOString()).toBe(isoString);
//     });

//     it('should convert Date from app to ISO string for DB', () => {
//         const column = nullableTimestamp('test');
//         const date = new Date('2024-01-01T10:30:00.000Z');
//         const result = column.mapToDriverValue(date);

//         expect(typeof result).toBe('string');
//         expect(result).toBe('2024-01-01T10:30:00.000Z');
//     });
// });

// describe('nullableJsonb customType', () => {
//     it('should convert null from DB to undefined in app', () => {
//         const column = nullableJsonb('test');
//         const result = column.mapFromDriverValue(null);
//         expect(result).toBeUndefined();
//     });

//     it('should convert undefined from app to null for DB', () => {
//         const column = nullableJsonb('test');
//         const result = column.mapToDriverValue(undefined);
//         expect(result).toBeNull();
//     });

//     it('should parse JSON string from DB to object in app', () => {
//         const column = nullableJsonb<{ theme: string; }>('test');
//         const jsonString = '{"theme":"dark"}';
//         const result = column.mapFromDriverValue(jsonString);

//         expect(result).toEqual({ theme: 'dark' });
//     });

//     it('should stringify object from app to JSON for DB', () => {
//         const column = nullableJsonb<{ theme: string; }>('test');
//         const obj = { theme: 'dark' };
//         const result = column.mapToDriverValue(obj);

//         expect(result).toBe('{"theme":"dark"}');
//     });

//     it('should handle nested objects', () => {
//         const column = nullableJsonb<{ user: { name: string; age: number; }; }>('test');
//         const obj = { user: { name: 'John', age: 30 } };

//         const toDb = column.mapToDriverValue(obj);
//         const fromDb = column.mapFromDriverValue(toDb!);

//         expect(fromDb).toEqual(obj);
//     });

//     it('should handle arrays', () => {
//         const column = nullableJsonb<string[]>('test');
//         const arr = [ 'a', 'b', 'c' ];

//         const toDb = column.mapToDriverValue(arr);
//         const fromDb = column.mapFromDriverValue(toDb!);

//         expect(fromDb).toEqual(arr);
//     });
// });

// // ============================================================================
// // INTEGRATION TESTS (Mock)
// // ============================================================================

// describe('Integration with schema (type checking)', () => {
//     it('should type nullable fields as T | undefined', () => {
//         type User = typeof users.$inferSelect;

//         // TypeScript should infer these as optional
//         const user: User = {
//             id: 1,
//             name: 'John',
//             email: undefined,      // Should be string | undefined
//             bio: undefined,        // Should be string | undefined
//             age: undefined,        // Should be number | undefined
//             isActive: undefined,   // Should be boolean | undefined
//             lastLoginAt: undefined,// Should be Date | undefined
//             settings: undefined,   // Should be { theme?: string } | undefined
//             createdAt: new Date(),
//         };

//         expect(user.email).toBeUndefined();
//         expect(user.bio).toBeUndefined();
//     });

//     it('should type insert fields as T | undefined', () => {
//         type InsertUser = typeof users.$inferInsert;

//         const newUser: InsertUser = {
//             id: 1,
//             name: 'Jane',
//             email: undefined,   // Can be undefined
//             bio: 'Developer',   // Or actual value
//             age: 25,
//         };

//         expect(newUser.email).toBeUndefined();
//         expect(newUser.bio).toBe('Developer');
//     });
// });

// describe('Round-trip conversions', () => {
//     it('should maintain data integrity through null -> undefined -> null', () => {
//         const email = nullableText('email');

//         // Simulate: NULL in DB -> undefined in app -> NULL in DB
//         const fromDb = email.mapFromDriverValue(null);
//         expect(fromDb).toBeUndefined();

//         const backToDb = email.mapToDriverValue(fromDb);
//         expect(backToDb).toBeNull();
//     });

//     it('should maintain data integrity through value -> value -> value', () => {
//         const email = nullableText('email');

//         // Simulate: 'test@example.com' in DB -> app -> DB
//         const fromDb = email.mapFromDriverValue('test@example.com');
//         expect(fromDb).toBe('test@example.com');

//         const backToDb = email.mapToDriverValue(fromDb);
//         expect(backToDb).toBe('test@example.com');
//     });

//     it('should handle Date objects correctly in round-trip', () => {
//         const timestamp = nullableTimestamp('created_at');
//         const originalDate = new Date('2024-01-01T10:30:00.000Z');

//         // App -> DB
//         const toDb = timestamp.mapToDriverValue(originalDate);
//         expect(toDb).toBe('2024-01-01T10:30:00.000Z');

//         // DB -> App
//         const fromDb = timestamp.mapFromDriverValue(toDb!);
//         expect(fromDb).toBeInstanceOf(Date);
//         expect(fromDb?.getTime()).toBe(originalDate.getTime());
//     });

//     it('should handle complex JSONB objects in round-trip', () => {
//         const settings = nullableJsonb<{
//             theme: string;
//             notifications: { email: boolean; push: boolean; };
//         }>('settings');

//         const originalSettings = {
//             theme: 'dark',
//             notifications: { email: true, push: false },
//         };

//         // App -> DB
//         const toDb = settings.mapToDriverValue(originalSettings);
//         expect(typeof toDb).toBe('string');

//         // DB -> App
//         const fromDb = settings.mapFromDriverValue(toDb!);
//         expect(fromDb).toEqual(originalSettings);
//     });
// });