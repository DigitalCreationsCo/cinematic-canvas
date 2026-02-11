/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectSelectionModal } from './ProjectSelectionModal.js';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { uploadAudio, startPipeline } from '#/lib/api.js';
import { useStore } from '#/lib/store.js';

// Mock dependencies
vi.mock('#/components/ui/dialog.js', () => ({
    Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{ children }</div> : null,
    DialogContent: ({ children }: any) => <div>{ children }</div>,
    DialogHeader: ({ children }: any) => <div>{ children }</div>,
    DialogTitle: ({ children }: any) => <div>{ children }</div>,
    DialogDescription: ({ children }: any) => <div>{ children }</div>,
}));

vi.mock('#/components/ui/select.js', () => ({
    Select: ({ children, value, onValueChange }: any) => (
        <div data-testid="select" onClick={ () => onValueChange("test-project-id") }>
            { children }
        </div>
    ),
    SelectTrigger: ({ children }: any) => <div>{ children }</div>,
    SelectValue: ({ placeholder }: any) => <span>{ placeholder }</span>,
    SelectContent: ({ children }: any) => <div>{ children }</div>,
    SelectItem: ({ children, value }: any) => <div data-testid={ `item-${value}` }>{ children }</div>,
}));

vi.mock('#/components/ui/button.js', () => ({
    Button: ({ children, onClick, disabled, className }: any) => (
        <button onClick={ onClick } disabled={ disabled } className={ className }>
            { children }
        </button>
    ),
}));

vi.mock('#/components/ui/tabs.js', () => ({
    Tabs: ({ children, value, onValueChange }: any) => (
        <div data-testid="tabs" onClick={ () => onValueChange("create") }>{ children }</div>
    ),
    TabsList: ({ children }: any) => <div>{ children }</div>,
    TabsTrigger: ({ children, value }: any) => <div data-testid={ `tab-${value}` }>{ children }</div>,
    TabsContent: ({ children, value }: any) => value === "create" ? <div>{ children }</div> : null,
}));

vi.mock('#/components/ui/input.js', () => ({
    Input: ({ id, value, onChange, type, placeholder, className }: any) => (
        <input
            id={ id }
            type={ type }
            value={ value }
            placeholder={ placeholder }
            className={ className }
            onChange={ (e: any) => {
                if (onChange) onChange(e);
                if (e.target.files && e.target.files[0]) {
                    // Handle file input change
                }
            } }
        />
    ),
}));

vi.mock('#/components/ui/textarea.js', () => ({
    Textarea: ({ id, value, onChange, placeholder, className }: any) => (
        <textarea
            id={ id }
            value={ value }
            placeholder={ placeholder }
            className={ className }
            onChange={ onChange }
        />
    ),
}));

vi.mock('#/components/ui/label.js', () => ({
    Label: ({ children, htmlFor }: any) => <label htmlFor={ htmlFor }>{ children }</label>,
}));

vi.mock('#/components/ui/card.js', () => ({
    Card: ({ children }: any) => <div>{ children }</div>,
    CardContent: ({ children }: any) => <div>{ children }</div>,
}));

vi.mock('#/lib/api.js', () => ({
    uploadAudio: vi.fn(),
    startPipeline: vi.fn(),
}));

vi.mock('#/lib/store.js', () => ({
    useStore: vi.fn(),
}));

vi.mock('lucide-react', () => ({
    Loader2: () => <span data-testid="loader">Loader2</span>,
    Sparkles: () => <span data-testid="sparkles">Sparkles</span>,
    FolderOpen: () => <span data-testid="folder">FolderOpen</span>,
    Plus: () => <span data-testid="plus">Plus</span>,
}));

describe('ProjectSelectionModal', () => {
    const defaultProps = {
        isOpen: true,
        projects: [],
        selectedProject: undefined,
        onSelectProject: vi.fn(),
        onConfirm: vi.fn(),
    };

    const mockSetProject = vi.fn();
    const mockSetProjectStatus = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useStore).mockImplementation((selector: any) => {
            const state = {
                setProject: mockSetProject,
                setProjectStatus: mockSetProjectStatus,
                isDark: false,
            };
            return selector ? selector(state) : state;
        });
    });

    it('calls uploadAudio only once when creating a project with audio', async () => {
        vi.mocked(uploadAudio).mockResolvedValue({
            audioGcsUri: 'gs://bucket/audio.mp3',
            audioPublicUri: 'https://storage.googleapis.com/bucket/audio.mp3',
        });
        vi.mocked(startPipeline).mockResolvedValue({
            projectId: 'new-project-id',
        });

        const { container } = render(<ProjectSelectionModal { ...defaultProps } />);

        // Switch to create tab
        const createTab = screen.getByTestId('tab-create');
        fireEvent.click(createTab);

        // Fill in the form
        const promptInput = screen.getByPlaceholderText('Describe the cinematic video you want to generate...');
        fireEvent.change(promptInput, { target: { value: 'A cinematic video about a dog' } });

        // Directly set the audio file state by accessing the component instance (if using class components)
        // or by using a more robust mock for the Input component.
        // For this test, we will use a workaround to set the audioFile state.
        const inputElement = container.querySelector('input[type="file"]');
        if (inputElement) {
            const file = new File([], 'audio.mp3', { type: 'audio/mp3' });
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files').get.call(inputElement, [file]);
            fireEvent.change(inputElement, { target: { files: [file] } });
        }

        // Submit the form
        const createButton = screen.getByText('Create & Start Project');
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(uploadAudio).toHaveBeenCalledTimes(1);
            expect(startPipeline).toHaveBeenCalledTimes(1);
            expect(startPipeline).toHaveBeenCalledWith({
                payload: {
                    title: '',
                    initialPrompt: 'A cinematic video about a dog',
                    audioGcsUri: 'gs://bucket/audio.mp3',
                    audioPublicUri: 'https://storage.googleapis.com/bucket/audio.mp3',
                },
            });
        });
    });

    it('does not call uploadAudio when creating a project without audio', async () => {
        vi.mocked(startPipeline).mockResolvedValue({
            projectId: 'new-project-id-no-audio',
        });

        render(<ProjectSelectionModal { ...defaultProps } />);

        // Switch to create tab
        const createTab = screen.getByTestId('tab-create');
        fireEvent.click(createTab);

        // Fill in the form
        const promptInput = screen.getByPlaceholderText('Describe the cinematic video you want to generate...');
        fireEvent.change(promptInput, { target: { value: 'A cinematic video about a cat' } });

        // Submit the form
        const createButton = screen.getByText('Create & Start Project');
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(uploadAudio).not.toHaveBeenCalled();
            expect(startPipeline).toHaveBeenCalledTimes(1);
            expect(startPipeline).toHaveBeenCalledWith({
                payload: {
                    title: '',
                    initialPrompt: 'A cinematic video about a cat',
                    audioGcsUri: undefined,
                    audioPublicUri: undefined,
                },
            });
        });
    });
});
