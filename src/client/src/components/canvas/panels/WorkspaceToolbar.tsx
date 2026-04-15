import { Button } from "#client/components/ui/button.js";
import { ScreenShareIcon, TestTubeIcon } from "lucide-react";

export function WorkspaceToolbar({ contextId, contextType }: { contextId: string; contextType: 'project' | 'world'; }) {

  const WORKSPACE_TOOLS = [
    {
      id: 'reverse-engineer',
      name: 'Reverse Engineer',
      description: 'Borrow the cinematic styles from a video into your project.',
      icon: ScreenShareIcon
    },
    {
      id: 'test-tool-1',
      name: 'Test Tool',
      description: 'Test Tool.',
      icon: TestTubeIcon
    },
  ];
  return (
    <div className='relative flex p-4 left-80 bg-transparent gap-4'>
      {WORKSPACE_TOOLS.map((wt) => (
        <Button
          variant="outline"
          size="icon"
          className="flex! flex-col! border border-0.5 bg-card rounded-sm aspect-square! h-16! w-16! z-10"
        >
          <wt.icon className="h-8 w-8" />
          {wt.name}
        </Button>
      ))}

    </div>
  );
}