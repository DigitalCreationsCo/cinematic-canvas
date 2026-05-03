import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EntityFieldErrorMessage,
  EntityFieldLabel,
  getFieldControlClassName,
} from './entityFormValidationUi.js';

vi.mock('#client/components/ui/label.js', () => ({
  Label: ({ children, className }: any) => (
    <label data-testid="label" className={className}>
      {children}
    </label>
  ),
}));

describe('EntityFieldLabel', () => {
  it('shows required and error styling when the field is invalid', () => {
    render(
      <EntityFieldLabel
        errors={{ description: 'description required' }}
        fieldPath="description"
        requiredFields={['description']}
      >
        Description
      </EntityFieldLabel>,
    );

    expect(screen.getByTestId('label')).toHaveClass('text-destructive');
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('keeps custom styling and omits the marker when the field is optional', () => {
    render(
      <EntityFieldLabel
        className="tracking-wide"
        errors={{}}
        fieldPath="mood"
        requiredFields={[]}
      >
        Mood
      </EntityFieldLabel>,
    );

    expect(screen.getByTestId('label')).toHaveClass('tracking-wide');
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });
});

describe('EntityFieldErrorMessage', () => {
  it('renders nested field errors', () => {
    render(
      <EntityFieldErrorMessage
        errors={{ 'physicalTraits.hair': 'Hair is required' }}
        fieldPath="physicalTraits"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Hair is required');
  });

  it('renders nothing when a field has no error', () => {
    const { container } = render(
      <EntityFieldErrorMessage errors={{}} fieldPath="description" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('getFieldControlClassName', () => {
  it('returns destructive styles when a field has an error', () => {
    expect(getFieldControlClassName({ description: 'description required' }, 'description')).toContain('border-destructive');
  });

  it('returns undefined when a field is valid', () => {
    expect(getFieldControlClassName({}, 'description')).toBeUndefined();
  });
});
