import React from 'react';
import { Input } from '#client/components/ui/input.js';
import { Textarea } from '#client/components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#client/components/ui/select.js';
import { Checkbox } from '#client/components/ui/checkbox.js';
import { Label } from '#client/components/ui/label.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#client/components/ui/accordion.js';

interface EntityFormFieldsProps {
  entityType: 'character' | 'location' | 'scene';
  fields: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
}

interface TypedFields {
  [key: string]: unknown;
  physicalTraits?: {
    hair?: string;
    clothing?: string[];
    accessories?: string[];
    distinctiveFeatures?: string[];
    build?: string;
    ethnicity?: string;
    age?: string;
    gender?: string;
    appearanceNotes?: string[];
  };
  state?: {
    emotionalState?: string;
    position?: string;
    dirtLevel?: string;
    exhaustionLevel?: string;
    season?: string;
  };
}

const updateField = (current: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> => {
  const keys = path.split('.');
  const result = { ...current };
  let obj = result;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof obj[keys[i]] !== 'object' || obj[keys[i]] === null) {
      obj[keys[i]] = {};
    }
    obj[keys[i]] = { ...obj[keys[i]] as Record<string, unknown> };
    obj = obj[keys[i]] as Record<string, unknown>;
  }
  obj[keys[keys.length - 1]] = value;
  return result;
};

function CharacterForm({ fields, onChange }: Omit<EntityFormFieldsProps, 'entityType'>) {
  const tf = fields as TypedFields;
  return (
    <Accordion type="multiple" defaultValue={['basic', 'physical']} className="w-full">
      <AccordionItem value="basic">
        <AccordionTrigger>Basic Information</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={(fields.name as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'name', e.target.value))}
                placeholder="Character name"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={(fields.description as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'description', e.target.value))}
                placeholder="Character description"
              />
            </div>
            <div className="grid gap-2">
              <Label>Aliases (comma-separated)</Label>
              <Input
                value={((fields.aliases as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'aliases', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Alias 1, Alias 2"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="physical">
        <AccordionTrigger>Physical Traits</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Hair</Label>
              <Input
                value={(tf.physicalTraits?.hair as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'physicalTraits.hair', e.target.value))}
                placeholder="Hairstyle, color, length, texture"
              />
            </div>
            <div className="grid gap-2">
              <Label>Build</Label>
              <Select
                value={(tf.physicalTraits?.build as string) || 'average'}
                onValueChange={(v) => onChange(updateField(fields, 'physicalTraits.build', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select build" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="very_thin">Very Thin</SelectItem>
                  <SelectItem value="thin">Thin</SelectItem>
                  <SelectItem value="average">Average</SelectItem>
                  <SelectItem value="athletic">Athletic</SelectItem>
                  <SelectItem value="muscular">Muscular</SelectItem>
                  <SelectItem value="curvy">Curvy</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Age</Label>
              <Input
                value={(tf.physicalTraits?.age as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'physicalTraits.age', e.target.value))}
                placeholder="Character age"
              />
            </div>
            <div className="grid gap-2">
              <Label>Gender</Label>
              <Select
                value={(tf.physicalTraits?.gender as string) || 'male'}
                onValueChange={(v) => onChange(updateField(fields, 'physicalTraits.gender', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ethnicity</Label>
              <Input
                value={(tf.physicalTraits?.ethnicity as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'physicalTraits.ethnicity', e.target.value))}
                placeholder="Ethnicity description"
              />
            </div>
            <div className="grid gap-2">
              <Label>Clothing (comma-separated)</Label>
              <Input
                value={((tf.physicalTraits?.clothing as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'physicalTraits.clothing', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Outfit description"
              />
            </div>
            <div className="grid gap-2">
              <Label>Accessories (comma-separated)</Label>
              <Input
                value={((tf.physicalTraits?.accessories as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'physicalTraits.accessories', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Accessories list"
              />
            </div>
            <div className="grid gap-2">
              <Label>Distinctive Features (comma-separated)</Label>
              <Input
                value={((tf.physicalTraits?.distinctiveFeatures as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'physicalTraits.distinctiveFeatures', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Distinctive features"
              />
            </div>
            <div className="grid gap-2">
              <Label>Appearance Notes (comma-separated)</Label>
              <Input
                value={((tf.physicalTraits?.appearanceNotes as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'physicalTraits.appearanceNotes', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Additional appearance notes"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="state">
        <AccordionTrigger>Character State</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Emotional State</Label>
              <Input
                value={(tf.state?.emotionalState as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'state.emotionalState', e.target.value))}
                placeholder="Current emotional state"
              />
            </div>
            <div className="grid gap-2">
              <Label>Position</Label>
              <Select
                value={(tf.state?.position as string) || ''}
                onValueChange={(v) => onChange(updateField(fields, 'state.position', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="foreground">Foreground</SelectItem>
                  <SelectItem value="background">Background</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Dirt Level</Label>
              <Select
                value={(tf.state?.dirtLevel as string) || 'clean'}
                onValueChange={(v) => onChange(updateField(fields, 'state.dirtLevel', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select dirt level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clean">Clean</SelectItem>
                  <SelectItem value="slightly_dirty">Slightly Dirty</SelectItem>
                  <SelectItem value="dirty">Dirty</SelectItem>
                  <SelectItem value="very_dirty">Very Dirty</SelectItem>
                  <SelectItem value="covered">Covered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Exhaustion Level</Label>
              <Select
                value={(tf.state?.exhaustionLevel as string) || 'fresh'}
                onValueChange={(v) => onChange(updateField(fields, 'state.exhaustionLevel', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select exhaustion level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresh">Fresh</SelectItem>
                  <SelectItem value="slightly_tired">Slightly Tired</SelectItem>
                  <SelectItem value="tired">Tired</SelectItem>
                  <SelectItem value="exhausted">Exhausted</SelectItem>
                  <SelectItem value="collapsing">Collapsing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function LocationForm({ fields, onChange }: Omit<EntityFormFieldsProps, 'entityType'>) {
  const tf = fields as TypedFields;
  return (
    <Accordion type="multiple" defaultValue={['basic', 'atmosphere']} className="w-full">
      <AccordionItem value="basic">
        <AccordionTrigger>Basic Information</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={(fields.name as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'name', e.target.value))}
                placeholder="Location name"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={(fields.description as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'description', e.target.value))}
                placeholder="Location description"
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Input
                value={(fields.type as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'type', e.target.value))}
                placeholder="e.g., beach, urban, warehouse"
              />
            </div>
            <div className="grid gap-2">
              <Label>Mood</Label>
              <Input
                value={(fields.mood as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'mood', e.target.value))}
                placeholder="Atmospheric mood"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="environment">
        <AccordionTrigger>Environment</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Time of Day</Label>
              <Select
                value={(fields.timeOfDay as string) || 'day'}
                onValueChange={(v) => onChange(updateField(fields, 'timeOfDay', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select time of day" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dawn">Dawn</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="midday">Midday</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="dusk">Dusk</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                  <SelectItem value="midnight">Midnight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Weather</Label>
              <Select
                value={(fields.weather as string) || 'clear'}
                onValueChange={(v) => onChange(updateField(fields, 'weather', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select weather" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clear">Clear</SelectItem>
                  <SelectItem value="cloudy">Cloudy</SelectItem>
                  <SelectItem value="overcast">Overcast</SelectItem>
                  <SelectItem value="rainy">Rainy</SelectItem>
                  <SelectItem value="stormy">Stormy</SelectItem>
                  <SelectItem value="foggy">Foggy</SelectItem>
                  <SelectItem value="snowy">Snowy</SelectItem>
                  <SelectItem value="windy">Windy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Season</Label>
              <Select
                value={(tf.state?.season as string) || 'unspecified'}
                onValueChange={(v) => onChange(updateField(fields, 'state.season', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spring">Spring</SelectItem>
                  <SelectItem value="summer">Summer</SelectItem>
                  <SelectItem value="fall">Fall</SelectItem>
                  <SelectItem value="winter">Winter</SelectItem>
                  <SelectItem value="unspecified">Unspecified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Color Palette (comma-separated)</Label>
              <Input
                value={((fields.colorPalette as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'colorPalette', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Dominant colors"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="elements">
        <AccordionTrigger>Elements</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Architecture (comma-separated)</Label>
              <Input
                value={((fields.architecture as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'architecture', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Architectural features"
              />
            </div>
            <div className="grid gap-2">
              <Label>Natural Elements (comma-separated)</Label>
              <Input
                value={((fields.naturalElements as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'naturalElements', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Natural elements"
              />
            </div>
            <div className="grid gap-2">
              <Label>Man-made Objects (comma-separated)</Label>
              <Input
                value={((fields.manMadeObjects as string[]) || []).join(', ')}
                onChange={(e) => onChange(updateField(fields, 'manMadeObjects', e.target.value.split(',').map(s => s.trim()).filter(Boolean)))}
                placeholder="Man-made objects"
              />
            </div>
            <div className="grid gap-2">
              <Label>Ground Surface</Label>
              <Input
                value={(fields.groundSurface as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'groundSurface', e.target.value))}
                placeholder="Ground surface description"
              />
            </div>
            <div className="grid gap-2">
              <Label>Sky/Ceiling</Label>
              <Input
                value={(fields.skyOrCeiling as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'skyOrCeiling', e.target.value))}
                placeholder="Sky or ceiling description"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function SceneForm({ fields, onChange }: Omit<EntityFormFieldsProps, 'entityType'>) {
  return (
    <Accordion type="multiple" defaultValue={['basic']} className="w-full">
      <AccordionItem value="basic">
        <AccordionTrigger>Scene Details</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={(fields.name as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'name', e.target.value))}
                placeholder="Scene name"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={(fields.description as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'description', e.target.value))}
                placeholder="Detailed description of scene"
              />
            </div>
            <div className="grid gap-2">
              <Label>Mood</Label>
              <Input
                value={(fields.mood as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'mood', e.target.value))}
                placeholder="Overall emotional tone"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cinematography">
        <AccordionTrigger>Cinematography</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Shot Type</Label>
              <Select
                value={(fields.shotType as string) || 'Medium Close-Up'}
                onValueChange={(v) => onChange(updateField(fields, 'shotType', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select shot type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Extreme Close-Up">Extreme Close-Up</SelectItem>
                  <SelectItem value="Close-Up">Close-Up</SelectItem>
                  <SelectItem value="Medium Close-Up">Medium Close-Up</SelectItem>
                  <SelectItem value="Medium Shot">Medium Shot</SelectItem>
                  <SelectItem value="Medium Wide">Medium Wide</SelectItem>
                  <SelectItem value="Wide Shot">Wide Shot</SelectItem>
                  <SelectItem value="Very Wide/Establishing">Very Wide/Establishing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Camera Angle</Label>
              <Select
                value={(fields.cameraAngle as string) || 'Eye Level'}
                onValueChange={(v) => onChange(updateField(fields, 'cameraAngle', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select camera angle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Eye Level">Eye Level</SelectItem>
                  <SelectItem value="High Angle">High Angle</SelectItem>
                  <SelectItem value="Low Angle">Low Angle</SelectItem>
                  <SelectItem value="Bird's Eye">Bird's Eye</SelectItem>
                  <SelectItem value="Dutch Angle">Dutch Angle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Camera Movement</Label>
              <Select
                value={(fields.cameraMovement as string) || 'Steadicam'}
                onValueChange={(v) => onChange(updateField(fields, 'cameraMovement', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select camera movement" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Static">Static</SelectItem>
                  <SelectItem value="Pan Left">Pan Left</SelectItem>
                  <SelectItem value="Pan Right">Pan Right</SelectItem>
                  <SelectItem value="Tilt Up">Tilt Up</SelectItem>
                  <SelectItem value="Tilt Down">Tilt Down</SelectItem>
                  <SelectItem value="Dolly In">Dolly In</SelectItem>
                  <SelectItem value="Dolly Out">Dolly Out</SelectItem>
                  <SelectItem value="Track Left">Track Left</SelectItem>
                  <SelectItem value="Track Right">Track Right</SelectItem>
                  <SelectItem value="Crane Up">Crane Up</SelectItem>
                  <SelectItem value="Crane Down">Crane Down</SelectItem>
                  <SelectItem value="Handheld">Handheld</SelectItem>
                  <SelectItem value="Steadicam">Steadicam</SelectItem>
                  <SelectItem value="Drone">Drone</SelectItem>
                  <SelectItem value="Zoom In">Zoom In</SelectItem>
                  <SelectItem value="Zoom Out">Zoom Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Transition Type</Label>
              <Select
                value={(fields.transitionType as string) || 'Continuous'}
                onValueChange={(v) => onChange(updateField(fields, 'transitionType', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select transition type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cut">Cut</SelectItem>
                  <SelectItem value="Hard Cut">Hard Cut</SelectItem>
                  <SelectItem value="Jump Cut">Jump Cut</SelectItem>
                  <SelectItem value="Dissolve">Dissolve</SelectItem>
                  <SelectItem value="Cross Fade">Cross Fade</SelectItem>
                  <SelectItem value="Fade">Fade</SelectItem>
                  <SelectItem value="Fade to Black">Fade to Black</SelectItem>
                  <SelectItem value="Continuous">Continuous</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="audio">
        <AccordionTrigger>Audio Timing</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Audio Sync</Label>
              <Select
                value={(fields.audioSync as string) || 'Mood Sync'}
                onValueChange={(v) => onChange(updateField(fields, 'audioSync', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select audio sync" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Lip Sync">Lip Sync</SelectItem>
                  <SelectItem value="Mood Sync">Mood Sync</SelectItem>
                  <SelectItem value="Beat Sync">Beat Sync</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Time (seconds)</Label>
                <Input
                  type="number"
                  value={(fields.startTime as number) || 0}
                  onChange={(e) => onChange(updateField(fields, 'startTime', parseFloat(e.target.value) || 0))}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label>End Time (seconds)</Label>
                <Input
                  type="number"
                  value={(fields.endTime as number) || 0}
                  onChange={(e) => onChange(updateField(fields, 'endTime', parseFloat(e.target.value) || 0))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Duration</Label>
              <Select
                value={(fields.duration as string) || '4'}
                onValueChange={(v) => onChange(updateField(fields, 'duration', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 seconds</SelectItem>
                  <SelectItem value="6">6 seconds</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={(fields.type as string) || 'instrumental'}
                onValueChange={(v) => onChange(updateField(fields, 'type', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lyrical">Lyrical</SelectItem>
                  <SelectItem value="instrumental">Instrumental</SelectItem>
                  <SelectItem value="transition">Transition</SelectItem>
                  <SelectItem value="breakdown">Breakdown</SelectItem>
                  <SelectItem value="solo">Solo</SelectItem>
                  <SelectItem value="climax">Climax</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Intensity</Label>
              <Select
                value={(fields.intensity as string) || 'medium'}
                onValueChange={(v) => onChange(updateField(fields, 'intensity', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select intensity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tempo</Label>
              <Select
                value={(fields.tempo as string) || 'moderate'}
                onValueChange={(v) => onChange(updateField(fields, 'tempo', v))}
              >
                <SelectTrigger><SelectValue placeholder="Select tempo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">Slow</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="fast">Fast</SelectItem>
                  <SelectItem value="very_fast">Very Fast</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Musical Description</Label>
              <Textarea
                value={(fields.musicalDescription as string) || ''}
                onChange={(e) => onChange(updateField(fields, 'musicalDescription', e.target.value))}
                placeholder="Detailed description of sound, instruments, tempo, mood"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function EntityFormFields({ entityType, fields, onChange }: EntityFormFieldsProps) {
  const formContent = (
    <>
      {entityType === 'character' && <CharacterForm fields={fields} onChange={onChange} />}
      {entityType === 'location' && <LocationForm fields={fields} onChange={onChange} />}
      {entityType === 'scene' && <SceneForm fields={fields} onChange={onChange} />}
    </>
  );

  return (
    <div className="max-h-[50vh] overflow-y-auto pr-2">
      {formContent}
    </div>
  );
}