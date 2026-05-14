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
import { VALID_DURATIONS } from "#shared/types/base.types.js";

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
                fieldPath="name"
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
                placeholder="Detailed description of scene"
                aria-invalid={Boolean(errors.description)}
                className={getFieldControlClassName(errors, "description")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="description" />
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
                fieldPath="locationTextInput"
                requiredFields={requiredFields}
              >
                Location
              </EntityFieldLabel>
              <MentionTextarea
                data-testid="input-location-text-input"
                ref={locationRef}
                projectId={projectId}
                initialContent={(sceneFields.locationTextInput as string) || ""}
                onUpdate={handleLocationChange}
                placeholder="Use @ to mention existing locations in your prompt"
                rows={2}
                aria-invalid={Boolean(errors.locationTextInput)}
                className={getFieldControlClassName(errors, "locationTextInput")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="locationTextInput" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="charactersTextInput"
                requiredFields={requiredFields}
              >
                Characters
              </EntityFieldLabel>
              <MentionTextarea
                data-testid="input-characters-text-input"
                ref={charactersRef}
                projectId={projectId}
                initialContent={
                  (sceneFields.charactersTextInput as string[])?.join(" ") || ""
                }
                onUpdate={handleCharactersChange}
                placeholder="Use @ to mention existing characters in your prompt"
                rows={2}
                aria-invalid={Boolean(errors.charactersTextInput)}
                className={getFieldControlClassName(errors, "charactersTextInput")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="charactersTextInput" />
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
                fieldPath="shotType"
                requiredFields={requiredFields}
              >
                Shot Type
              </EntityFieldLabel>
              <Select
                clearable
                value={(sceneFields.shotType as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="shotType" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="cameraAngle"
                requiredFields={requiredFields}
              >
                Camera Angle
              </EntityFieldLabel>
              <Select
                clearable
                value={(sceneFields.cameraAngle as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="cameraAngle" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="cameraMovement"
                requiredFields={requiredFields}
              >
                Camera Movement
              </EntityFieldLabel>
              <Select
                clearable
                value={(sceneFields.cameraMovement as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="cameraMovement" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="transitionType"
                requiredFields={requiredFields}
              >
                Transition Type
              </EntityFieldLabel>
              <Select
                clearable
                value={(sceneFields.transitionType as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="transitionType" />
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
                fieldPath="audioSync"
                requiredFields={requiredFields}
              >
                Audio Sync
              </EntityFieldLabel>
              <Select
                clearable
                value={(sceneFields.audioSync as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="audioSync" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <EntityFieldLabel
                  errors={errors}
                  fieldPath="startTime"
                  requiredFields={requiredFields}
                >
                  Start Time (seconds)
                </EntityFieldLabel>
                <Input
                  type="number"
                  value={(sceneFields.startTime as number) ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    onChange(
                      updateField(fields, "startTime", raw === "" ? undefined : parseFloat(raw)),
                    );
                  }}
                  placeholder="0"
                  aria-invalid={Boolean(errors.startTime)}
                  className={getFieldControlClassName(errors, "startTime")}
                />
                <EntityFieldErrorMessage errors={errors} fieldPath="startTime" />
              </div>
              <div className="grid gap-2">
                <EntityFieldLabel
                  errors={errors}
                  fieldPath="endTime"
                  requiredFields={requiredFields}
                >
                  End Time (seconds)
                </EntityFieldLabel>
                <Input
                  type="number"
                  value={(sceneFields.endTime as number) ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    onChange(
                      updateField(fields, "endTime", raw === "" ? undefined : parseFloat(raw)),
                    );
                  }}
                  placeholder="0"
                  aria-invalid={Boolean(errors.endTime)}
                  className={getFieldControlClassName(errors, "endTime")}
                />
                <EntityFieldErrorMessage errors={errors} fieldPath="endTime" />
              </div>
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="duration"
                requiredFields={requiredFields}
              >
                Duration
              </EntityFieldLabel>
              <Select
                clearable
                value={
                  sceneFields.duration !== undefined ? String(sceneFields.duration) : ""
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
                  {VALID_DURATIONS.map((d) => (
                    <SelectItem key={`duration-${d}`} value={String(d)}>
                      {d} seconds
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="duration" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="type"
                requiredFields={requiredFields}
              >
                Type
              </EntityFieldLabel>
              <Select
                value={(sceneFields.type as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="type" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="intensity"
                requiredFields={requiredFields}
              >
                Intensity
              </EntityFieldLabel>
              <Select
                clearable
                value={(sceneFields.intensity as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="intensity" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="tempo"
                requiredFields={requiredFields}
              >
                Tempo
              </EntityFieldLabel>
              <Select
                clearable
                value={(sceneFields.tempo as string) || ""}
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
              <EntityFieldErrorMessage errors={errors} fieldPath="tempo" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="musicalDescription"
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
              <EntityFieldErrorMessage errors={errors} fieldPath="musicalDescription" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
