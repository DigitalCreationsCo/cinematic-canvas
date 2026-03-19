/** @vitest-environment happy-dom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectSelectionModal } from './ProjectSelectionModal.js';

vi.mock('#/components/ui/dialog.js', () => ({
    Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{ children }</div> : null,
    DialogContent: ({ children }: any) => <div data-testid="dialog-content">{ children }</div>,
    DialogHeader: ({ children }: any) => <div>{ children }</div>,
    DialogTitle: ({ children }: any) => <div>{ children }</div>,
    DialogDescription: ({ children }: any) => <div>{ children }</div>,
}));

vi.mock('#/components/ui/select.js', () => ({
    Select: ({ children, value }: any) => (
        <div data-testid="select" data-value={value}>
            { children }
        </div>
    ),
    SelectTrigger: ({ children }: any) => <button data-testid="select-trigger">{ children }</button>,
    SelectValue: ({ placeholder }: any) => <span data-testid="select-value">{ placeholder }</span>,
    SelectContent: ({ children }: any) => <div data-testid="select-content">{ children }</div>,
    SelectItem: ({ children, value }: any) => <div data-testid={`item-${value}`}>{ children }</div>,
}));

vi.mock('#/components/ui/button.js', () => ({
    Button: ({ children, onClick, disabled, className }: any) => (
        <button onClick={ onClick } disabled={ disabled } className={ className }>
            { children }
        </button>
    ),
}));

vi.mock('#/components/ui/tabs.js', () => ({
    Tabs: ({ children, value }: any) => (
        <div data-testid="tabs">
            {Array.isArray(children) ? children.find((child: any) => child?.props?.value === (value || 'resume')) : children}
        </div>
    ),
    TabsList: ({ children }: any) => <div>{ children }</div>,
    TabsTrigger: ({ children, value }: any) => <div data-testid={`tab-${value}`}>{ children }</div>,
    TabsContent: ({ children, value }: any) => <div data-testid={`tab-content-${value}`}>{ children }</div>,
}));

vi.mock('#/components/ui/input.js', () => ({
    Input: ({ id, value, onChange, type, placeholder, className }: any) => (
        <input id={ id } type={ type } value={ value } placeholder={ placeholder } className={ className } onChange={ (e: any) => onChange && onChange(e) } />
    ),
}));

vi.mock('#/components/ui/textarea.js', () => ({
    Textarea: ({ id, value, onChange, placeholder, className }: any) => (
        <textarea id={ id } value={ value } placeholder={ placeholder } className={ className } onChange={ (e: any) => onChange && onChange(e) } />
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

vi.mock('#/hooks/useSwrApi.js', () => ({
    useProjects: vi.fn(),
}));

vi.mock('../store/useProjectStore.js', () => ({
    useProjectStore: vi.fn(),
}));

vi.mock('../store/usePipelineStore.js', () => ({
    usePipelineStore: vi.fn(),
}));

vi.mock('../store/useWorldStore.js', () => ({
    useWorldStore: vi.fn(),
}));

vi.mock('#/lib/auth-context.js', () => ({
    useAuth: vi.fn(),
}));

vi.mock('lucide-react', () => ({
    Loader2: () => <span data-testid="loader">Loader2</span>,
    Sparkles: () => <span data-testid="sparkles">Sparkles</span>,
    FolderOpen: () => <span data-testid="folder">FolderOpen</span>,
    Plus: () => <span data-testid="plus">Plus</span>,
}));

import { useProjects } from '#/hooks/useSwrApi.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { usePipelineStore } from '../store/usePipelineStore.js';
import { useWorldStore } from '../store/useWorldStore.js';
import { useAuth } from '#/lib/auth-context.js';

describe('ProjectSelectionModal', () => {
    const mockOnConfirm = vi.fn();
    const mockOnClose = vi.fn();
    const mockHydrateProject = vi.fn();
    const mockSetStatus = vi.fn();

    const defaultMocks = () => {
        vi.mocked(useProjects).mockReturnValue({
            data: { projects: [] },
            isLoading: false,
            isError: false,
        } as any);
        
        vi.mocked(useProjectStore).mockImplementation((selector: any) => {
            const state = { hydrateProject: mockHydrateProject };
            return selector ? selector(state) : state;
        });
        
        vi.mocked(usePipelineStore).mockImplementation((selector: any) => {
            const state = { setStatus: mockSetStatus };
            return selector ? selector(state) : state;
        });
        
        vi.mocked(useWorldStore).mockImplementation((selector: any) => {
            const state = { worldId: 'test-world-id' };
            return selector ? selector(state) : state;
        });
        
        vi.mocked(useAuth).mockReturnValue({ activeTeamId: 'test-team-id' } as any);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        defaultMocks();
    });

    it('renders dialog when open', () => {
        render(
            <ProjectSelectionModal 
                isOpen={true}
                onConfirm={mockOnConfirm}
                onClose={mockOnClose}
            />
        );
        
        expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
        render(
            <ProjectSelectionModal 
                isOpen={false}
                onConfirm={mockOnConfirm}
                onClose={mockOnClose}
            />
        );
        
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('shows Resume Project button', () => {
        render(
            <ProjectSelectionModal 
                isOpen={true}
                onConfirm={mockOnConfirm}
                onClose={mockOnClose}
            />
        );
        
        expect(screen.getByText('Resume Project')).toBeInTheDocument();
    });

    it('renders project select dropdown', () => {
        render(
            <ProjectSelectionModal 
                isOpen={true}
                onConfirm={mockOnConfirm}
                onClose={mockOnClose}
            />
        );
        
        expect(screen.getAllByTestId('select-trigger').length).toBeGreaterThan(0);
    });

    it('renders canvas mode select', () => {
        render(
            <ProjectSelectionModal 
                isOpen={true}
                onConfirm={mockOnConfirm}
                onClose={mockOnClose}
            />
        );
        
        expect(screen.getAllByTestId('select-trigger').length).toBeGreaterThan(0);
    });
});
