import React from 'react';
import { Lock, GitPullRequest } from 'lucide-react';
import { useWorldStore } from '../../../store/useWorldStore.js';
import { Button } from '../../ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../ui/tooltip.js';

interface RbacBannerProps {
  isLocked: boolean;
  entityType?: 'character' | 'location' | 'scene' | 'prop';
}

export function RbacBanner({ isLocked: isWorldEntity, entityType = 'character' }: RbacBannerProps) {
  const licenseType = useWorldStore(s => s.licenseType);
  const worldName = useWorldStore(s => s.worldName);

  if (!isWorldEntity) return null;

  // Assuming licenseType 'derivative' or 'full-collab' allows PRs
  const allowPR = licenseType === 'derivative' || licenseType === 'full-collab';

  return (
    <div className="p-3 bg-muted/50">
      <div className="flex flex-col flex-1 gap-1 items-start gap-3">
        <div className="flex flex-row gap-1">
          <Lock className="w-4 h-4 text-muted-foreground" />
          {<h4 className="text-sm text-muted-foreground">{`@${worldName}`}</h4>}
        </div>
        {!allowPR && (<p className="text-xs text-muted-foreground/80">
          {`This ${entityType} belongs to ${worldName}. Your current license (${licenseType || 'viewer'})
            does not permit direct modifications in this project fork.`}
        </p>)}

        {allowPR && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="mt-3 w-full border-indigo-600 text-indigo-400 hover:bg-indigo-950/50">
                  <GitPullRequest className="w-4 h-4 mr-2" /> Propose Change (PR)
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {/* <p>Fork this entity, make changes, and submit a PR back to the world owner.</p> */}
                <p>Editable</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
