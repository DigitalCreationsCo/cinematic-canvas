import { Input } from "#client/components/ui/input.js";
import { Textarea } from "#client/components/ui/textarea.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#client/components/ui/select.js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#client/components/ui/accordion.js";
import {
  EntityFormFieldsProps,
  updateField,
} from "#client/components/canvas/panels/entity-form-fields/EntityFormFields.js";
import {
  EntityFieldErrorMessage,
  EntityFieldLabel,
  getFieldControlClassName,
} from "#client/components/canvas/panels/entity-form-fields/entityFormValidationUi.js";
import { LocationFormData } from "#client/components/canvas/panels/entity-form-fields/entityFormValidation.js";

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

export default function LocationForm({
  fields,
  onChange,
  errors = {},
  requiredFields = [],
}: Omit<EntityFormFieldsProps, "entityType">) {
  const locationFields = fields as LocationFormData;
  const tf = locationFields as TypedFields;

  return (
    <Accordion type="multiple" defaultValue={["basic", "atmosphere"]} className="w-full">
      <AccordionItem value="basic">
        <AccordionTrigger>Basic Information</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="name"
                requiredFields={requiredFields}
              >
                Name
              </EntityFieldLabel>
              <Input
                data-testid="input-name"
                value={(fields.name as string) || ""}
                onChange={(e) => onChange(updateField(fields, "name", e.target.value))}
                placeholder="Location name"
                aria-invalid={Boolean(errors.name)}
                className={getFieldControlClassName(errors, "name")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="name" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="description"
                requiredFields={requiredFields}
              >
                Description
              </EntityFieldLabel>
              <Textarea
                data-testid="input-description"
                value={(fields.description as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "description", e.target.value))
                }
                placeholder="Location description"
                aria-invalid={Boolean(errors.description)}
                className={getFieldControlClassName(errors, "description")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="description" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="type"
                requiredFields={requiredFields}
              >
                Type
              </EntityFieldLabel>
              <Input
                value={(locationFields.type as string) || ""}
                onChange={(e) => onChange(updateField(fields, "type", e.target.value))}
                placeholder="e.g., beach, urban, warehouse"
                aria-invalid={Boolean(errors.type)}
                className={getFieldControlClassName(errors, "type")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="type" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="mood"
                requiredFields={requiredFields}
              >
                Mood
              </EntityFieldLabel>
              <Input
                value={(locationFields.mood as string) || ""}
                onChange={(e) => onChange(updateField(fields, "mood", e.target.value))}
                placeholder="Atmospheric mood"
                aria-invalid={Boolean(errors.mood)}
                className={getFieldControlClassName(errors, "mood")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="mood" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="environment">
        <AccordionTrigger>Environment</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="timeOfDay"
                requiredFields={requiredFields}
              >
                Time of Day
              </EntityFieldLabel>
              <Select
                value={(locationFields.timeOfDay as string) || ""}
                onValueChange={(v) => onChange(updateField(fields, "timeOfDay", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.timeOfDay)}
                  className={getFieldControlClassName(errors, "timeOfDay")}
                >
                  <SelectValue placeholder="Select time of day" />
                </SelectTrigger>
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
              <EntityFieldErrorMessage errors={errors} fieldPath="timeOfDay" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="weather"
                requiredFields={requiredFields}
              >
                Weather
              </EntityFieldLabel>
              <Select
                value={(locationFields.weather as string) || ""}
                onValueChange={(v) => onChange(updateField(fields, "weather", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.weather)}
                  className={getFieldControlClassName(errors, "weather")}
                >
                  <SelectValue placeholder="Select weather" />
                </SelectTrigger>
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
              <EntityFieldErrorMessage errors={errors} fieldPath="weather" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="state.season"
                requiredFields={requiredFields}
              >
                Season
              </EntityFieldLabel>
              <Select
                value={(tf.state?.season as string) || ""}
                onValueChange={(v) => onChange(updateField(fields, "state.season", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors["state.season"])}
                  className={getFieldControlClassName(errors, "state.season")}
                >
                  <SelectValue placeholder="Select season" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spring">Spring</SelectItem>
                  <SelectItem value="summer">Summer</SelectItem>
                  <SelectItem value="fall">Fall</SelectItem>
                  <SelectItem value="winter">Winter</SelectItem>
                  <SelectItem value="unspecified">Unspecified</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="state.season" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="colorPalette"
                requiredFields={requiredFields}
              >
                Color Palette (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((locationFields.colorPalette as string[]) || []).join(", ")}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "colorPalette",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Dominant colors"
                aria-invalid={Boolean(errors.colorPalette)}
                className={getFieldControlClassName(errors, "colorPalette")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="colorPalette" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="elements">
        <AccordionTrigger>Elements</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="architecture"
                requiredFields={requiredFields}
              >
                Architecture (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((locationFields.architecture as string[]) || []).join(", ")}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "architecture",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Architectural features"
                aria-invalid={Boolean(errors.architecture)}
                className={getFieldControlClassName(errors, "architecture")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="architecture" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="naturalElements"
                requiredFields={requiredFields}
              >
                Natural Elements (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((locationFields.naturalElements as string[]) || []).join(", ")}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "naturalElements",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Natural elements"
                aria-invalid={Boolean(errors.naturalElements)}
                className={getFieldControlClassName(errors, "naturalElements")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="naturalElements" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="manMadeObjects"
                requiredFields={requiredFields}
              >
                Man-made Objects (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((locationFields.manMadeObjects as string[]) || []).join(", ")}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "manMadeObjects",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Man-made objects"
                aria-invalid={Boolean(errors.manMadeObjects)}
                className={getFieldControlClassName(errors, "manMadeObjects")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="manMadeObjects" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="groundSurface"
                requiredFields={requiredFields}
              >
                Ground Surface
              </EntityFieldLabel>
              <Input
                value={(locationFields.groundSurface as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "groundSurface", e.target.value))
                }
                placeholder="Ground surface description"
                aria-invalid={Boolean(errors.groundSurface)}
                className={getFieldControlClassName(errors, "groundSurface")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="groundSurface" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="skyOrCeiling"
                requiredFields={requiredFields}
              >
                Sky/Ceiling
              </EntityFieldLabel>
              <Input
                value={(locationFields.skyOrCeiling as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "skyOrCeiling", e.target.value))
                }
                placeholder="Sky or ceiling description"
                aria-invalid={Boolean(errors.skyOrCeiling)}
                className={getFieldControlClassName(errors, "skyOrCeiling")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="skyOrCeiling" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
