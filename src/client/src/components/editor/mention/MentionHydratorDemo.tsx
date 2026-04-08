// src/client/src/components/editor/mention/MentionHydrator.tsx
// Simple hydration demo component - shows how @mentions resolve

'use client';

import { useState } from 'react';
import { resolveMentions } from '../../../lib/api.js';
import { Button } from '#client/components/ui/button.js';
import { Textarea } from '#client/components/ui/textarea.js';

interface MentionHydratorProps {
  projectId: string;
}

export function MentionHydrator({ projectId }: MentionHydratorProps) {
  const [input, setInput] = useState('<p>Scene where @Hero meets @Villain</p>');
  const [output, setOutput] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleHydrate = async () => {
    setIsLoading(true);
    setErrors([]);
    setOutput(null);

    try {
      const result = await resolveMentions({
        htmlInput: input,
        projectId,
      });

      if (result.success && result.prompt) {
        setOutput(result.prompt);
      } else if (result.errors.length > 0) {
        setErrors(result.errors);
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Hydration failed']);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-none bg-card">
      <h3 className="text-lg font-semibold">Entity Mention Hydration Demo</h3>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Input (with @mentions)</label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text with @mentions..."
          className="font-mono text-sm"
          rows={3}
        />
      </div>

      <Button onClick={handleHydrate} disabled={isLoading}>
        {isLoading ? 'Hydrating...' : 'Hydrate for LLM'}
      </Button>

      {output && (
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Hydrated Output</label>
          <pre className="p-3 bg-muted rounded-none text-xs overflow-x-auto whitespace-pre-wrap">
            {output}
          </pre>
        </div>
      )}

      {errors.length > 0 && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-none">
          <label className="text-sm font-medium text-destructive">Errors</label>
          <ul className="mt-1 text-xs text-destructive">
            {errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
