import LocationCard from '../LocationCard';
import type { Location } from '@shared/pipeline-types';

// todo: remove mock functionality
const mockLocation: any = {
  id: "loc_1",
  name: "Ancient Forest Temple",
  description: "A crumbling stone temple overgrown with vines, shafts of light piercing through the canopy above. Moss-covered pillars line the entrance.",
  lightingConditions: {
    quality: "Dappled",
    colorTemperature: "Warm",
    intensity: "Medium",
    motivatedSources: "Sun",
    direction: "Overhead"
  },
  timeOfDay: "Late afternoon",
  state: {
    lastUsed: 2,
    lighting: {
        quality: "Golden hour",
        colorTemperature: "Warm",
        intensity: "Medium",
        motivatedSources: "Sun",
        direction: "Low angle"
    },
    weather: "Clear",
    timeOfDay: "Sunset",
  },
};

export default function LocationCardExample() {
  return (
    <div className="max-w-xs">
      <LocationCard 
        location={mockLocation as Location}
        onSelect={() => console.log('Location selected')}
      />
    </div>
  );
}
