import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "./ui/drawer.js";
import SceneDetailPanel from "./SceneDetailPanel.js";
import CharacterDetailPanel from "./CharacterDetailPanel.js";
import LocationDetailPanel from "./LocationDetailPanel.js";
import { MessageList } from "./MessageList.js";
import { usePipelineStore } from "../store/usePipelineStore.js";
import { useCanvasUIStore } from "../store/useCanvasUIStore.js";
import type { Scene, Character, Location, AssetStatus } from "../../../shared/types/index.js";

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  selectedScene: Scene & { status: string } | null;
  selectedSceneCharacters: Character[];
  selectedSceneLocation?: Location;
  selectedCharacter: Character | null;
  selectedLocation: Location | null;

  projectId: string;
  isLoading: boolean;

  onNextScene?: () => void;
  onPrevScene?: () => void;
  onNextCharacter?: () => void;
  onPrevCharacter?: () => void;
  onNextLocation?: () => void;
  onPrevLocation?: () => void;

  currentScenes: (Scene & { status: string })[];
  currentCharacters: Character[];
  currentLocations: Location[];

  overlayClassName?: string;
  showMessages?: boolean;
}

export function DetailDrawer({
  open,
  onOpenChange,
  selectedScene,
  selectedSceneCharacters,
  selectedSceneLocation,
  selectedCharacter,
  selectedLocation,
  projectId,
  isLoading,
  onNextScene,
  onPrevScene,
  onNextCharacter,
  onPrevCharacter,
  onNextLocation,
  onPrevLocation,
  currentScenes,
  currentCharacters,
  currentLocations,
  overlayClassName,
  showMessages,
}: DetailDrawerProps) {
  const events = usePipelineStore((s) => s.events);
  const { toggleMessagesSidebar } = useCanvasUIStore();

  const handleClose = () => {
    onOpenChange(false);
    toggleMessagesSidebar();
  };

  const getTitle = () => {
    if (showMessages) return "Messages";
    if (selectedScene) return `Scene ${selectedScene.sceneIndex + 1}`;
    if (selectedCharacter) return selectedCharacter.name;
    if (selectedLocation) return selectedLocation.name;
    return "Details";
  };

  const getSceneIndex = () => {
    if (!selectedScene) return -1;
    return currentScenes.findIndex(s => s.sceneIndex === selectedScene.sceneIndex);
  };

  const getCharacterIndex = () => {
    if (!selectedCharacter) return -1;
    return currentCharacters.findIndex(c => c.id === selectedCharacter.id);
  };

  const getLocationIndex = () => {
    if (!selectedLocation) return -1;
    return currentLocations.findIndex(l => l.id === selectedLocation.id);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && showMessages) {
      toggleMessagesSidebar();
    }
    onOpenChange(isOpen);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="h-[80vh]" overlayClassName={overlayClassName}>
        <DrawerHeader className="sr-only">
          <DrawerTitle>{getTitle()}</DrawerTitle>
          <DrawerDescription>
            View and manage details for the selected item
          </DrawerDescription>
        </DrawerHeader>

        <div className="h-[calc(85vh-20px)] overflow-hidden">
          {showMessages ? (
            <MessageList events={events} />
          ) : selectedScene ? (
            <SceneDetailPanel
              projectId={projectId}
              scene={selectedScene}
              status={selectedScene.status as AssetStatus}
              characters={selectedSceneCharacters}
              location={selectedSceneLocation}
              isLoading={isLoading}
              isGenerating={
                selectedScene.status === "generating" || selectedScene.status === "evaluating"
              }
              onNext={onNextScene}
              onPrevious={onPrevScene}
              hasNext={getSceneIndex() < currentScenes.length - 1}
              hasPrevious={getSceneIndex() > 0}
            />
          ) : selectedCharacter ? (
            <CharacterDetailPanel
              character={selectedCharacter}
              projectId={projectId}
              isLoading={isLoading}
              onNext={onNextCharacter}
              onPrevious={onPrevCharacter}
              hasNext={getCharacterIndex() < currentCharacters.length - 1}
              hasPrevious={getCharacterIndex() > 0}
            />
          ) : selectedLocation ? (
            <LocationDetailPanel
              location={selectedLocation}
              projectId={projectId}
              isLoading={isLoading}
              onNext={onNextLocation}
              onPrevious={onPrevLocation}
              hasNext={getLocationIndex() < currentLocations.length - 1}
              hasPrevious={getLocationIndex() > 0}
            />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
