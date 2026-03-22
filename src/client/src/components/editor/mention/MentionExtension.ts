// src/client/src/components/editor/mention/MentionExtension.ts
// Tiptap extension for @mention functionality

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

export interface MentionSuggestion {
  handle: string;
  displayName: string;
  entityType: 'character' | 'location' | 'prop';
  avatarUrl?: string;
  scope: 'project' | 'world';
}

export interface MentionExtensionOptions {
  suggestionCallback: (query: string) => MentionSuggestion[];
  onSelect: (suggestion: MentionSuggestion) => void;
  onOpen: () => void;
  onClose: () => void;
  triggerCharacter: string;
}

export const MentionExtension = Extension.create<MentionExtensionOptions>({
  name: 'mention',

  addOptions() {
    return {
      suggestionCallback: () => [],
      onSelect: () => {},
      onOpen: () => {},
      onClose: () => {},
      triggerCharacter: '@',
    };
  },

  addProseMirrorPlugins() {
    const { triggerCharacter, suggestionCallback, onSelect, onOpen, onClose } = this.options;

    return [
      new Plugin({
        key: new PluginKey('mention'),
        props: {
          handleKeyDown: (view, event) => {
            if (event.key === triggerCharacter) {
              const { from } = view.state.selection;
              const $from = view.state.doc.resolve(from);
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);

              if (textBefore === '' || textBefore.endsWith(' ')) {
                onOpen();
                return false;
              }
            }

            if (event.key === 'Escape') {
              onClose();
              return false;
            }

            return false;
          },
        },
      }),
    ];
  },
});

export function createMentionSuggestionQuery(
  editor: Editor,
  triggerCharacter: string
): string {
  const { from } = editor.state.selection;
  const $from = editor.state.doc.resolve(from);
  const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
  const triggerIndex = textBefore.lastIndexOf(triggerCharacter);

  if (triggerIndex === -1) return '';

  const query = textBefore.slice(triggerIndex + 1);
  return query;
}

export function insertMention(
  editor: Editor,
  suggestion: MentionSuggestion
): void {
  const { from, to } = editor.state.selection;
  const { $from } = editor.state.selection;
  const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
  const triggerIndex = textBefore.lastIndexOf('@');

  if (triggerIndex !== -1) {
    const deleteFrom = from - ($from.parentOffset - triggerIndex);
    editor
      .chain()
      .focus()
      .deleteRange({ from: deleteFrom, to })
      .insertContent([
        {
          type: 'text',
          marks: [{ type: 'mention' }],
          text: suggestion.handle,
        },
      ])
      .run();
  }
}

export function createMentionMark(mentionSuggestion: MentionSuggestion) {
  return {
    type: 'mention' as const,
    attrs: {
      id: mentionSuggestion.handle,
      label: mentionSuggestion.displayName,
      entityType: mentionSuggestion.entityType,
    },
  };
}
