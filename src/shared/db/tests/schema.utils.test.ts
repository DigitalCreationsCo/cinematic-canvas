import { describe, it, expect } from "vitest";
import { nullableJsonb } from "../schema.utils.js";

describe("nullableJsonb Custom Type", () => {
  const columnName = "payload";
  const column = nullableJsonb<{ foo: string }>("test_col");

  describe("toDriver (Serialization)", () => {
    it("should stringify valid objects for the database driver", () => {
      const input = { foo: "bar" };
      const result = column.toDriver(input);

      expect(typeof result).toBe("string");
      expect(result).toBe('{"foo":"bar"}');
    });

    it("should return null when the application value is undefined", () => {
      const result = column.toDriver(undefined);
      expect(result).toBeNull();
    });

    it("should handle nested arrays and complex structures", () => {
      const input = { ids: [1, 2, 3], metadata: { active: true } };
      const result = column.toDriver(input as any);
      expect(result).toBe('{"ids":[1,2,3],"metadata":{"active":true}}');
    });
  });

  describe("fromDriver (Deserialization)", () => {
    it("should parse a valid JSON string back into an object", () => {
      const driverValue = '{"foo":"bar"}';
      const result = column.fromDriver(driverValue);

      expect(typeof result).toBe("object");
      expect(result).toEqual({ foo: "bar" });
    });

    it("should return undefined when the driver returns null", () => {
      const result = column.fromDriver(null);
      expect(result).toBeUndefined();
    });

    it("should gracefully handle cases where the driver already parsed the JSON", () => {
      const driverValue = { foo: "bar" };
      const result = column.fromDriver(driverValue as any);

      expect(result).toEqual({ foo: "bar" });
    });

    it("should fallback to raw value if JSON parsing fails", () => {
      const invalidJson = "{ malformed: string }";
      const result = column.fromDriver(invalidJson);
      expect(result).toBe(invalidJson);
    });
  });
});
