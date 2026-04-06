import { Input } from '#client/components/ui/input.js';
import { Textarea } from '#client/components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#client/components/ui/select.js';
import { Label } from '#client/components/ui/label.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#client/components/ui/accordion.js';
import { EntityFormFieldsProps, updateField } from '#client/components/canvas/panels/entity-form-fields/EntityFormFields.js';
import { CameraAngles, CameraMovements, ShotTypes, TransitionTypes } from '#shared/types/cinematography.types.js';
import { MentionTextarea, type MentionTextareaHandle } from '#client/components/editor/mention/MentionTextArea.js';
import { useRef, useEffect } from 'react';

interface SceneFormProps extends Omit<EntityFormFieldsProps, 'entityType'> {
  projectId: string;
}

export default function SceneForm({ fields, onChange, projectId }: SceneFormProps) {
  const locationRef = useRef<MentionTextareaHandle>(null);
  const charactersRef = useRef<MentionTextareaHandle>(null);

  useEffect(() => {
    if (locationRef.current && fields.locationReferenceId) {
      locationRef.current.setValue(fields.locationReferenceId as string);
    }
  }, []);

  useEffect(() => {
    if (charactersRef.current && fields.characterReferenceIds) {
      const charValue = (fields.characterReferenceIds as string[]).join(' ');
      charactersRef.current.setValue(charValue);
    }
  }, []);

  const handleLocationChange = (value: string) => {
    onChange(updateField(fields, 'locationReferenceId', value));
  };

  const handleCharactersChange = (value: string) => {
    const chars = value.split(/\s+/).filter(Boolean);
    onChange(updateField(fields, 'characterReferenceIds', chars));
  };

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
            <div className="grid gap-2">
              <Label>
                Location
                <span className="text-xs ml-2 text-muted-foreground">
                  (Type @ to mention a location)
                </span>
              </Label>
              <MentionTextarea
                ref={locationRef}
                projectId={projectId}
                initialContent={(fields.locationReferenceId as string) || ''}
                onUpdate={handleLocationChange}
                placeholder="Location of scene - use @ to mention existing locations"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Characters
                <span className="text-xs ml-2 text-muted-foreground">
                  (Type @ to mention a character)
                </span>
              </Label>
              <MentionTextarea
                ref={charactersRef}
                projectId={projectId}
                initialContent={(fields.characterReferenceIds as string[])?.join(' ') || ''}
                onUpdate={handleCharactersChange}
                placeholder="Characters in scene - use @ to mention existing characters"
                rows={2}
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
                  {ShotTypes.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
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
                  {CameraAngles.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
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
                  {CameraMovements.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
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
                  {TransitionTypes.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
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
