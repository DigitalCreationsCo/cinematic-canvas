import type { ComponentType } from 'react';
import { ScreenShareIcon, TestTubeIcon } from 'lucide-react';
import { SceneInfiniteIcon } from '#shared/icons/scene-infinite.js';

export interface WorkspaceToolDefinition {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export const WORKSPACE_TOOLS: WorkspaceToolDefinition[] = [
  {
    id: 'reverse-engineer',
    name: 'Reverse Engineer',
    description: 'Borrow the cinematic styles from a video into your project.',
    icon: ScreenShareIcon,
  },
  {
    id: 'create-scenes',
    name: 'Create Scenes',
    description: 'Ask the assistant to generate scenes.',
    icon: SceneInfiniteIcon
  },
];
