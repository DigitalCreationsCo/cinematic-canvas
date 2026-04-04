import { Input } from '#client/components/ui/input.js';
import { Textarea } from '#client/components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#client/components/ui/select.js';
import { Label } from '#client/components/ui/label.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#client/components/ui/accordion.js';
import { EntityFormFieldsProps, updateField } from '#client/components/canvas/panels/entity-form-fields/EntityFormFields.js';

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
};

export default function LocationForm({ fields, onChange }: Omit<EntityFormFieldsProps, 'entityType'>) {
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
};