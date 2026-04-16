import { Card, CardContent, CardHeader, CardTitle } from "#client/components/ui/card.js";
import { Badge } from "#client/components/ui/badge.js";
import { Button } from "#client/components/ui/button.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#client/components/ui/tabs.js";
import { ScrollArea } from "#client/components/ui/scroll-area.js";
import { RefreshCw, FileText, User, Info, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, memo } from "react";
import type { Character, AssetKey, AssetVersion } from "../../../shared/types/index.js";
import FramePreview from "./FramePreview.js";
import { Skeleton } from "#client/components/ui/skeleton.js";
import { AssetHistoryPicker } from "./AssetHistoryPicker.js";
import { patchAsset, generateCharacterImage } from "#client/lib/api.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "#client/components/ui/tooltip.js";
import { useAssetStore, useCharacterAssets } from "../store/useAssetStore.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";
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
  const setAssets = useAssetStore((state) => state.setAssets);
  const addMessage = usePipelineStore((state) => state.pushEvent);

  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<AssetKey>("character_image");
  const [isGenerating, setIsGenerating] = useState(false);

  // Character assets
  const { bestAssets: assets, assets: registry } = useCharacterAssets(character.id);

  const handleHistoryClick = (assetKey: AssetKey) => {
    setPickerType(assetKey);
    setHistoryPickerOpen(true);
  };

  const handleSelectAsset = async (asset: AssetVersion) => {
    const previousRegistry = registry;

    // Optimistic update
    if (registry && registry[pickerType]) {
      const updatedRegistry = {
        ...registry,
        [pickerType]: {
          ...registry[pickerType]!,
          best: asset.version,
        }
      };
      setAssets(character.id, updatedRegistry);
    }
    try {
      await patchAsset(character.id, {
        projectId,
        entityType: 'character',
        assetKey: pickerType,
        version: asset.version,
      });
    } catch (error) {
      if (previousRegistry) {
        setAssets(character.id, previousRegistry);
      }
      addMessage({
        id: Date.now().toString(),
        type: "error",
        message: `Failed to restore asset: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      });
    }
  };

  const handleRegenerateClick = async () => {
    setIsGenerating(true);
    try {
      const description = [
        character.physicalTraits.age,
        "year old",
        character.physicalTraits.build,
        "with",
        character.physicalTraits.hair,
        "hair,",
        character.physicalTraits.clothing.join(", "),
      ].filter(Boolean).join(" ");

      // Dispatches a GENERATE_CHARACTERS pipeline command via the server.
      // The worker will generate the image and emit NEW_ASSETS_BATCH + FULL_STATE
      // when done — no client-side asset persistence needed here.
      await generateCharacterImage(projectId, character.name, description);

      addMessage({
        id: Date.now().toString(),
        type: "success",
        message: "Character image generation queued.",
        timestamp: new Date(),
      });
    } catch (error) {
      addMessage({
        id: Date.now().toString(),
        type: "error",
        message: `Failed to queue character image generation: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteAsset = (assetKey: AssetKey, version: number) => {
    // TODO: Implement delete
    addMessage({
      id: Date.now().toString(),
      type: "info",
      message: "Asset deletion coming soon.",
      timestamp: new Date(),
    });
  };


  return (
    <>
      <AssetHistoryPicker
        entityId={character.id}
        entityType="character"
        assetType={pickerType}
        projectId={projectId}
        isOpen={historyPickerOpen}
        onOpenChange={setHistoryPickerOpen}
        onSelect={handleSelectAsset}
        currentUrl={assets[pickerType]?.data}
      />
      <div className="h-full flex flex-col" data-testid={`panel-character-detail-${character.id}`}>
        <div className="p-4  flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {isLoading ? (
              <Skeleton className="h-10 w-10 " />
            ) : (
              <div className="h-10 w-10  bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              {isLoading ? (
                <Skeleton className="h-6 w-32 mb-1" />
              ) : (
                <h2 className="truncate">{character.name}</h2>
              )}
              {isLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <div className=" text-muted-foreground truncate capitalize">{character.physicalTraits.age} • {character.physicalTraits.build}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(hasPrevious || hasNext) && (
              <>
                <Button
                  size="icon"
                  onClick={onPrevious}
                  disabled={!hasPrevious || isLoading}
                  title="Previous Character"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={onNext}
                  disabled={!hasNext || isLoading}
                  title="Next Character"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div className="flex flex-col gap-3">
              <FramePreview
                title="Character Portrait"
                imageUrl={resolvePublicUrl(assets['character_image']?.data)}
                alt={character.name}
                isLoading={isLoading}
                onRegenerate={handleRegenerateClick}
                onDelete={() => handleDeleteAsset("character_image", assets["character_image"]?.version || 0)}
                onHistory={() => handleHistoryClick("character_image")}
                isGenerating={isGenerating}
                priority={true}
                scrollable={true}
                metadata={{ width: assets['character_image']?.metadata?.width, height: assets['character_image']?.metadata?.height }}
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
                  <CardContent className="p-3">
                    {isLoading ? <Skeleton className="h-10 w-full" /> : <p className="font-medium text-muted-foreground">{assets['description']?.data}</p>}
                  </CardContent>
                </Card>

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
                      <span className="ml-2">{character.physicalTraits.hair}</span>
                    </div>
                    <div>
                      <span className=" text-muted-foreground block mb-1">Clothing:</span>
                      <div className="flex flex-wrap gap-1">
                        {character.physicalTraits.clothing.map((item, i) => (
                          <Badge key={i}>{item}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className=" text-muted-foreground block mb-1">Features:</span>
                      <div className="flex flex-wrap gap-1">
                        {character.physicalTraits.distinctiveFeatures.map((item, i) => (
                          <Badge key={i} variant="secondary" className="">{item}</Badge>
                        ))}
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
                  <CardContent className="p-3 pt-0 space-y-2">
                    {character.state.emotionalState && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Emotion:</span>
                        <span className="ml-1 font-medium capitalize">{character.state.emotionalState}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Dirt</span>
                        <span className="font-medium capitalize">{character.state.dirtLevel.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Costume Wetness</span>
                        <span className="font-medium capitalize">{character.state.costumeCondition?.wetness}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Hair Wetness</span>
                        <span className="font-medium capitalize">{character.state.hairCondition?.wetness}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Exhaustion</span>
                        <span className="font-medium capitalize">{character.state.exhaustionLevel.replace('_', ' ')}</span>
                      </div>
                      <div className="flex flex-col items-start justify-between">
                        <span className="text-muted-foreground">Hair</span>
                        <span className="font-medium capitalize">{Object.values(character.state.hairCondition || {}).join('. ')}</span>
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
                      <CardTitle className=" font-medium">Prompt</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    {assets['character_image']?.metadata.prompt ? (
                      <p className=" font-mono whitespace-pre-wrap p-2">
                        {assets['character_image'].metadata.prompt}
                      </p>
                    ) : (
                      <p className=" text-muted-foreground">No prompt available</p>
                    )}
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