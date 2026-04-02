/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectWorldModal } from '../SelectWorldModal.js';
import { useWorlds } from '#client/hooks/useSwrApi.js';

vi.mock('#client/components/ui/dialog.js', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }: any) => <div data-testid="dialog-description">{children}</div>,
}));

vi.mock('#client/components/ui/button.js', () => ({
  Button: ({ children, onClick, variant, className }: any) => (
    <button
      type="button"
      onClick={onClick}
      className={className}
      data-testid="button"
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

vi.mock('#client/components/ui/card.js', () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div data-testid="card-header" className={className}>{children}</div>,
  CardTitle: ({ children, className }: any) => <div data-testid="card-title" className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div data-testid="card-content" className={className}>{children}</div>,
  CardFooter: ({ children, className }: any) => <div data-testid="card-footer" className={className}>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  Loader2: () => <span data-testid="icon-loader">Loader2</span>,
  ArrowLeft: () => <span data-testid="icon-arrow-left">ArrowLeft</span>,
  ArrowRight: () => <span data-testid="icon-arrow-right">ArrowRight</span>,
  FolderOpen: () => <span data-testid="icon-folder-open">FolderOpen</span>,
}));

vi.mock('#client/hooks/useSwrApi.js', () => ({
  useWorlds: vi.fn(),
}));

describe('SelectWorldModal', () => {
  const mockOnBack = vi.fn();
  const mockOnSelectWorld = vi.fn();
  const mockOnShowProjects = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    vi.mocked(useWorlds).mockReturnValue({
      worlds: [
        { id: 'world-1', name: 'Cyberpunk City', description: 'A futuristic metropolis' },
        { id: 'world-2', name: 'Fantasy Realm', description: 'Magical lands' },
      ],
      isLoading: false,
      isError: false,
    } as any);

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('Your Worlds')).toBeInTheDocument();
    expect(screen.getByText('Select an existing world to continue building or view its projects.')).toBeInTheDocument();
    expect(screen.getByText('Cyberpunk City')).toBeInTheDocument();
    expect(screen.getByText('Fantasy Realm')).toBeInTheDocument();
    expect(screen.getByText('A futuristic metropolis')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    vi.mocked(useWorlds).mockReturnValue({
      worlds: [],
      isLoading: false,
      isError: false,
    } as any);

    render(
      <SelectWorldModal
        isOpen={false}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    vi.mocked(useWorlds).mockReturnValue({
      worlds: [],
      isLoading: false,
      isError: false,
    } as any);

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );

    fireEvent.click(screen.getByTestId('button'));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('shows loading state when worlds are loading', () => {
    vi.mocked(useWorlds).mockReturnValue({
      worlds: [],
      isLoading: true,
      isError: false,
    } as any);

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );

    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
  });

  it('shows error state when worlds fail to load', () => {
    vi.mocked(useWorlds).mockReturnValue({
      worlds: [],
      isLoading: false,
      isError: true,
    } as any);

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );

    expect(screen.getByText('Failed to load worlds. Please try again.')).toBeInTheDocument();
  });

  it('renders worlds correctly', () => {
    vi.mocked(useWorlds).mockReturnValue({
      worlds: [
        { id: 'world-1', name: 'Cyberpunk City', description: 'A futuristic metropolis' },
        { id: 'world-2', name: 'Fantasy Realm', description: 'Magical lands' },
      ],
      isLoading: false,
      isError: false,
    } as any);

    render(
      <SelectWorldModal
        isOpen={true}
        onBack={mockOnBack}
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );

    expect(screen.getByText('Cyberpunk City')).toBeInTheDocument();
    expect(screen.getByText('Fantasy Realm')).toBeInTheDocument();
    expect(screen.getByText('A futuristic metropolis')).toBeInTheDocument();
    expect(screen.getByText('Magical lands')).toBeInTheDocument();
  });
});
