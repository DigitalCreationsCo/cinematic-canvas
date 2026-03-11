import React from 'react';
import { Lock, GitPullRequest } from 'lucide-react';
import { useWorldStore } from '../../../store/useWorldStore.js';
import { Button } from '../../ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../ui/tooltip.js';

interface RbacBannerProps {
  isLocked: boolean;
  entityType?: 'character' | 'location' | 'scene' | 'prop';
}

export function RbacBanner({ isLocked, entityType = 'character' }: RbacBannerProps) {
  const { licenseType } = useWorldStore();
  
  if (!isLocked) return null;

  // Assuming licenseType 'derivative' or 'full-collab' allows PRs
  const allowPR = licenseType === 'derivative' || licenseType === 'full-collab';

  return (
    <div className="bg-gray-900 border border-red-900/50 p-3 rounded-lg mb-4">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-200">World Ledger Entity</h4>
          <p className="text-xs text-gray-400 mt-1">
            This {entityType} belongs to the base world ledger. Your current license ({licenseType || 'viewer'}) 
            does not permit direct modifications in this project fork.
          </p>
          
          {allowPR && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-3 w-full border-indigo-600 text-indigo-400 hover:bg-indigo-950/50">
                    <GitPullRequest className="w-4 h-4 mr-2" /> Propose Change (PR)
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Fork this entity, make changes, and submit a PR back to the world owner.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}
