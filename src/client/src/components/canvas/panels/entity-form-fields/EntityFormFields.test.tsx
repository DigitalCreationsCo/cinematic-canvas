import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntityFormFields, updateField } from './EntityFormFields.js';

vi.mock('./CharacterForm.js', () => ({
  default: ({ errors, requiredFields }: any) => (
    <div
      data-testid="character-form"
      data-error={errors.description}
      data-required={requiredFields.join(',')}
    />
  ),
}));

vi.mock('./LocationForm.js', () => ({
  default: ({ errors, requiredFields }: any) => (
    <div
      data-testid="location-form"
      data-error={errors.description}
      data-required={requiredFields.join(',')}
    />
  ),
}));

vi.mock('./SceneForm.js', () => ({
  default: ({ projectId, errors, requiredFields }: any) => (
    <div
      data-testid="scene-form"
      data-project-id={projectId}
      data-error={errors.description}
      data-required={requiredFields.join(',')}
    />
  ),
}));

describe('updateField', () => {
  it('updates top-level fields without mutating the original object', () => {
    const current = { name: 'Original' };
    const result = updateField(current, 'name', 'Updated');

    expect(result).toEqual({ name: 'Updated' });
    expect(current).toEqual({ name: 'Original' });
    expect(result).not.toBe(current);
  });

  it('creates nested objects as needed and clones existing branches', () => {
    const current = {
      name: 'Character',
      physicalTraits: {
        hair: 'Short',
      },
    };

    const result = updateField(current, 'physicalTraits.build', 'athletic');

    expect(result).toEqual({
      name: 'Character',
      physicalTraits: {
        hair: 'Short',
        build: 'athletic',
      },
    });
    expect(result.physicalTraits).not.toBe(current.physicalTraits);
    expect(current).toEqual({
      name: 'Character',
      physicalTraits: {
        hair: 'Short',
      },
    });
  });

  it('replaces non-object intermediate values with nested objects', () => {
    const result = updateField({ state: 'stale' }, 'state.position', 'left');

    expect(result).toEqual({
      state: {
        position: 'left',
      },
    });
  });

  it('converts empty strings to undefined so they are omitted from payloads', () => {
    const result = updateField({ name: 'Hero' }, 'name', '');

    expect(result).toEqual({ name: undefined });
    expect('name' in result).toBe(true);
  });

  it('passes through non-empty strings, numbers, arrays, and undefined unchanged', () => {
    expect(updateField({}, 'name', 'Hero')).toEqual({ name: 'Hero' });
    expect(updateField({}, 'startTime', 0)).toEqual({ startTime: 0 });
    expect(updateField({}, 'aliases', [])).toEqual({ aliases: [] });
    expect(updateField({}, 'mood', undefined)).toEqual({ mood: undefined });
  });
});

describe('EntityFormFields', () => {
  const baseProps = {
    fields: {},
    onChange: vi.fn(),
    errors: { description: 'description required' },
    requiredFields: ['description'],
  } as const;

  it('routes character entities to CharacterForm', () => {
    render(<EntityFormFields {...baseProps} entityType="character" />);

    expect(screen.getByTestId('form-fields-entity')).toBeInTheDocument();
    expect(screen.getByTestId('character-form')).toHaveAttribute('data-error', 'description required');
    expect(screen.getByTestId('character-form')).toHaveAttribute('data-required', 'description');
  });

  it('routes location entities to LocationForm', () => {
    render(<EntityFormFields {...baseProps} entityType="location" />);

    expect(screen.getByTestId('location-form')).toHaveAttribute('data-error', 'description required');
    expect(screen.getByTestId('location-form')).toHaveAttribute('data-required', 'description');
  });

  it('routes scene entities to SceneForm and passes projectId', () => {
    render(<EntityFormFields {...baseProps} entityType="scene" projectId="project-42" />);

    expect(screen.getByTestId('scene-form')).toHaveAttribute('data-project-id', 'project-42');
    expect(screen.getByTestId('scene-form')).toHaveAttribute('data-required', 'description');
  });

  it('renders an empty shell for prop entities', () => {
    render(<EntityFormFields {...baseProps} entityType="prop" />);

    expect(screen.getByTestId('form-fields-entity')).toBeInTheDocument();
    expect(screen.queryByTestId('character-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('location-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scene-form')).not.toBeInTheDocument();
  });
});
