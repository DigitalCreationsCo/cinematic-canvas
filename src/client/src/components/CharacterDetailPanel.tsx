import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.js";
import { Badge } from "#/components/ui/badge.js";
import { Button } from "#/components/ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.js";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { RefreshCw, FileText, User, Info, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, memo } from "react";
import type { Character, AssetKey, AssetVersion } from "../../../shared/types/index.js";
import FramePreview from "./FramePreview.js";
import { Skeleton } from "#/components/ui/skeleton.js";
import { AssetHistoryPicker } from "./AssetHistoryPicker.js";
import { updateSceneAsset } from "#/lib/api.js";
import { useToast } from "#/hooks/use-toast.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.js";
import { useStore, useCharacterAssets } from "#/lib/store.js";
import { resolvePublicUrl } from "../../../shared/utils/utils.js";

interface CharacterDetailPanelProps {
  character: Omit<Character, "assets">;
  projectId: string;
  isLoading?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

const CharacterDetailPanel = memo(function CharacterDetailPanel({
  character,
  projectId,
  isLoading = false,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
}: CharacterDetailPanelProps) {
  const { toast } = useToast();
  const { setAssets, removeIgnoreAssetUrl } = useStore();

  const [ historyPickerOpen, setHistoryPickerOpen ] = useState(false);
  const [ pickerType, setPickerType ] = useState<AssetKey>("character_image");
  const [ isGenerating, setIsGenerating ] = useState(false);

  // Character assets
  const { bestAssets: assets, assets: registry } = useCharacterAssets(character.id);

  const handleHistoryClick = (assetKey: AssetKey) => {
    setPickerType(assetKey);
    setHistoryPickerOpen(true);
  };

  const handleSelectAsset = async (asset: AssetVersion) => {
    const previousRegistry = registry;
    removeIgnoreAssetUrl(asset.data);

    // Optimistic update
    if (registry && registry[ pickerType ]) {
      const updatedRegistry = {
        ...registry,
        [ pickerType ]: {
          ...registry[ pickerType ]!,
          best: asset.version,
        }
      };
      setAssets(character.id, updatedRegistry);
    }

    try {
      // TODO: Implement updateCharacterAsset or similar.
      // For now, this is a placeholder.
      // await updateCharacterAsset(...)
      toast({
        title: "Asset Restored",
        description: `Restored attempt #${asset.version} for ${pickerType}.`,
        duration: 500,
      });
    } catch (error) {
      if (previousRegistry) {
        setAssets(character.id, previousRegistry);
      }
      toast({
        title: "Error",
        description: `Failed to restore asset: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  const handleRegenerateClick = () => {
    // TODO: Implement character regeneration
    toast({
      title: "Not Implemented",
      description: "Character regeneration coming soon.",
    });
  };

  const handleDeleteAsset = (assetKey: AssetKey, version: number) => {
    // TODO: Implement delete
    toast({
      title: "Not Implemented",
      description: "Asset deletion coming soon.",
    });
  };


  return (
    <>
      <AssetHistoryPicker
        entityId={ character.id }
        entityType="character"
        assetType={ pickerType }
        projectId={ projectId }
        isOpen={ historyPickerOpen }
        onOpenChange={ setHistoryPickerOpen }
        onSelect={ handleSelectAsset }
        currentUrl={ assets[ pickerType ]?.data }
      />
      <div className="h-full flex flex-col" data-testid={ `panel-character-detail-${character.id}` }>
        <div className="p-4  flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            { isLoading ? (
              <Skeleton className="h-10 w-10 " />
            ) : (
              <div className="h-10 w-10  bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
            ) }
            <div className="min-w-0">
              { isLoading ? (
                <Skeleton className="h-6 w-32 mb-1" />
              ) : (
                  <h2 className=" font-semibold     truncate">{ character.name }</h2>
              ) }
              { isLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <div className=" text-muted-foreground truncate">{ character.age } • { character.physicalTraits.build }</div>
              ) }
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div className="flex flex-col gap-3">
              <FramePreview
                title="Character Portrait"
                imageUrl={ resolvePublicUrl(assets[ 'character_image' ]?.data) }
                alt={ character.name }
                isLoading={ isLoading }
                onRegenerate={ handleRegenerateClick }
                onDelete={ () => handleDeleteAsset("character_image", assets[ "character_image" ]?.version || 0) }
                onHistory={ () => handleHistoryClick("character_image") }
                isGenerating={ isGenerating }
                priority={ true }
              />
            </div>

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="state">State</TabsTrigger>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className=" font-medium">Physical Traits</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-3">
                    <div className="">
                      <span className="text-muted-foreground">Hair:</span>
                      <span className="ml-2">{ character.physicalTraits.hair }</span>
                    </div>
                    <div>
                      <span className=" text-muted-foreground block mb-1">Clothing:</span>
                      <div className="flex flex-wrap gap-1">
                        { character.physicalTraits.clothing.map((item, i) => (
                          <Badge key={ i }>{ item }</Badge>
                        )) }
                      </div>
                    </div>
                    <div>
                      <span className=" text-muted-foreground block mb-1">Features:</span>
                      <div className="flex flex-wrap gap-1">
                        { character.physicalTraits.distinctiveFeatures.map((item, i) => (
                          <Badge key={ i } variant="secondary" className="">{ item }</Badge>
                        )) }
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="state" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className=" font-medium">Current Status</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-3">
                    { character.state.emotionalState && (
                      <div className="">
                        <span className="text-muted-foreground">Emotion:</span>
                        <Badge className="ml-2">{ character.state.emotionalState }</Badge>
                      </div>
                    ) }
                    <div className="grid grid-cols-2 gap-2 ">
                      <div className="flex items-center justify-between   p-2">
                        <span className="text-muted-foreground">Dirt</span>
                        <span className="font-medium capitalize">{ character.state.dirtLevel.replace('_', ' ') }</span>
                      </div>
                      <div className="flex items-center justify-between   p-2">
                        <span className="text-muted-foreground">Sweat</span>
                        <span className="font-medium capitalize">{ character.state.sweatLevel }</span>
                      </div>
                      <div className="flex items-center justify-between   p-2">
                        <span className="text-muted-foreground">Exhaustion</span>
                        <span className="font-medium capitalize">{ character.state.exhaustionLevel.replace('_', ' ') }</span>
                      </div>
                      <div className="flex items-center justify-between   p-2">
                        <span className="text-muted-foreground">Hair</span>
                        <span className="font-medium capitalize">{ character.state.hairCondition?.messiness?.replace('_', ' ') ?? 'N/A' }</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="prompt" className="mt-4">
                <Card>
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className=" font-medium">Generation Prompt</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    { assets[ 'character_prompt' ]?.data ? (
                      <p className=" font-mono whitespace-pre-wrap bg-muted p-3 ">
                        { assets[ 'character_prompt' ].data }
                      </p>
                    ) : (
                      <p className=" text-muted-foreground">No prompt available</p>
                    ) }
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </div>
    </>
  );
});

export default CharacterDetailPanel;
