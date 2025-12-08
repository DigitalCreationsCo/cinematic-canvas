import PlaybackControls from '../PlaybackControls';
import type { Scene } from '@shared/pipeline-types';

// todo: remove mock functionality
const mockScenes: Scene[] = [
  { id: 1, startTime: 0, endTime: 6, duration: 6, type: "lyrical", lyrics: "Rising up", description: "", musicChange: "", intensity: "medium", mood: "Hopeful", tempo: "moderate", transitionType: "Fade", shotType: "Wide Shot", cameraMovement: "Static", lighting: "Soft", audioSync: "Lip Sync", continuityNotes: [], characters: [], locationId: "loc_1" },
  { id: 2, startTime: 6, endTime: 12, duration: 6, type: "instrumental", lyrics: "", description: "", musicChange: "", intensity: "high", mood: "Intense", tempo: "fast", transitionType: "Cut", shotType: "Close-up", cameraMovement: "Dolly", lighting: "Dramatic", audioSync: "Beat Sync", continuityNotes: [], characters: [], locationId: "loc_1" },
  { id: 3, startTime: 12, endTime: 20, duration: 8, type: "climax", lyrics: "We will rise", description: "", musicChange: "", intensity: "extreme", mood: "Triumphant", tempo: "very_fast", transitionType: "Smash Cut", shotType: "Wide Shot", cameraMovement: "Crane Up", lighting: "Backlit", audioSync: "Beat Sync", continuityNotes: [], characters: [], locationId: "loc_2" },
  { id: 4, startTime: 20, endTime: 24, duration: 4, type: "transition", lyrics: "", description: "", musicChange: "", intensity: "low", mood: "Reflective", tempo: "slow", transitionType: "Dissolve", shotType: "Medium Shot", cameraMovement: "Static", lighting: "Natural", audioSync: "Mood Sync", continuityNotes: [], characters: [], locationId: "loc_2" },
];

export default function PlaybackControlsExample() {
  return (
    <div className="w-full max-w-2xl">
      <PlaybackControls 
        scenes={mockScenes}
        totalDuration={24}
        onSceneChange={(id) => console.log('Scene changed to:', id)}
        onTimeUpdate={(time) => console.log('Time:', time.toFixed(1))}
      />
    </div>
  );
}
