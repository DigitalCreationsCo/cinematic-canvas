import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildDeepPartialSchema,
  ENTITY_FORM_REQUIRED_FIELDS,
  extractVisibleTextForValidation,
  getFieldError,
  getValueAtPath,
  hasFieldError,
  isFieldRequired,
  isValuePresent,
  mapZodIssuesToFieldErrors,
  validateEntityForm,
} from "#client/components/canvas/panels/entity-form-fields/entityFormValidation.js";
import { CharacterAttributes } from "#shared/types/character.types.ts";

describe("entityFormValidation", () => {
  describe("extractVisibleTextForValidation", () => {
    it("strips tags, nbsp entities, and zero-width spaces", () => {
      expect(extractVisibleTextForValidation("<div>\u200B<span>@Hero</span>&nbsp;</div>")).toBe("@Hero");
    });
  });

  describe("getValueAtPath", () => {
    it("returns nested values when the path exists", () => {
      expect(getValueAtPath({ state: { season: "winter" } }, "state.season")).toBe("winter");
    });

    it("returns undefined for missing branches", () => {
      expect(getValueAtPath({ state: null }, "state.season")).toBeUndefined();
    });
  });

  describe("isValuePresent", () => {
    it("handles primitive values and markup strings", () => {
      expect(isValuePresent(null)).toBe(false);
      expect(isValuePresent(undefined)).toBe(false);
      expect(isValuePresent("<div><br /></div>\u200B")).toBe(false);
      expect(isValuePresent('<span data-type="mention">@Hero</span>')).toBe(true);
      expect(isValuePresent(0)).toBe(true);
      expect(isValuePresent(Number.NaN)).toBe(false);
      expect(isValuePresent(false)).toBe(true);
      expect(isValuePresent(Symbol("present"))).toBe(true);
    });

    it("walks arrays and objects recursively", () => {
      expect(isValuePresent(["", "<div><br /></div>"])).toBe(false);
      expect(isValuePresent(["", "@Hero"])).toBe(true);
      expect(isValuePresent({ nested: { label: "" } })).toBe(false);
      expect(isValuePresent({ nested: { label: "@Hero" } })).toBe(true);
    });
  });

  describe("buildDeepPartialSchema", () => {
    it("creates deep partial schemas across object, array, default, optional, nullable, and primitive branches", () => {
      const schema = z.object({
        name: z.string(),
        aliases: z.array(z.object({ label: z.string().default("hero") })),
        notes: z.string().optional(),
        maybeHandle: z.string().nullable(),
        description: z.string().default(""),
      });

      const partialSchema = buildDeepPartialSchema(schema);
      const validResult = partialSchema.safeParse({
        aliases: [{}],
        maybeHandle: null,
      });

      expect(validResult.success).toBe(true);
      expect(partialSchema.safeParse({ aliases: [1] }).success).toBe(false);
    });

    it("should allow partial top-level properties", () => {
      const patchSchema = buildDeepPartialSchema(CharacterAttributes);

      // Validation should pass with missing keys
      const result = patchSchema.safeParse({ notInSchema: "prop", name: "Hero" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "Hero" });
    });

    it("should prune non-schema properties", () => {
      const patchSchema = buildDeepPartialSchema(CharacterAttributes);

      // Validation should pass with missing keys
      const result = patchSchema.safeParse({ id: "123", name: "Hero" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "Hero" });
    });

    it("should strip ZodDefault and return undefined for missing properties", () => {
      const schema = z.object({
        status: z.string().default("active"),
        count: z.number().default(0),
      });
      const patchSchema = buildDeepPartialSchema(schema);

      // Input is empty, result should be empty (no defaults injected)
      const result = patchSchema.parse({});
      expect(result).toEqual({});
      expect(result.status).toBeUndefined();
    });

    it("should ensure default values are NOT initialized when properties are undefined", () => {
      // 1. Define a schema with various default types
      const baseSchema = z.object({
        stringWithDefault: z.string().default("default_string"),
        numberWithDefault: z.number().default(42),
        arrayWithDefault: z.array(z.string()).default(["default_item"]),
        nestedObject: z.object({
          innerDefault: z.boolean().default(true)
        }).default({ innerDefault: true })
      });

      const patchSchema = buildDeepPartialSchema(baseSchema);

      // 2. Provide an empty input
      const input = {};
      const result = patchSchema.parse(input);

      // 3. Assertions: All fields must be undefined, not their default values
      // This confirms the ZodDefault nodes were successfully stripped from the AST.
      expect(result.stringWithDefault).toBeUndefined();
      expect(result.numberWithDefault).toBeUndefined();
      expect(result.arrayWithDefault).toBeUndefined();
      expect(result.nestedObject).toBeUndefined();

      // 4. Verify that the object still has no keys
      expect(Object.keys(result).length).toBe(0);
    });

    it("should still allow explicit values to override the (now removed) defaults", () => {
      const baseSchema = z.object({
        status: z.string().default("pending"),
      });
      const patchSchema = buildDeepPartialSchema(baseSchema);

      const input = { status: "active" };
      const result = patchSchema.parse(input);

      // Validation should still work correctly for provided values
      expect(result.status).toBe("active");
    });

    it("should perform deep partials on nested objects without injecting defaults", () => {
      const schema = z.object({
        metadata: z.object({
          tags: z.array(z.string()).default([]),
          version: z.number().default(1),
        }),
      });
      const patchSchema = buildDeepPartialSchema(schema);

      const partialInput = { metadata: { version: 2 } };
      const result = patchSchema.parse(partialInput);

      // Ensure version is updated but tags is NOT initialized to []
      expect(result.metadata.version).toBe(2);
      expect(result.metadata.tags).toBeUndefined();
    });

    it("should retain underlying validation constraints for provided fields", () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });
      const patchSchema = buildDeepPartialSchema(schema);

      // Should fail if the provided field is invalid
      const invalidResult = patchSchema.safeParse({ email: "not-an-email" });
      expect(invalidResult.success).toBe(false);

      // Should pass if the provided field is valid
      const validResult = patchSchema.safeParse({ age: 25 });
      expect(validResult.success).toBe(true);
    });

    it("should handle arrays by making the array itself optional but keeping element types", () => {
      const schema = z.object({
        items: z.array(
          z.object({
            sku: z.string(),
            price: z.number().default(0),
          }),
        ),
      });
      const patchSchema = buildDeepPartialSchema(schema);

      const input = {
        items: [{ sku: "A1" }],
      };

      const result = patchSchema.parse(input);
      // The price default inside the array element should still be stripped
      expect(result.items[0].sku).toBe("A1");
      expect(result.items[0].price).toBeUndefined();
    });

    it("should handle ZodNullable by re-wrapping the transformed type", () => {
      const schema = z.object({
        bio: z.string().nullable(),
      });
      const patchSchema = buildDeepPartialSchema(schema);

      expect(patchSchema.safeParse({ bio: null }).success).toBe(true);
      expect(patchSchema.safeParse({ bio: "Hello" }).success).toBe(true);
      expect(patchSchema.safeParse({}).success).toBe(true);
    });
  });

  describe("mapZodIssuesToFieldErrors", () => {
    it("keeps the first error per path and ignores pathless issues", () => {
      const duplicatePathIssue = z
        .object({ name: z.string().min(2, "too short") })
        .superRefine((value, ctx) => {
          ctx.addIssue({
            code: "custom",
            path: ["name"],
            message: `duplicate issue for ${value.name}`,
          });
        })
        .safeParse({ name: "" });
      const rootIssue = z
        .object({ name: z.string() })
        .superRefine((_, ctx) => {
          ctx.addIssue({ code: "custom", message: "root problem" });
        })
        .safeParse({ name: "ok" });

      expect(duplicatePathIssue.success).toBe(false);
      expect(rootIssue.success).toBe(false);

      const errors = mapZodIssuesToFieldErrors([...rootIssue.error.issues, ...duplicatePathIssue.error.issues]);

      expect(errors.name).toBe("Name too short");
      expect(errors[""]).toBeUndefined();
    });
  });

  describe("field error helpers", () => {
    it("finds direct and nested errors", () => {
      const errors = {
        description: "Description is required",
        "state.season": "Season is required",
      };

      expect(getFieldError(errors, "description")).toBe("Description is required");
      expect(getFieldError(errors, "state")).toBe("Season is required");
      expect(getFieldError(errors, "missing")).toBeUndefined();
      expect(hasFieldError(errors, "state")).toBe(true);
      expect(hasFieldError(errors, "missing")).toBe(false);
      expect(isFieldRequired(["description"], "description")).toBe(true);
      expect(isFieldRequired(["description"], "name")).toBe(false);
    });
  });

  describe("validateEntityForm", () => {
    it("uses the default required fields configuration", () => {
      const result = validateEntityForm("character", {});

      expect(result.requiredFields).toEqual(ENTITY_FORM_REQUIRED_FIELDS.character);
      expect(result.errors.description).toBe("Description is required");
    });

    it("accepts nested partial character attributes", () => {
      const result = validateEntityForm(
        "character",
        {
          physicalTraits: {
            hair: "Braided hair",
          },
        },
        { requiredFields: [] },
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it("supports configurable required fields", () => {
      const result = validateEntityForm(
        "location",
        {
          description: "Abandoned warehouse with neon spill.",
        },
        { requiredFields: ["name", "type"] },
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBe("Name is required");
      expect(result.errors.type).toBe("Type is required");
    });

    it("surfaces schema validation errors for invalid nested values", () => {
      const result = validateEntityForm(
        "character",
        {
          physicalTraits: {
            gender: "robot",
          },
        },
        { requiredFields: [] },
      );

      expect(result.isValid).toBe(false);
      expect(result.errors["physicalTraits.gender"]).toBeDefined();
    });

    it("treats mention span markup as visible content for required validation", () => {
      const mentionMarkup =
        '<span data-type="mention" data-handle="loc_beach" data-entity-type="location">@Beach</span>';

      const result = validateEntityForm(
        "scene",
        {
          locationReferenceId: mentionMarkup,
        },
        { requiredFields: ["locationReferenceId"] },
      );

      expect(result.isValid).toBe(true);
      expect(result.errors.locationReferenceId).toBeUndefined();
    });

    it("does not treat arrays of empty strings as present", () => {
      const result = validateEntityForm(
        "scene",
        {
          characterReferenceIds: [""],
        },
        { requiredFields: ["characterReferenceIds"] },
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.characterReferenceIds).toBe("Character Reference Ids is required");
    });
  });
});
