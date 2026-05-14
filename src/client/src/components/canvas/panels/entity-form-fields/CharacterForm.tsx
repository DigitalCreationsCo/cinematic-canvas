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
import { CharacterFormData } from "#client/components/canvas/panels/entity-form-fields/entityFormValidation.js";

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

export default function CharacterForm({
  fields,
  onChange,
  errors = {},
  requiredFields = [],
}: Omit<EntityFormFieldsProps, "entityType">) {
  const characterFields = fields as CharacterFormData;
  const tf = characterFields as TypedFields;

  return (
    <Accordion type="multiple" defaultValue={["basic", "physical"]} className="w-full">
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
                placeholder="Character name"
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
                placeholder="Character description"
                aria-invalid={Boolean(errors.description)}
                className={getFieldControlClassName(errors, "description")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="description" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="aliases"
                requiredFields={requiredFields}
              >
                Aliases (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((characterFields.aliases as string[]) || []).join(", ")}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "aliases",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Alias 1, Alias 2"
                aria-invalid={Boolean(errors.aliases)}
                className={getFieldControlClassName(errors, "aliases")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="aliases" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="physical">
        <AccordionTrigger>Physical Traits</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.hair"
                requiredFields={requiredFields}
              >
                Hair
              </EntityFieldLabel>
              <Input
                value={(tf.physicalTraits?.hair as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "physicalTraits.hair", e.target.value))
                }
                placeholder="Hairstyle, color, length, texture"
                aria-invalid={Boolean(errors["physicalTraits.hair"])}
                className={getFieldControlClassName(errors, "physicalTraits.hair")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="physicalTraits.hair" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.build"
                requiredFields={requiredFields}
              >
                Build
              </EntityFieldLabel>
              <Select
                clearable
                value={(tf.physicalTraits?.build as string) || ""}
                onValueChange={(v) =>
                  onChange(updateField(fields, "physicalTraits.build", v))
                }
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors["physicalTraits.build"])}
                  className={getFieldControlClassName(errors, "physicalTraits.build")}
                >
                  <SelectValue placeholder="Select build" />
                </SelectTrigger>
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
              <EntityFieldErrorMessage errors={errors} fieldPath="physicalTraits.build" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.age"
                requiredFields={requiredFields}
              >
                Age
              </EntityFieldLabel>
              <Input
                value={(tf.physicalTraits?.age as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "physicalTraits.age", e.target.value))
                }
                placeholder="Character age"
                aria-invalid={Boolean(errors["physicalTraits.age"])}
                className={getFieldControlClassName(errors, "physicalTraits.age")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="physicalTraits.age" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.gender"
                requiredFields={requiredFields}
              >
                Gender
              </EntityFieldLabel>
              <Select
                clearable
                value={(tf.physicalTraits?.gender as string) || ""}
                onValueChange={(v) =>
                  onChange(updateField(fields, "physicalTraits.gender", v))
                }
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors["physicalTraits.gender"])}
                  className={getFieldControlClassName(errors, "physicalTraits.gender")}
                >
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="physicalTraits.gender"
              />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.ethnicity"
                requiredFields={requiredFields}
              >
                Ethnicity
              </EntityFieldLabel>
              <Input
                value={(tf.physicalTraits?.ethnicity as string) || ""}
                onChange={(e) =>
                  onChange(
                    updateField(fields, "physicalTraits.ethnicity", e.target.value),
                  )
                }
                placeholder="Ethnicity description"
                aria-invalid={Boolean(errors["physicalTraits.ethnicity"])}
                className={getFieldControlClassName(errors, "physicalTraits.ethnicity")}
              />
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="physicalTraits.ethnicity"
              />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.clothing"
                requiredFields={requiredFields}
              >
                Clothing (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((tf.physicalTraits?.clothing as string[]) || []).join(", ")}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "physicalTraits.clothing",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Outfit description"
                aria-invalid={Boolean(errors["physicalTraits.clothing"])}
                className={getFieldControlClassName(errors, "physicalTraits.clothing")}
              />
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="physicalTraits.clothing"
              />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.accessories"
                requiredFields={requiredFields}
              >
                Accessories (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((tf.physicalTraits?.accessories as string[]) || []).join(", ")}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "physicalTraits.accessories",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Accessories list"
                aria-invalid={Boolean(errors["physicalTraits.accessories"])}
                className={getFieldControlClassName(errors, "physicalTraits.accessories")}
              />
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="physicalTraits.accessories"
              />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.distinctiveFeatures"
                requiredFields={requiredFields}
              >
                Distinctive Features (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((tf.physicalTraits?.distinctiveFeatures as string[]) || []).join(
                  ", ",
                )}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "physicalTraits.distinctiveFeatures",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Distinctive features"
                aria-invalid={Boolean(errors["physicalTraits.distinctiveFeatures"])}
                className={getFieldControlClassName(
                  errors,
                  "physicalTraits.distinctiveFeatures",
                )}
              />
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="physicalTraits.distinctiveFeatures"
              />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="physicalTraits.appearanceNotes"
                requiredFields={requiredFields}
              >
                Appearance Notes (comma-separated)
              </EntityFieldLabel>
              <Input
                value={((tf.physicalTraits?.appearanceNotes as string[]) || []).join(
                  ", ",
                )}
                onChange={(e) =>
                  onChange(
                    updateField(
                      fields,
                      "physicalTraits.appearanceNotes",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                placeholder="Additional appearance notes"
                aria-invalid={Boolean(errors["physicalTraits.appearanceNotes"])}
                className={getFieldControlClassName(
                  errors,
                  "physicalTraits.appearanceNotes",
                )}
              />
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="physicalTraits.appearanceNotes"
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
              <EntityFieldLabel
                errors={errors}
                fieldPath="state.emotionalState"
                requiredFields={requiredFields}
              >
                Emotional State
              </EntityFieldLabel>
              <Input
                value={(tf.state?.emotionalState as string) || ""}
                onChange={(e) =>
                  onChange(updateField(fields, "state.emotionalState", e.target.value))
                }
                placeholder="Current emotional state"
                aria-invalid={Boolean(errors["state.emotionalState"])}
                className={getFieldControlClassName(errors, "state.emotionalState")}
              />
              <EntityFieldErrorMessage errors={errors} fieldPath="state.emotionalState" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="state.position"
                requiredFields={requiredFields}
              >
                Position
              </EntityFieldLabel>
              <Select
                clearable
                value={(tf.state?.position as string) || ""}
                onValueChange={(v) => onChange(updateField(fields, "state.position", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors["state.position"])}
                  className={getFieldControlClassName(errors, "state.position")}
                >
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="foreground">Foreground</SelectItem>
                  <SelectItem value="background">Background</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="state.position" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="state.dirtLevel"
                requiredFields={requiredFields}
              >
                Dirt Level
              </EntityFieldLabel>
              <Select
                clearable
                value={(tf.state?.dirtLevel as string) || ""}
                onValueChange={(v) => onChange(updateField(fields, "state.dirtLevel", v))}
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors["state.dirtLevel"])}
                  className={getFieldControlClassName(errors, "state.dirtLevel")}
                >
                  <SelectValue placeholder="Select dirt level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clean">Clean</SelectItem>
                  <SelectItem value="slightly_dirty">Slightly Dirty</SelectItem>
                  <SelectItem value="dirty">Dirty</SelectItem>
                  <SelectItem value="very_dirty">Very Dirty</SelectItem>
                  <SelectItem value="covered">Covered</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage errors={errors} fieldPath="state.dirtLevel" />
            </div>
            <div className="grid gap-2">
              <EntityFieldLabel
                errors={errors}
                fieldPath="state.exhaustionLevel"
                requiredFields={requiredFields}
              >
                Exhaustion Level
              </EntityFieldLabel>
              <Select
                clearable
                value={(tf.state?.exhaustionLevel as string) || ""}
                onValueChange={(v) =>
                  onChange(updateField(fields, "state.exhaustionLevel", v))
                }
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors["state.exhaustionLevel"])}
                  className={getFieldControlClassName(errors, "state.exhaustionLevel")}
                >
                  <SelectValue placeholder="Select exhaustion level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresh">Fresh</SelectItem>
                  <SelectItem value="slightly_tired">Slightly Tired</SelectItem>
                  <SelectItem value="tired">Tired</SelectItem>
                  <SelectItem value="exhausted">Exhausted</SelectItem>
                  <SelectItem value="collapsing">Collapsing</SelectItem>
                </SelectContent>
              </Select>
              <EntityFieldErrorMessage
                errors={errors}
                fieldPath="state.exhaustionLevel"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
