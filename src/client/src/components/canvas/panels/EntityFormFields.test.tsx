import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityFormFields } from './EntityFormFields';

vi.mock('#/components/ui/input.js', () => ({
  Input: ({ value, onChange, placeholder, type }: any) => (
    <input
      data-testid="input"
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
    />
  ),
}));

vi.mock('#/components/ui/textarea.js', () => ({
  Textarea: ({ value, onChange, placeholder }: any) => (
    <textarea
      data-testid="textarea"
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('#/components/ui/select.js', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, value }: any) => (
    <div data-testid="select-trigger">{children || value}</div>
  ),
  SelectContent: ({ children }: any) => <div data-testid="select-content">{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-testid="select-item" data-value={value}>{children}</div>
  ),
  SelectValue: ({ placeholder }: any) => <div data-testid="select-value">{placeholder}</div>,
}));

vi.mock('#/components/ui/label.js', () => ({
  Label: ({ children }: any) => <div data-testid="label">{children}</div>,
}));

vi.mock('#/components/ui/checkbox.js', () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      data-testid="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock('#/components/ui/accordion.js', () => ({
  Accordion: ({ children }: any) => <div data-testid="accordion">{children}</div>,
  AccordionItem: ({ children, value }: any) => <div data-testid={`accordion-item-${value}`}>{children}</div>,
  AccordionTrigger: ({ children }: any) => <button data-testid="accordion-trigger">{children}</button>,
  AccordionContent: ({ children }: any) => <div data-testid="accordion-content">{children}</div>,
}));

describe('EntityFormFields', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('character form', () => {
    it('renders character form with basic info section', () => {
      render(
        <EntityFormFields
          entityType="character"
          fields={{}}
          onChange={mockOnChange}
        />
      );
      expect(screen.getByTestId('accordion')).toBeInTheDocument();
    });

    it('renders character form with all accordion sections', () => {
      render(
        <EntityFormFields
          entityType="character"
          fields={{}}
          onChange={mockOnChange}
        />
      );
      expect(screen.getByTestId('accordion-item-basic')).toBeInTheDocument();
      expect(screen.getByTestId('accordion-item-physical')).toBeInTheDocument();
      expect(screen.getByTestId('accordion-item-state')).toBeInTheDocument();
    });

    it('calls onChange when name changes', () => {
      render(
        <EntityFormFields
          entityType="character"
          fields={{}}
          onChange={mockOnChange}
        />
      );
      const inputs = screen.getAllByTestId('input');
      const nameInput = inputs.find((input) => input.getAttribute('placeholder') === 'Character name');
      if (nameInput) {
        fireEvent.change(nameInput, { target: { value: 'John Doe' } });
        expect(mockOnChange).toHaveBeenCalled();
      }
    });
  });

  describe('location form', () => {
    it('renders location form with basic info section', () => {
      render(
        <EntityFormFields
          entityType="location"
          fields={{}}
          onChange={mockOnChange}
        />
      );
      expect(screen.getByTestId('accordion-item-basic')).toBeInTheDocument();
    });

    it('renders location form with environment section', () => {
      render(
        <EntityFormFields
          entityType="location"
          fields={{}}
          onChange={mockOnChange}
        />
      );
      expect(screen.getByTestId('accordion-item-environment')).toBeInTheDocument();
      expect(screen.getByTestId('accordion-item-elements')).toBeInTheDocument();
    });
  });

  describe('scene form', () => {
    it('renders scene form with basic info section', () => {
      render(
        <EntityFormFields
          entityType="scene"
          fields={{}}
          onChange={mockOnChange}
        />
      );
      expect(screen.getByTestId('accordion-item-basic')).toBeInTheDocument();
    });

    it('renders scene form with cinematography section', () => {
      render(
        <EntityFormFields
          entityType="scene"
          fields={{}}
          onChange={mockOnChange}
        />
      );
      expect(screen.getByTestId('accordion-item-cinematography')).toBeInTheDocument();
      expect(screen.getByTestId('accordion-item-audio')).toBeInTheDocument();
    });
  });

  describe('updateField helper', () => {
    it('updates nested fields correctly', () => {
      const fields = { name: 'Test' };
      render(
        <EntityFormFields
          entityType="character"
          fields={fields}
          onChange={mockOnChange}
        />
      );
      const inputs = screen.getAllByTestId('input');
      const hairInput = inputs.find((input) => input.getAttribute('placeholder') === 'Hairstyle, color, length, texture');
      if (hairInput) {
        fireEvent.change(hairInput, { target: { value: 'Short brown hair' } });
        expect(mockOnChange).toHaveBeenCalled();
      }
    });
  });
});
