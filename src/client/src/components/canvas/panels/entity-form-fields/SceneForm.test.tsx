import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SceneForm, { normalizeCharacterReferenceIdsInput } from './SceneForm.js';

const mentionSetValueCalls: Array<{ placeholder: string; value: string }> = [];
const selectValues = ['Close-Up', 'Dutch Angle', 'Handheld', 'Fade Out', 'Lip Sync', '8', 'solo', 'high', 'very_fast'];
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

vi.mock('#client/components/editor/mention/MentionTextArea.js', async () => {
  const ReactModule = await import('react');

  const MentionTextarea = ReactModule.forwardRef<any, any>(function MockMentionTextarea(
    { initialContent = '', onUpdate, placeholder, className, ...rest }: any,
    ref,
  ) {
    const [value, setValue] = ReactModule.useState(initialContent);

    ReactModule.useImperativeHandle(
      ref,
      () => ({
        getValue: () => value,
        setValue: (html: string) => {
          mentionSetValueCalls.push({ placeholder, value: html });
          setValue(html);
        },
        focus: vi.fn(),
      }),
      [placeholder, value],
    );

    return (
      <textarea
        aria-label={placeholder}
        className={className}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onUpdate?.(event.target.value);
        }}
        {...rest}
        data-testid="mention-textarea"
      />
    );
  });

  return { MentionTextarea };
});

describe('SceneForm mention normalization', () => {
  it('preserves serialized mention markup as a single string entry', () => {
    const markup = '<span data-type="mention" data-handle="char_hero" data-entity-type="character">@Hero</span> <span data-type="mention" data-handle="char_villain" data-entity-type="character">@Villain</span>';

    expect(normalizeCharacterReferenceIdsInput(markup)).toEqual([markup]);
  });

  it('returns an empty array when the editor content has no visible text', () => {
    expect(normalizeCharacterReferenceIdsInput('<div><br></div>\u200B')).toEqual([]);
  });
});

describe('SceneForm', () => {
  const onChange = vi.fn();
  const locationMarkup = '<span data-type="mention" data-handle="loc_beach">@Beach</span>';
  const characterMarkup = '<span data-type="mention" data-handle="char_hero">@Hero</span>';

  beforeEach(() => {
    mentionSetValueCalls.length = 0;
    selectCounter = 0;
    onChange.mockReset();
  });

  it('hydrates existing mention values into the mention inputs on mount', () => {
    render(
      <SceneForm
        projectId="project-1"
        fields={{
          duration: 6,
          locationTextInput: locationMarkup,
          charactersTextInput: [characterMarkup, '<span data-type="mention" data-handle="char_villain">@Villain</span>'],
        }}
        onChange={onChange}
      />,
    );

    expect(mentionSetValueCalls).toEqual([
      {
        placeholder: 'Use @ to mention existing locations in your prompt',
        value: locationMarkup,
      },
      {
        placeholder: 'Use @ to mention existing characters in your prompt',
        value: `${characterMarkup} <span data-type="mention" data-handle="char_villain">@Villain</span>`,
      },
    ]);
  });

  it('skips mention hydration when the fields are absent', () => {
    render(<SceneForm projectId="project-1" fields={{}} onChange={onChange} />);

    expect(mentionSetValueCalls).toEqual([]);
  });

  it('updates text, mention, numeric, and select-driven scene fields', () => {
    render(
      <SceneForm
        projectId="project-1"
        fields={{}}
        onChange={onChange}
        errors={{
          description: 'Description is required',
          locationTextInput: 'Location is required',
          charactersTextInput: 'Characters is required',
        }}
        requiredFields={['description', 'locationTextInput', 'charactersTextInput']}
      />,
    );

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Opening Scene' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Opening Scene' }));

    fireEvent.change(screen.getByPlaceholderText('Detailed description of scene'), { target: { value: 'A dramatic reveal.' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ description: 'A dramatic reveal.' }));

    fireEvent.change(screen.getByPlaceholderText('Overall emotional tone'), { target: { value: 'electric' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mood: 'electric' }));

    const mentionInputs = screen.getAllByTestId('mention-textarea');
    fireEvent.change(mentionInputs[0], { target: { value: locationMarkup } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ locationTextInput: locationMarkup }));

    fireEvent.change(mentionInputs[1], { target: { value: characterMarkup } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ charactersTextInput: [characterMarkup] }));

    const numberInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(numberInputs[0], { target: { value: '12.5' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ startTime: 12.5 }));

    fireEvent.change(numberInputs[1], { target: { value: '24.75' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ endTime: 24.75 }));

    fireEvent.change(screen.getByPlaceholderText('Detailed description of sound, instruments, tempo, mood'), {
      target: { value: 'Synth arpeggios with pulsing bass.' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ musicalDescription: 'Synth arpeggios with pulsing bass.' }));

    const selectButtons = screen.getAllByTestId('select-change');
    selectButtons.forEach((button) => fireEvent.click(button));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shotType: 'Close-Up' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cameraAngle: 'Dutch Angle' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cameraMovement: 'Handheld' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ transitionType: 'Fade Out' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ audioSync: 'Lip Sync' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ duration: 8 }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'solo' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ intensity: 'high' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tempo: 'very_fast' }));

    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(screen.getByText('Location is required')).toBeInTheDocument();
    expect(screen.getByText('Characters is required')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Detailed description of scene')).toHaveAttribute('aria-invalid', 'true');
    expect(mentionInputs[0]).toHaveAttribute('aria-invalid', 'true');
    expect(mentionInputs[1]).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends undefined when a text field is cleared', () => {
    render(<SceneForm projectId="project-1" fields={{ name: 'Existing' }} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('input-name'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: undefined }));
  });
});
