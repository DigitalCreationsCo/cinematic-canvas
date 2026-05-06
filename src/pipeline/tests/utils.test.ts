import { describe, it, expect } from "vitest";
import {
  cleanJsonOutput,
  formatTime,
  roundToValidDuration,
  getModelCompatibleSchema,
} from "../../shared/utils/utils.js";
import { z } from "zod";
import { VALID_DURATIONS } from "#shared/types/base.types.js";

describe("Utility Functions", () => {
  describe("cleanJsonOutput", () => {
    it("should remove markdown code blocks", () => {
      const input = '```json\n{"key": "value"}\n```';
      const expected = '{"key": "value"}';
      expect(cleanJsonOutput(input)).toBe(expected);
    });

    it("should extract JSON object from surrounding text", () => {
      const input = 'Some text before {"key": "value"} and some text after';
      const expected = '{"key": "value"}';
      expect(cleanJsonOutput(input)).toBe(expected);
    });

    it("should handle nested JSON objects", () => {
      const input = '```json\n{"a": {"b": {"c": 1}}}\n```';
      const expected = '{"a": {"b": {"c": 1}}}';
      expect(cleanJsonOutput(input)).toBe(expected);
    });

    it("should return the original string if no JSON object is found", () => {
      const input = "this is a plain string";
      expect(cleanJsonOutput(input)).toBe(input);
    });
  });

  describe("formatTime", () => {
    it("should format seconds into MM:SS format", () => {
      expect(formatTime(65)).toBe("01:05");
      expect(formatTime(59)).toBe("00:59");
      expect(formatTime(120)).toBe("02:00");
      expect(formatTime(0)).toBe("00:00");
    });
  });

  describe("roundToValidDuration", () => {
    it("should round to the nearest valid duration", () => {
      expect(VALID_DURATIONS).toContain(roundToValidDuration(3));
      expect(VALID_DURATIONS).toContain(roundToValidDuration(5));
      expect(VALID_DURATIONS).toContain(roundToValidDuration(6));
      expect(VALID_DURATIONS).toContain(roundToValidDuration(7));
      expect(VALID_DURATIONS).toContain(roundToValidDuration(8));
      expect(VALID_DURATIONS).toContain(roundToValidDuration(10));
    });
  });

  describe("getModelCompatibleSchema", () => {
    it("should convert a simple Zod object schema to JSON schema", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const jsonSchema = getModelCompatibleSchema(schema);

      // Should return a valid JSON schema object
      expect(jsonSchema).toBeDefined();
      expect(typeof jsonSchema).toBe("object");
      expect(jsonSchema.type).toBe("object");
      expect(jsonSchema.properties).toBeDefined();
      expect(jsonSchema.properties.name).toBeDefined();
      expect(jsonSchema.properties.age).toBeDefined();
    });

    it("should handle dates in schema", () => {
      const schema = z.object({
        createdAt: z.date(),
      });

      const jsonSchema = getModelCompatibleSchema(schema);

      expect(jsonSchema).toBeDefined();
      expect(jsonSchema.properties?.createdAt).toBeDefined();
    });

    it("should handle UUID fields", () => {
      const schema = z.object({
        id: z.uuid(),
      });

      const jsonSchema = getModelCompatibleSchema(schema);

      expect(jsonSchema).toBeDefined();
      expect(jsonSchema.properties?.id).toBeDefined();
    });

    it("should handle nested objects", () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.email(),
        }),
      });

      const jsonSchema = getModelCompatibleSchema(schema);

      expect(jsonSchema).toBeDefined();
      expect(jsonSchema.properties?.user?.type).toBe("object");
      expect(jsonSchema.properties?.user?.properties?.name).toBeDefined();
    });

    it("should fallback to schema if toJSONSchema is not available", () => {
      // Mock a schema without toJSONSchema method
      const mockSchema = {
        _def: { typeName: "ZodObject" },
      } as any;

      const result = getModelCompatibleSchema(mockSchema);

      // Should return the original schema when toJSONSchema is unavailable
      expect(result).toBe(mockSchema);
    });
  });
});
