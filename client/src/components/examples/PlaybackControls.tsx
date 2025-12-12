import PlaybackControls from '../PlaybackControls';
import type { Scene } from '@shared/pipeline-types';

const defaultLighting = {
    quality: "Soft",
    colorTemperature: "Neutral",
    intensity: "Medium",
    motivatedSources: "Natural",
    direction: "Front"
};

// todo: remove mock functionality
const mockScenes: any[] = [
  { id: 1, startTime: 0, endTime: 6, duration: 6, type: "lyrical", lyrics: "Rising up", description: "", musicChange: "", intensity: "medium", mood: "Hopeful", tempo: "moderate", transitionType: "Fade", shotType: "Wide Shot", cameraMovement: "Static", lighting: defaultLighting, audioSync: "Lip Sync", continuityNotes: [], characters: [], locationId: "loc_1", musicalDescription: "A hopeful melody" },
  { id: 2, startTime: 6, endTime: 12, duration: 6, type: "instrumental", lyrics: "", description: "", musicChange: "", intensity: "high", mood: "Intense", tempo: "fast", transitionType: "Cut", shotType: "Close-up", cameraMovement: "Dolly", lighting: defaultLighting, audioSync: "Beat Sync", continuityNotes: [], characters: [], locationId: "loc_1", musicalDescription: "Intense beat" },
  { id: 3, startTime: 12, endTime: 20, duration: 8, type: "climax", lyrics: "We will rise", description: "", musicChange: "", intensity: "extreme", mood: "Triumphant", tempo: "very_fast", transitionType: "Smash Cut", shotType: "Wide Shot", cameraMovement: "Crane Up", lighting: defaultLighting, audioSync: "Beat Sync", continuityNotes: [], characters: [], locationId: "loc_2", musicalDescription: "Triumphant climax" },
  { id: 4, startTime: 20, endTime: 24, duration: 4, type: "transition", lyrics: "", description: "", musicChange: "", intensity: "low", mood: "Reflective", tempo: "slow", transitionType: "Dissolve", shotType: "Medium Shot", cameraMovement: "Static", lighting: defaultLighting, audioSync: "Mood Sync", continuityNotes: [], characters: [], locationId: "loc_2", musicalDescription: "Reflective ending" },
];

export default function PlaybackControlsExample() {
  return (
    <div className="w-full max-w-2xl">
      <PlaybackControls
        scenes={ mockScenes as Scene[] }
        totalDuration={ 24 }
        onSeekSceneChange={ (id) => console.log('Seekbar changed to scene:', id) }
        onTimeUpdate={ (time) => console.log('Time:', time.toFixed(1)) }
      />
    </div>
  );
}
