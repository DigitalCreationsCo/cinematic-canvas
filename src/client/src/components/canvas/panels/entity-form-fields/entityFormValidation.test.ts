import { describe, expect, it } from 'vitest';
import { z } from 'zod';
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
} from '#client/components/canvas/panels/entity-form-fields/entityFormValidation.js';

describe('entityFormValidation', () => {
  describe('extractVisibleTextForValidation', () => {
    it('strips tags, nbsp entities, and zero-width spaces', () => {
      expect(extractVisibleTextForValidation('<div>\u200B<span>@Hero</span>&nbsp;</div>')).toBe('@Hero');
    });
  });

  describe('getValueAtPath', () => {
    it('returns nested values when the path exists', () => {
      expect(getValueAtPath({ state: { season: 'winter' } }, 'state.season')).toBe('winter');
    });

    it('returns undefined for missing branches', () => {
      expect(getValueAtPath({ state: null }, 'state.season')).toBeUndefined();
    });
  });

  describe('isValuePresent', () => {
    it('handles primitive values and markup strings', () => {
      expect(isValuePresent(null)).toBe(false);
      expect(isValuePresent(undefined)).toBe(false);
      expect(isValuePresent('<div><br /></div>\u200B')).toBe(false);
      expect(isValuePresent('<span data-type="mention">@Hero</span>')).toBe(true);
      expect(isValuePresent(0)).toBe(true);
      expect(isValuePresent(Number.NaN)).toBe(false);
      expect(isValuePresent(false)).toBe(true);
      expect(isValuePresent(Symbol('present'))).toBe(true);
    });

    it('walks arrays and objects recursively', () => {
      expect(isValuePresent(['', '<div><br /></div>'])).toBe(false);
      expect(isValuePresent(['', '@Hero'])).toBe(true);
      expect(isValuePresent({ nested: { label: '' } })).toBe(false);
      expect(isValuePresent({ nested: { label: '@Hero' } })).toBe(true);
    });
  });

  describe('buildDeepPartialSchema', () => {
    it('creates deep partial schemas across object, array, default, optional, nullable, and primitive branches', () => {
      const schema = z.object({
        name: z.string(),
        aliases: z.array(z.object({ label: z.string().default('hero') })),
        notes: z.string().optional(),
        maybeHandle: z.string().nullable(),
        description: z.string().default(''),
      });

      const partialSchema = buildDeepPartialSchema(schema);
      const validResult = partialSchema.safeParse({
        aliases: [{}],
        maybeHandle: null,
      });

      expect(validResult.success).toBe(true);
      expect(partialSchema.safeParse({ aliases: [1] }).success).toBe(false);
    });
  });

  describe('mapZodIssuesToFieldErrors', () => {
    it('keeps the first error per path and ignores pathless issues', () => {
      const duplicatePathIssue = z
        .object({ name: z.string().min(2, 'too short') })
        .superRefine((value, ctx) => {
          ctx.addIssue({
            code: 'custom',
            path: ['name'],
            message: `duplicate issue for ${value.name}`,
          });
        })
        .safeParse({ name: '' });
      const rootIssue = z
        .object({ name: z.string() })
        .superRefine((_, ctx) => {
          ctx.addIssue({ code: 'custom', message: 'root problem' });
        })
        .safeParse({ name: 'ok' });

      expect(duplicatePathIssue.success).toBe(false);
      expect(rootIssue.success).toBe(false);

      const errors = mapZodIssuesToFieldErrors([
        ...rootIssue.error.issues,
        ...duplicatePathIssue.error.issues,
      ]);

      expect(errors.name).toBe('too short');
      expect(errors['']).toBeUndefined();
    });
  });

  describe('field error helpers', () => {
    it('finds direct and nested errors', () => {
      const errors = {
        description: 'description required',
        'state.season': 'season required',
      };

      expect(getFieldError(errors, 'description')).toBe('description required');
      expect(getFieldError(errors, 'state')).toBe('season required');
      expect(getFieldError(errors, 'missing')).toBeUndefined();
      expect(hasFieldError(errors, 'state')).toBe(true);
      expect(hasFieldError(errors, 'missing')).toBe(false);
      expect(isFieldRequired(['description'], 'description')).toBe(true);
      expect(isFieldRequired(['description'], 'name')).toBe(false);
    });
  });

  describe('validateEntityForm', () => {
    it('uses the default required fields configuration', () => {
      const result = validateEntityForm('character', {});

      expect(result.requiredFields).toEqual(ENTITY_FORM_REQUIRED_FIELDS.character);
      expect(result.errors.description).toBe('description required');
    });

    it('accepts nested partial character attributes', () => {
      const result = validateEntityForm(
        'character',
        {
          physicalTraits: {
            hair: 'Braided hair',
          },
        },
        { requiredFields: [] },
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('supports configurable required fields', () => {
      const result = validateEntityForm(
        'location',
        {
          description: 'Abandoned warehouse with neon spill.',
        },
        { requiredFields: ['name', 'type'] },
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBe('name required');
      expect(result.errors.type).toBe('type required');
    });

    it('surfaces schema validation errors for invalid nested values', () => {
      const result = validateEntityForm(
        'character',
        {
          physicalTraits: {
            gender: 'robot',
          },
        },
        { requiredFields: [] },
      );

      expect(result.isValid).toBe(false);
      expect(result.errors['physicalTraits.gender']).toBeDefined();
    });

    it('treats mention span markup as visible content for required validation', () => {
      const mentionMarkup = '<span data-type="mention" data-handle="loc_beach" data-entity-type="location">@Beach</span>';

      const result = validateEntityForm(
        'scene',
        {
          locationReferenceId: mentionMarkup,
        },
        { requiredFields: ['locationReferenceId'] },
      );

      expect(result.isValid).toBe(true);
      expect(result.errors.locationReferenceId).toBeUndefined();
    });

    it('does not treat arrays of empty strings as present', () => {
      const result = validateEntityForm(
        'scene',
        {
          characterReferenceIds: [''],
        },
        { requiredFields: ['characterReferenceIds'] },
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.characterReferenceIds).toBe('characterReferenceIds required');
    });
  });
});
