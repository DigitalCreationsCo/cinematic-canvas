// src/client/src/hooks/useMentionEditor.ts
// Hook for integrating mentions into any Tiptap editor

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { useMentionStore } from '../store/useMentionStore.js';
import { getMentionSuggestions, resolveMentions } from '../lib/api.js';
import type { MentionSuggestion } from '../lib/api.js';

interface UseMentionEditorOptions {
  projectId: string;
  initialContent?: string;
  onUpdate?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

interface UseMentionEditorResult {
  editor: Editor | null;
  isLoading: boolean;
  error: string | null;
  hydrateContent: () => Promise<string>;
}

interface MentionItem {
  handle: string;
  label: string;
  entityType: string;
  avatarUrl?: string;
  scope: string;
}

const suggestionRenderer = () => {
  let popup: HTMLElement | null = null;

  return {
    onStart: (props: { editor: any; clientRect: any; query: string }) => {
      const { editor: editorInstance, clientRect, query } = props;
      const store = useMentionStore.getState();

      store.updateSuggestions(store.getFilteredSuggestions(query || ''));
      store.openSuggestions(query || '');

      popup = document.createElement('div');
      popup.className = 'mention-popover';
      popup.style.position = 'absolute';
      popup.style.zIndex = '1000';

      if (clientRect) {
        const rect = clientRect();
        if (rect) {
          popup.style.top = `${rect.top + rect.height + 4}px`;
          popup.style.left = `${rect.left}px`;
        }
      }

      renderPopupItems(popup, store.suggestions, store.suggestionIndex, editorInstance);
      document.body.appendChild(popup);
    },
    onUpdate: (props: { editor: any; clientRect: any; query: string }) => {
      const { editor: editorInstance, clientRect, query } = props;
      const store = useMentionStore.getState();

      store.updateSuggestions(store.getFilteredSuggestions(query || ''));

      if (!popup) return;
      renderPopupItems(popup, store.suggestions, store.suggestionIndex, editorInstance);

      if (clientRect) {
        const rect = clientRect();
        if (rect) {
          popup.style.top = `${rect.top + rect.height + 4}px`;
          popup.style.left = `${rect.left}px`;
        }
      }
    },
    onKeyDown: (props: { event: KeyboardEvent; editor: any }) => {
      const { event, editor } = props;
      const store = useMentionStore.getState();

      if (event.key === 'ArrowDown') {
        store.selectSuggestion(Math.min(store.suggestionIndex + 1, store.suggestions.length - 1));
        if (popup) renderPopupItems(popup, store.suggestions, store.suggestionIndex, editor);
        return true;
      }
      if (event.key === 'ArrowUp') {
        store.selectSuggestion(Math.max(store.suggestionIndex - 1, 0));
        if (popup) renderPopupItems(popup, store.suggestions, store.suggestionIndex, editor);
        return true;
      }
      if (event.key === 'Enter' && store.suggestions[store.suggestionIndex]) {
        const s = store.suggestions[store.suggestionIndex];
        insertMentionNode(editor, s.handle, s.displayName);
        store.closeSuggestions();
        return true;
      }
      if (event.key === 'Escape') {
        store.closeSuggestions();
        if (popup) { popup.remove(); popup = null; }
        return true;
      }
      return false;
    },
    onExit: () => {
      useMentionStore.getState().closeSuggestions();
      if (popup) { popup.remove(); popup = null; }
    },
  };
};

function renderPopupItems(container: HTMLElement, suggestions: any[], selectedIndex: number, editor: any) {
  if (suggestions.length === 0) {
    container.innerHTML = '<div class="mention-popover-empty-text">No matches found</div>';
    container.classList.add('mention-popover-empty');
    return;
  }

  container.classList.remove('mention-popover-empty');
  container.innerHTML = suggestions.map((s, i) => `
    <div class="mention-popover-item ${i === selectedIndex ? 'is-selected' : ''}" data-handle="${s.handle}">
      <div class="mention-popover-item-content">
        <div class="mention-popover-item-handle">${s.handle}</div>
        <div class="mention-popover-item-name">${s.displayName}</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.mention-popover-item').forEach((item) => {
    item.addEventListener('click', () => {
      const handle = (item as HTMLElement).getAttribute('data-handle');
      const suggestion = suggestions.find(s => s.handle === handle);
      if (suggestion) {
        insertMentionNode(editor, suggestion.handle, suggestion.displayName);
        useMentionStore.getState().closeSuggestions();
      }
    });
  });
}

function insertMentionNode(editor: any, handle: string, label: string) {
  const { from } = editor.state.selection;
  const $from = editor.state.doc.resolve(from);
  const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
  const triggerIndex = textBefore.lastIndexOf('@');

  if (triggerIndex !== -1) {
    const deleteFrom = from - ($from.parentOffset - triggerIndex);
    editor
      .chain()
      .focus()
      .deleteRange({ from: deleteFrom, to: from })
      .insertContent({ type: 'mention', attrs: { id: handle, label } })
      .run();
  }
}

export function useMentionEditor({
  projectId,
  initialContent = '',
  onUpdate,
  placeholder = 'Start typing...',
  editable = true,
}: UseMentionEditorOptions): UseMentionEditorResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    setAccessibleHandles,
    openSuggestions,
    closeSuggestions,
    updateSuggestions,
    selectSuggestion,
    getFilteredSuggestions,
  } = useMentionStore();

  const loadSuggestions = useCallback(async () => {
    try {
      const response = await getMentionSuggestions(projectId, '');
      setAccessibleHandles(response.suggestions);
    } catch (err) {
      console.error('Failed to load mention suggestions:', err);
    }
  }, [projectId, setAccessibleHandles]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          'data-type': 'mention',
        },
        renderLabel: ({ node }) => {
          return `@${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) => {
            const store = useMentionStore.getState();
            return store.getFilteredSuggestions(query).map((s) => ({
              handle: s.handle,
              label: s.displayName,
              entityType: s.entityType,
              avatarUrl: s.avatarUrl,
              scope: s.scope,
            }));
          },
          render: () => suggestionRenderer() as any,
        },
      }),
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor: editorInstance }) => {
      const html = editorInstance.getHTML();
      onUpdate?.(html);
    },
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
        class: 'mention-editor',
      },
    },
  });

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const hydrateContent = useCallback(async () => {
    if (!editor) return '';

    setIsLoading(true);
    setError(null);

    try {
      const html = editor.getHTML();
      const result = await resolveMentions({
        htmlInput: html,
        projectId,
      });

      if (result.success && result.prompt) {
        editor.commands.setContent(result.prompt);
        return result.prompt;
      } else if (result.errors.length > 0) {
        setError(result.errors.join(', '));
      }

      return html;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Hydration failed';
      setError(errorMessage);
      return editor.getHTML();
    } finally {
      setIsLoading(false);
    }
  }, [editor, projectId]);

  return {
    editor,
    isLoading,
    error,
    hydrateContent,
  };
}

export { EditorContent };
