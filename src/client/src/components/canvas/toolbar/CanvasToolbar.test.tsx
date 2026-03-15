import { render, screen, act, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';
import { useNodeStore } from '../../../store/useNodeStore';
import { CanvasNode } from '../../../domain/canvas/NodeTypes';

beforeEach(() => {
  const slot = document.createElement('div');
  slot.id = 'canvas-toolbar-slot';
  document.body.appendChild(slot);
});

afterEach(() => {
  const slot = document.getElementById('canvas-toolbar-slot');
  if (slot) {
    slot.remove();
  }
  act(() => {
    const { clear } = (useNodeStore.getState() as any).temporal.getState();
    clear();
  });
});

describe('CanvasToolbar', () => {
  const handleResume = vi.fn();
  const handleStop = vi.fn();

  const mockNode: CanvasNode = {
    id: 'test-node',
    type: 'scene',
    position: { x: 0, y: 0 },
    data: {
      entityId: 'scene-1',
      contextId: 'project-1',
      contextType: 'project',
      scope: 'project',
      isLocked: false,
      pipelineSelected: true,
      collapsed: false,
      idxVersion: 1,
    },
  };

  it('renders without crashing', () => {
    render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
    expect(screen.getByText(/start pipeline/i)).toBeInTheDocument();
  });

  describe('undo/redo buttons', () => {
    it('disables undo and redo buttons when no history', () => {
      render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
const undoButton = screen.getByTitle(/undo/i);
const redoButton = screen.getByTitle(/redo/i);
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
    });

    it('enables undo button after adding a node', () => {
      render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
      act(() => {
        useNodeStore.getState().addNode(mockNode);
      });
      const undoButton = screen.getByRole('button', { name: /undo/i });
      expect(undoButton).not.toBeDisabled();
    });

    it('calls undo function when undo button is clicked', () => {
      const undoSpy = vi.spyOn((useNodeStore.getState() as any).temporal.getState(), 'undo');
      
      render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
      act(() => {
        useNodeStore.getState().addNode(mockNode);
      });

      const undoButton = screen.getByRole('button', { name: /undo/i });
      fireEvent.click(undoButton);
      expect(undoSpy).toHaveBeenCalled();
      undoSpy.mockRestore();
    });

    it('enables redo button after an undo', () => {
      render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
      act(() => {
        useNodeStore.getState().addNode(mockNode);
      });

      const undoButton = screen.getByRole('button', { name: /undo/i });
      fireEvent.click(undoButton);
      
      const redoButton = screen.getByRole('button', { name: /redo/i });
      expect(redoButton).not.toBeDisabled();
    });

    it('calls redo function when redo button is clicked', () => {
        const redoSpy = vi.spyOn((useNodeStore.getState() as any).temporal.getState(), 'redo');
        
        render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
        act(() => {
          useNodeStore.getState().addNode(mockNode);
        });
  
        const undoButton = screen.getByRole('button', { name: /undo/i });
        fireEvent.click(undoButton);
        
        const redoButton = screen.getByRole('button', { name: /redo/i });
        fireEvent.click(redoButton);
        expect(redoSpy).toHaveBeenCalled();
        redoSpy.mockRestore();
      });
  });
});
