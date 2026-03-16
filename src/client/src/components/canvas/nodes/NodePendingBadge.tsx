// src/client/src/components/canvas/nodes/NodePendingBadge.tsx
//
// Displays an amber "N unsaved" badge on a node when it has pending changes.
// Rendered in the top-right corner of the node's header region.
// Visibility is purely driven by pendingChangeCount on node data — no store read.

import React from 'react';
import { Clock } from 'lucide-react';

interface NodePendingBadgeProps {
    count: number;
}

export function NodePendingBadge({ count }: NodePendingBadgeProps) {
    if (!count || count < 1) return null;

    return (
        <span
            title={`${count} unsaved change${count !== 1 ? 's' : ''} — click Save to commit`}
            className="
        inline-flex items-center gap-1
        px-1.5 py-0.5 rounded
        text-[10px] font-mono font-semibold leading-none
        bg-amber-500/20 text-amber-400 border border-amber-500/40
        animate-pulse
      "
        >
            <Clock className="w-2.5 h-2.5 shrink-0" />
            {count}
        </span>
    );
}