import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LocationForm from './LocationForm.js';

const selectValues = ['night', 'stormy', 'winter'];
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

describe('LocationForm', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    selectCounter = 0;
    onChange.mockReset();
  });

  it('renders validation state for nested and top-level fields', () => {
    render(
      <LocationForm
        fields={{}}
        onChange={onChange}
        errors={{
          description: 'description required',
          weather: 'weather required',
          'state.season': 'season required',
        }}
        requiredFields={['description', 'state.season']}
      />,
    );

    expect(screen.getByText('description required')).toBeInTheDocument();
    expect(screen.getByText('weather required')).toBeInTheDocument();
    expect(screen.getByText('season required')).toBeInTheDocument();
    expect(screen.getByTestId('input-name')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByPlaceholderText('Location description')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Select season').closest('button')).toHaveAttribute('aria-invalid', 'true');
  });

  it('normalizes text, list, and select fields into partial location attributes', () => {
    render(<LocationForm fields={{}} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Warehouse' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Warehouse' }));

    fireEvent.change(screen.getByPlaceholderText('Location description'), { target: { value: 'Abandoned industrial space' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ description: 'Abandoned industrial space' }));

    fireEvent.change(screen.getByPlaceholderText('e.g., beach, urban, warehouse'), { target: { value: 'industrial' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'industrial' }));

    fireEvent.change(screen.getByPlaceholderText('Atmospheric mood'), { target: { value: 'tense' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mood: 'tense' }));

    fireEvent.change(screen.getByPlaceholderText('Dominant colors'), { target: { value: 'amber, teal' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ colorPalette: ['amber', 'teal'] }));

    fireEvent.change(screen.getByPlaceholderText('Architectural features'), { target: { value: 'steel beams, catwalks' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ architecture: ['steel beams', 'catwalks'] }));

    fireEvent.change(screen.getByPlaceholderText('Natural elements'), { target: { value: 'fog, rain' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ naturalElements: ['fog', 'rain'] }));

    fireEvent.change(screen.getByPlaceholderText('Man-made objects'), { target: { value: 'crates, lamps' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ manMadeObjects: ['crates', 'lamps'] }));

    fireEvent.change(screen.getByPlaceholderText('Ground surface description'), { target: { value: 'Wet concrete' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ groundSurface: 'Wet concrete' }));

    fireEvent.change(screen.getByPlaceholderText('Sky or ceiling description'), { target: { value: 'Broken skylight' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ skyOrCeiling: 'Broken skylight' }));

    const selectButtons = screen.getAllByTestId('select-change');
    selectButtons.forEach((button) => fireEvent.click(button));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ timeOfDay: 'night' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ weather: 'stormy' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ season: 'winter' }),
    }));
  });
});
