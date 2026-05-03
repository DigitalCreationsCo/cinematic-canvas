import { buildLocationFullSpec } from "../location-spec.prompt.js";
import { createMockLocation } from "../../mocks/entities/mock-location.js";
import { describe, it, expect } from 'vitest';

describe('buildLocationFullSpec', () => {
  it('should include location description from assets', () => {
    const location = createMockLocation({
      assets: { description: 'A detailed location description' }
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('A detailed location description');
  });

  it('should fall back to location description if no assets description', () => {
    const location = createMockLocation({
      description: 'Direct location description',
      assets: {}
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Direct location description');
  });

  it('should include basic location information', () => {
    const location = createMockLocation({
      name: 'Beach House',
      type: 'exterior',
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Beach House: exterior');
  });

  it('should include environmental features', () => {
    const location = createMockLocation({
      naturalElements: ['palm trees', 'sandy dunes'],
      architecture: ['modern glass walls', 'wooden deck'],
      manMadeObjects: ['deck chairs', 'umbrella'],
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('palm trees, sandy dunes');
    expect(prompt).toContain('modern glass walls, wooden deck');
    expect(prompt).toContain('deck chairs, umbrella');
  });

  it('should include ground condition', () => {
    const location = createMockLocation({
      groundSurface: 'sandy beach',
      state: {
        groundCondition: {
          wetness: 'damp',
          debris: ['seaweed'],
          damage: ['erosion'],
        }
      }
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('sandy beach');
    expect(prompt).toContain('damp');
    expect(prompt).toContain('seaweed');
    expect(prompt).toContain('erosion');
  });

  it('should include sky or ceiling information', () => {
    const location = createMockLocation({
      skyOrCeiling: 'Clear blue sky with wispy clouds'
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Clear blue sky with wispy clouds');
  });

  it('should include time, season, and weather', () => {
    const location = createMockLocation({
      timeOfDay: 'Sunset',
      weather: 'Overcast',
      state: {
        season: 'autumn',
        weather: 'Overcast',
        timeOfDay: 'Sunset',
      }
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Sunset');
    expect(prompt).toContain('autumn');
    expect(prompt).toContain('Overcast');
  });

  it('should include atmospheric conditions', () => {
    const location = createMockLocation({
      state: {
        precipitation: 'light rain',
        visibility: 'foggy',
        atmosphericEffects: [
          { type: 'mist', intensity: 'light', dissipating: false }
        ],
        temperatureIndicators: ['chilly air'],
      }
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('light rain precipitation');
    expect(prompt).toContain('foggy visibility');
    expect(prompt).toContain('light mist');
    expect(prompt).toContain('chilly air');
  });

  it('should include lighting description', () => {
    const location = createMockLocation();
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Overhead light position');
    expect(prompt).toContain('Overhead ceiling lights');
    expect(prompt).toContain('Ambient reflection fill light');
    expect(prompt).toContain('Soft light hardness');
    expect(prompt).toContain('Low(1:2) contrast ratio');
  });

  it('should include color palette', () => {
    const location = createMockLocation({
      colorPalette: ['ocean blue', 'sandy beige', 'white']
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('ocean blue, sandy beige, white');
  });

  it('should include mood', () => {
    const location = createMockLocation({
      mood: 'Tranquil'
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Tranquil atmosphere');
  });

  it('should include location image from assets', () => {
    const location = createMockLocation({
      assets: { location_image: 'location-image.jpg' }
    });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Image: location-image.jpg');
  });

  it('should handle missing location image gracefully', () => {
    const location = createMockLocation({ assets: {} });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).not.toContain('Image:');
  });

  it('should include reference ID', () => {
    const location = createMockLocation({ referenceId: 'loc_beach_001' });
    const prompt = buildLocationFullSpec(location);

    expect(prompt).toContain('Reference ID: loc_beach_001');
  });
});
