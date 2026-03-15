/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectWorldModal } from '../SelectWorldModal.js';

vi.mock('#/components/ui/dialog.js', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }: any) => <div data-testid="dialog-description">{children}</div>,
}));

vi.mock('#/components/ui/button.js', () => ({
  Button: ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('#/components/ui/card.js', () => ({
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

vi.mock('#/hooks/use-swr-api.js', () => ({
  useWorlds: () => ({
    worlds: [
      { id: 'world-1', name: 'Cyberpunk City', description: 'A futuristic metropolis', projectCount: 3 },
      { id: 'world-2', name: 'Fantasy Realm', description: 'Magical lands', projectCount: 1 },
      { id: 'world-3', name: 'Deep Space Station', description: 'Sci-fi space station', projectCount: 0 },
    ],
    isLoading: false,
    isError: false,
  }),
}));

describe('SelectWorldModal', () => {
  const mockOnBack = vi.fn();
  const mockOnSelectWorld = vi.fn();
  const mockOnShowProjects = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
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
    
    // Check for mocked data rendering
    expect(screen.getByText('Cyberpunk City')).toBeInTheDocument();
    expect(screen.getByText('Fantasy Realm')).toBeInTheDocument();
    expect(screen.getByText('Deep Space Station')).toBeInTheDocument();
    
    // Check for project counts
    expect(screen.getByText('3 Projects')).toBeInTheDocument();
    expect(screen.getByText('1 Project')).toBeInTheDocument();
    expect(screen.getByText('0 Projects')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
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
    render(
      <SelectWorldModal 
        isOpen={true} 
        onBack={mockOnBack} 
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );
    
    const buttons = screen.getAllByTestId('button');
    // First button is the back button in the header
    fireEvent.click(buttons[0]);
    
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('calls onShowProjects with correct worldId when Projects button is clicked', () => {
    render(
      <SelectWorldModal 
        isOpen={true} 
        onBack={mockOnBack} 
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );
    
    // Find a projects button (first world)
    const projectsButtons = screen.getAllByText('Projects');
    fireEvent.click(projectsButtons[0]);
    
    expect(mockOnShowProjects).toHaveBeenCalledTimes(1);
    expect(mockOnShowProjects).toHaveBeenCalledWith('world-1');
  });

  it('calls onSelectWorld with correct worldId when Enter World button is clicked', () => {
    render(
      <SelectWorldModal 
        isOpen={true} 
        onBack={mockOnBack} 
        onSelectWorld={mockOnSelectWorld}
        onShowProjects={mockOnShowProjects}
      />
    );
    
    // Find an enter world button (first world)
    const enterWorldButtons = screen.getAllByText('Enter World');
    fireEvent.click(enterWorldButtons[0]);
    
    expect(mockOnSelectWorld).toHaveBeenCalledTimes(1);
    expect(mockOnSelectWorld).toHaveBeenCalledWith('world-1');
  });
});