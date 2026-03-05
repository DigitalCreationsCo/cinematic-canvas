/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StartModal } from '../StartModal.js';

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

vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="icon-plus">Plus</span>,
  FolderOpen: () => <span data-testid="icon-folder">FolderOpen</span>,
  Film: () => <span data-testid="icon-film">Film</span>,
}));

describe('StartModal', () => {
  const mockOnSelectAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);
    
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Cinematic Canvas')).toBeInTheDocument();
    expect(screen.getByText('Choose how you\'d like to begin your next project.')).toBeInTheDocument();
    
    // Check for the three main buttons
    expect(screen.getByText('New World')).toBeInTheDocument();
    expect(screen.getByText('Start from scratch')).toBeInTheDocument();
    
    expect(screen.getByText('Load World')).toBeInTheDocument();
    expect(screen.getByText('Open existing world')).toBeInTheDocument();
    
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Quick start an old project')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<StartModal isOpen={false} onSelectAction={mockOnSelectAction} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('calls onSelectAction with "new-world" when New World is clicked', () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);
    
    // Click New World button
    const buttons = screen.getAllByTestId('button');
    fireEvent.click(buttons[0]); // First button is New World
    
    expect(mockOnSelectAction).toHaveBeenCalledTimes(1);
    expect(mockOnSelectAction).toHaveBeenCalledWith('new-world');
  });

  it('calls onSelectAction with "load-world" when Load World is clicked', () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);
    
    // Click Load World button
    const buttons = screen.getAllByTestId('button');
    fireEvent.click(buttons[1]); // Second button is Load World
    
    expect(mockOnSelectAction).toHaveBeenCalledTimes(1);
    expect(mockOnSelectAction).toHaveBeenCalledWith('load-world');
  });

  it('calls onSelectAction with "project" when Projects is clicked', () => {
    render(<StartModal isOpen={true} onSelectAction={mockOnSelectAction} />);
    
    // Click Projects button
    const buttons = screen.getAllByTestId('button');
    fireEvent.click(buttons[2]); // Third button is Projects
    
    expect(mockOnSelectAction).toHaveBeenCalledTimes(1);
    expect(mockOnSelectAction).toHaveBeenCalledWith('project');
  });
});