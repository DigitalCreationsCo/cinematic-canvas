import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterForm from './CharacterForm.js';

const selectValues = ['athletic', 'female', 'center', 'dirty', 'exhausted'];
let selectCounter = 0;

vi.mock('#client/components/ui/input.js', () => ({
  Input: ({ value, onChange, ...props }: any) => (
    <input value={value ?? ''} onChange={onChange} {...props} />
  ),
}));

vi.mock('#client/components/ui/textarea.js', () => ({
  Textarea: ({ value, onChange, ...props }: any) => (
    <textarea value={value ?? ''} onChange={onChange} {...props} />
  ),
}));

vi.mock('#client/components/ui/label.js', () => ({
  Label: ({ children, className }: any) => <label className={className}>{children}</label>,
}));

vi.mock('#client/components/ui/accordion.js', () => ({
  Accordion: ({ children }: any) => <div data-testid="accordion">{children}</div>,
  AccordionItem: ({ children, value }: any) => <section data-testid={`accordion-item-${value}`}>{children}</section>,
  AccordionTrigger: ({ children }: any) => <button type="button">{children}</button>,
  AccordionContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('#client/components/ui/select.js', async () => {
  const ReactModule = await import('react');

  const Select = ({ children, value, onValueChange }: any) => {
    const indexRef = ReactModule.useRef(selectCounter++);
    const nextValue = selectValues[indexRef.current] ?? `value-${indexRef.current}`;

    return (
      <div data-testid="select" data-value={value}>
        <button type="button" data-testid="select-change" onClick={() => onValueChange?.(nextValue)}>
          choose {nextValue}
        </button>
        {children}
      </div>
    );
  };

  return {
    Select,
    SelectTrigger: ({ children, className, ...props }: any) => (
      <button type="button" className={className} {...props}>
        {children}
      </button>
    ),
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  };
});

describe('CharacterForm', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    selectCounter = 0;
    onChange.mockReset();
  });

  it('renders validation state and required markers', () => {
    render(
      <CharacterForm
        fields={{}}
        onChange={onChange}
        errors={{
          description: 'description required',
          'physicalTraits.hair': 'hair required',
          'state.position': 'position required',
        }}
        requiredFields={['description', 'physicalTraits.hair']}
      />,
    );

    expect(screen.getByText('description required')).toBeInTheDocument();
    expect(screen.getByText('hair required')).toBeInTheDocument();
    expect(screen.getByText('position required')).toBeInTheDocument();
    expect(screen.getByTestId('input-name')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByPlaceholderText('Character description')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByPlaceholderText('Hairstyle, color, length, texture')).toHaveAttribute('aria-invalid', 'true');
  });

  it('normalizes text, list, and select fields into partial character attributes', () => {
    render(<CharacterForm fields={{}} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Aster' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aster' }));

    fireEvent.change(screen.getByPlaceholderText('Character description'), { target: { value: 'Lead character' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ description: 'Lead character' }));

    fireEvent.change(screen.getByPlaceholderText('Alias 1, Alias 2'), { target: { value: 'Ace,  , Star ' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ aliases: ['Ace', 'Star'] }));

    fireEvent.change(screen.getByPlaceholderText('Hairstyle, color, length, texture'), { target: { value: 'Braided' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ hair: 'Braided' }),
    }));

    fireEvent.change(screen.getByPlaceholderText('Character age'), { target: { value: '29' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ age: '29' }),
    }));

    fireEvent.change(screen.getByPlaceholderText('Ethnicity description'), { target: { value: 'Latina' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ ethnicity: 'Latina' }),
    }));

    fireEvent.change(screen.getByPlaceholderText('Outfit description'), { target: { value: 'Jacket, Boots' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ clothing: ['Jacket', 'Boots'] }),
    }));

    fireEvent.change(screen.getByPlaceholderText('Accessories list'), { target: { value: 'Ring, Watch' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ accessories: ['Ring', 'Watch'] }),
    }));

    fireEvent.change(screen.getByPlaceholderText('Distinctive features'), { target: { value: 'Scar, Freckles' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ distinctiveFeatures: ['Scar', 'Freckles'] }),
    }));

    fireEvent.change(screen.getByPlaceholderText('Additional appearance notes'), { target: { value: 'Confident, Focused' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ appearanceNotes: ['Confident', 'Focused'] }),
    }));

    fireEvent.change(screen.getByPlaceholderText('Current emotional state'), { target: { value: 'Determined' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ emotionalState: 'Determined' }),
    }));

    const selectButtons = screen.getAllByTestId('select-change');
    selectButtons.forEach((button) => fireEvent.click(button));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ build: 'athletic' }),
    }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      physicalTraits: expect.objectContaining({ gender: 'female' }),
    }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ position: 'center' }),
    }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ dirtLevel: 'dirty' }),
    }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ exhaustionLevel: 'exhausted' }),
    }));
  });

  it('sends undefined when a text field is cleared', () => {
    render(<CharacterForm fields={{ name: 'Aster' }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: undefined }));
  });
});
