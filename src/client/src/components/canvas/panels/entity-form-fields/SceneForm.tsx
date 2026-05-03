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
  CameraAngles,
  CameraMovements,
  ShotTypes,
  TransitionTypes,
} from "#shared/types/cinematography.types.js";
import {
  MentionTextarea,
  type MentionTextareaHandle,
} from "#client/components/editor/mention/MentionTextArea.js";
import { useRef, useEffect } from "react";
import {
  EntityFieldErrorMessage,
  EntityFieldLabel,
  getFieldControlClassName,
} from "#client/components/canvas/panels/entity-form-fields/entityFormValidationUi.js";
import {
  extractVisibleTextForValidation,
  SceneFormData,
} from "#client/components/canvas/panels/entity-form-fields/entityFormValidation.js";

interface SceneFormProps extends Omit<EntityFormFieldsProps, "entityType"> {
  projectId: string;
}

export const normalizeCharacterReferenceIdsInput = (value: string): string[] =>
  extractVisibleTextForValidation(value).length > 0 ? [value] : [];

export default function SceneForm({
  fields,
  onChange,
  projectId,
  errors = {},
  requiredFields = [],
}: SceneFormProps) {
  const sceneFields = fields as SceneFormData;
  const locationRef = useRef<MentionTextareaHandle>(null);
  const charactersRef = useRef<MentionTextareaHandle>(null);

  useEffect(() => {
    if (locationRef.current && sceneFields.locationTextInput) {
      locationRef.current.setValue(sceneFields.locationTextInput as string);
    }
  }, []);

  useEffect(() => {
    if (charactersRef.current && sceneFields.charactersTextInput) {
      const charValue = (sceneFields.charactersTextInput as string[]).join(" ");
      charactersRef.current.setValue(charValue);
    }
  }, []);

  const handleLocationChange = (value: string) => {
    onChange(updateField(fields, "locationTextInput", value));
  };

  const handleCharactersChange = (value: string) => {
    onChange(
      updateField(
        fields,
        "charactersTextInput",
        normalizeCharacterReferenceIdsInput(value),
      ),
    );
  };

  return (
    <Accordion type="multiple" defaultValue={["basic"]} className="w-full">
      <AccordionItem value="basic">
        <AccordionTrigger>Scene Details</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Name"
                requiredFields={requiredFields}
              >
                Name
              </EntityFieldLabel>
              <Input
                data-testid="input-name"
                value={(fields.name as string) || ""}
                onChange={(e) => onChange(updateField(fields, "name", e.target.value))}
                placeholder="Scene name"
                aria-invalid={Boolean(errors.name)}
                className={getFieldControlClassName(errors, "name")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="name" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Description"
                requiredFields={requiredFields}
              >
                Description
              </EntityFieldLabel>
              <Textarea
                value={(fields.description as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "description", e.target.value))
                }
                placeholder="Detailed description of scene"
                aria-invalid={Boolean(errors.description)}
                className={getFieldControlClassName(errors, "description")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="description" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Mood"
                requiredFields={requiredFields}
              >
                Mood
              </EntityFieldLabel>
              <Input
                value={(sceneFields.mood as string) || ""}
                onChange={(e) => onChange(updateField(fields, "mood", e.target.value))}
                placeholder="Overall emotional tone"
                aria-invalid={Boolean(errors.mood)}
                className={getFieldControlClassName(errors, "mood")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="mood" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Location"
                requiredFields={requiredFields}
              >
                Location
                <span className="text-xs ml-2 text-muted-foreground">
                  (Type @ to mention a location)
                </span>
              </EntityFieldLabel>
              <MentionTextarea
                ref={locationRef}
                projectId={projectId}
                initialContent={(sceneFields.locationTextInput as string) || ""}
                onUpdate={handleLocationChange}
                placeholder="Location of scene - use @ to mention existing locations"
                rows={2}
                className={getFieldControlClassName(errors, "locationTextInput")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="Location" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Characters"
                requiredFields={requiredFields}
              >
                Characters
                <span className="text-xs ml-2 text-muted-foreground">
                  (Type @ to mention a character)
                </span>
              </EntityFieldLabel>
              <MentionTextarea
                ref={charactersRef}
                projectId={projectId}
                initialContent={
                  (sceneFields.charactersTextInput as string[])?.join(" ") || ""
                }
                onUpdate={handleCharactersChange}
                placeholder="Characters in scene - use @ to mention existing characters"
                rows={2}
                className={getFieldControlClassName(errors, "charactersTextInput")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="Characters" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="cinematography">
        <AccordionTrigger>Cinematography</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Shot Type"
                requiredFields={requiredFields}
              >
                Shot Type
              </EntityFieldLabel>
              <Select
                value={(sceneFields.shotType as string) || "Medium Close-Up"}
                onValueChange={(v) => onChange(updateField(fields, "shotType", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.shotType)}
                  className={getFieldControlClassName(errors, "shotType")}
                >
                  <SelectValue placeholder="Select shot type" />
                </SelectTrigger>
                <SelectContent>
                  {ShotTypes.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Shot Type" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Camera Angle"
                requiredFields={requiredFields}
              >
                Camera Angle
              </EntityFieldLabel>
              <Select
                value={(sceneFields.cameraAngle as string) || "Eye Level"}
                onValueChange={(v) => onChange(updateField(fields, "cameraAngle", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.cameraAngle)}
                  className={getFieldControlClassName(errors, "cameraAngle")}
                >
                  <SelectValue placeholder="Select camera angle" />
                </SelectTrigger>
                <SelectContent>
                  {CameraAngles.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Camera Angle" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Camera Movement"
                requiredFields={requiredFields}
              >
                Camera Movement
              </EntityFieldLabel>
              <Select
                value={(sceneFields.cameraMovement as string) || "Steadicam"}
                onValueChange={(v) => onChange(updateField(fields, "cameraMovement", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.cameraMovement)}
                  className={getFieldControlClassName(errors, "cameraMovement")}
                >
                  <SelectValue placeholder="Select camera movement" />
                </SelectTrigger>
                <SelectContent>
                  {CameraMovements.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Camera Movement" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Transition Type"
                requiredFields={requiredFields}
              >
                Transition Type
              </EntityFieldLabel>
              <Select
                value={(sceneFields.transitionType as string) || "Continuous"}
                onValueChange={(v) => onChange(updateField(fields, "transitionType", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.transitionType)}
                  className={getFieldControlClassName(errors, "transitionType")}
                >
                  <SelectValue placeholder="Select transition type" />
                </SelectTrigger>
                <SelectContent>
                  {TransitionTypes.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Transition Type" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="audio">
        <AccordionTrigger>Audio Timing</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Audio Sync"
                requiredFields={requiredFields}
              >
                Audio Sync
              </EntityFieldLabel>
              <Select
                value={(sceneFields.audioSync as string) || "Mood Sync"}
                onValueChange={(v) => onChange(updateField(fields, "audioSync", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.audioSync)}
                  className={getFieldControlClassName(errors, "audioSync")}
                >
                  <SelectValue placeholder="Select audio sync" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Lip Sync">Lip Sync</SelectItem>
                  <SelectItem value="Mood Sync">Mood Sync</SelectItem>
                  <SelectItem value="Beat Sync">Beat Sync</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Audio Sync" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <EntityFieldLabel
                  errors={errors}
                  fieldPath="Start Time"
                  requiredFields={requiredFields}
                >
                  Start Time (seconds)
                </EntityFieldLabel>
                <Input
                  type="number"
                  value={(sceneFields.startTime as number) || 0}
                  onChange={(e) =>
                    onChange(
                      updateField(fields, "startTime", parseFloat(e.target.value) || 0),
                    )
                  }
                  placeholder="0"
                  aria-invalid={Boolean(errors.startTime)}
                  className={getFieldControlClassName(errors, "startTime")}
                />
                <EntityFieldErrorMessage errors={errors} fieldPath="Start Time" />
              </div>
              <div className="grid gap-2">
                <EntityFieldLabel
                  errors={errors}
                  fieldPath="End Time"
                  requiredFields={requiredFields}
                >
                  End Time (seconds)
                </EntityFieldLabel>
                <Input
                  type="number"
                  value={(sceneFields.endTime as number) || 0}
                  onChange={(e) =>
                    onChange(
                      updateField(fields, "endTime", parseFloat(e.target.value) || 0),
                    )
                  }
                  placeholder="0"
                  aria-invalid={Boolean(errors.endTime)}
                  className={getFieldControlClassName(errors, "endTime")}
                />
                <EntityFieldErrorMessage errors={errors} fieldPath="End Time" />
              </div>
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Duration"
                requiredFields={requiredFields}
              >
                Duration
              </EntityFieldLabel>
              <Select
                value={
                  sceneFields.duration !== undefined ? String(sceneFields.duration) : "4"
                }
                onValueChange={(v) =>
                  onChange(updateField(fields, "duration", Number(v)))
                }
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.duration)}
                  className={getFieldControlClassName(errors, "duration")}
                >
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 seconds</SelectItem>
                  <SelectItem value="6">6 seconds</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Duration" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Type"
                requiredFields={requiredFields}
              >
                Type
              </EntityFieldLabel>
              <Select
                value={(sceneFields.type as string) || "instrumental"}
                onValueChange={(v) => onChange(updateField(fields, "type", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.type)}
                  className={getFieldControlClassName(errors, "type")}
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lyrical">Lyrical</SelectItem>
                  <SelectItem value="instrumental">Instrumental</SelectItem>
                  <SelectItem value="transition">Transition</SelectItem>
                  <SelectItem value="breakdown">Breakdown</SelectItem>
                  <SelectItem value="solo">Solo</SelectItem>
                  <SelectItem value="climax">Climax</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Type" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Intensity"
                requiredFields={requiredFields}
              >
                Intensity
              </EntityFieldLabel>
              <Select
                value={(sceneFields.intensity as string) || "medium"}
                onValueChange={(v) => onChange(updateField(fields, "intensity", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.intensity)}
                  className={getFieldControlClassName(errors, "intensity")}
                >
                  <SelectValue placeholder="Select intensity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Intensity" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Tempo"
                requiredFields={requiredFields}
              >
                Tempo
              </EntityFieldLabel>
              <Select
                value={(sceneFields.tempo as string) || "moderate"}
                onValueChange={(v) => onChange(updateField(fields, "tempo", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.tempo)}
                  className={getFieldControlClassName(errors, "tempo")}
                >
                  <SelectValue placeholder="Select tempo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">Slow</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="fast">Fast</SelectItem>
                  <SelectItem value="very_fast">Very Fast</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="Tempo" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="Musical Description"
                requiredFields={requiredFields}
              >
                Musical Description
              </EntityFieldLabel>
              <Textarea
                value={(sceneFields.musicalDescription as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "musicalDescription", e.target.value))
                }
                placeholder="Detailed description of sound, instruments, tempo, mood"
                aria-invalid={Boolean(errors.musicalDescription)}
                className={getFieldControlClassName(errors, "musicalDescription")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="Musical Description" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
