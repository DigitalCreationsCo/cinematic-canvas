import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "#client/components/ui/dialog.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as AlertContent,
  AlertDialogDescription as AlertDescription,
  AlertDialogFooter as AlertFooter,
  AlertDialogHeader as AlertHeader,
  AlertDialogTitle as AlertTitle,
} from "#client/components/ui/alert-dialog.js";
import { Button } from "#client/components/ui/button.js";
import { Input } from "#client/components/ui/input.js";
import { Textarea } from "#client/components/ui/textarea.js";
import {
  api,
  getSceneAssets,
  getCharacterAssets,
  getLocationAssets,
  getPropAssets,
} from "#client/lib/api.js";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { NodeFactory } from "#client/domain/canvas/NodeFactory.js";
import { EntityFormFields } from "#client/components/canvas/panels/entity-form-fields/EntityFormFields.js";
import { Upload, X } from "lucide-react";
import { cn } from "#client/lib/utils.js";
import { generateId } from "#shared/utils/id.js";
import { fileToBase64 } from "#shared/utils/utils.js";
import { UploadResult } from "#shared/types/base.types.js";
import { EntityCreatableType } from "#shared/types/entity.types.js";
import {
  ENTITY_FORM_REQUIRED_FIELDS,
  EntityFormData,
  EntityFormDataByType,
  EntityFormErrors,
  validateEntityForm,
} from "#client/components/canvas/panels/entity-form-fields/entityFormValidation.js";
import {
  EntityFieldErrorMessage,
  getFieldControlClassName,
} from "#client/components/canvas/panels/entity-form-fields/entityFormValidationUi.js";

// ── Cache helpers ────────────────────────────────────────────────────────────
// Form-field data is persisted in sessionStorage so it survives accidental modal
// closes or browser refreshes. File / image data is NOT cached because File
// objects cannot be serialised to JSON.
const CACHE_PREFIX = "new-entity";

const getCacheKey = (entityType: EntityCreatableType): string =>
  `${CACHE_PREFIX}-${entityType}-fields`;

const cacheFields = (entityType: EntityCreatableType, fields: EntityFormData): void => {
  try {
    sessionStorage.setItem(getCacheKey(entityType), JSON.stringify(fields));
  } catch {
    /* quota exceeded or storage unavailable – silently ignore */
  }
};

const loadCachedFields = (entityType: EntityCreatableType): EntityFormData | null => {
  try {
    const raw = sessionStorage.getItem(getCacheKey(entityType));
    return raw ? (JSON.parse(raw) as EntityFormData) : null;
  } catch {
    return null;
  }
};

const clearCachedFields = (entityType: EntityCreatableType): void => {
  try {
    sessionStorage.removeItem(getCacheKey(entityType));
  } catch {
    /* silently ignore */
  }
};
// ── End cache helpers ────────────────────────────────────────────────────────

interface NewEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: EntityCreatableType;
  initialImageFile: File | null;
  projectId: string;
}

export const getAssetKeyForEntityType = (entityType: EntityCreatableType) => {
  switch (entityType) {
    case "character":
      return "character_image";
    case "location":
      return "location_image";
    case "scene":
      return "scene_start_frame";
    case "prop":
      return "prop_image";
    default:
      return "image_file";
  }
};

export const mergeOnlyEmptyFields = (
  current: Record<string, unknown>,
  aiResult: Record<string, unknown>,
): Record<string, unknown> => {
  const result = { ...current };

  for (const key of Object.keys(aiResult)) {
    const currentValue = current[key];
    const aiValue = aiResult[key];

    if (currentValue === undefined || currentValue === "" || currentValue === null) {
      if (typeof aiValue === "object" && aiValue !== null && !Array.isArray(aiValue)) {
        result[key] = mergeOnlyEmptyFields({}, aiValue as Record<string, unknown>);
      } else if (Array.isArray(aiValue)) {
        result[key] = aiValue;
      } else {
        result[key] = aiValue;
      }
    }
  }

  return result;
};

export const clearFileInputValue = (input: HTMLInputElement | null) => {
  if (input) {
    input.value = "";
  }
};

export const getSelectedFileName = (
  uploadedFile: File | null,
  initialFile: File | null,
): string | undefined => uploadedFile?.name || initialFile?.name;

export function NewEntityModal({
  isOpen,
  onClose,
  entityType,
  initialImageFile,
  projectId,
}: NewEntityModalProps) {
  const [fields, setFields] = useState<EntityFormData>({});
  const [validationErrors, setValidationErrors] = useState<EntityFormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const requiredFields = ENTITY_FORM_REQUIRED_FIELDS[entityType];
  const hasAtLeastOneValue = Object.values(fields as Record<string, unknown>).some(
    (val) => Boolean(val),
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<File | null>(initialImageFile);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialImageFile ? URL.createObjectURL(initialImageFile) : null,
  );
  const [uploadedImageGcsUri, setUploadedImageGcsUri] = useState<string | null>(null);
  const [uploadedImagePublicUri, setUploadedImagePublicUri] = useState<string | null>(
    null,
  );
  const [startFrameFile, setStartFrameFile] = useState<File | null>(null);
  const [endFrameFile, setEndFrameFile] = useState<File | null>(null);
  const [startFramePreview, setStartFramePreview] = useState<string | null>(null);
  const [endFramePreview, setEndFramePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputStartFrameRef = useRef<HTMLInputElement>(null);
  const fileInputEndFrameRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // ── Close-confirmation dialog state ────────────────────────────────────
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // ── Whether the form carries any user-entered data ─────────────────────
  const hasUnsavedData =
    hasAtLeastOneValue || !!uploadedImage || !!startFrameFile || !!endFrameFile;

  // ── Restore cached fields when the modal opens or entityType changes ───
  useEffect(() => {
    if (isOpen) {
      const cached = loadCachedFields(entityType);
      if (cached) {
        setFields(cached);
      }
      setValidationErrors({});
      setHasAttemptedSubmit(false);
    }
  }, [isOpen, entityType]);

  // ── Persist fields to sessionStorage whenever they change ──────────────
  useEffect(() => {
    if (isOpen && Object.keys(fields).length > 0) {
      cacheFields(entityType, fields);
    }
  }, [fields, isOpen, entityType]);

  const runValidation = (nextFields: EntityFormData) => {
    const result = validateEntityForm(entityType, nextFields, {
      requiredFields,
    });
    setValidationErrors(result.errors);
    return result;
  };

  const handleFieldsChange = (nextFields: EntityFormData) => {
    setFields(nextFields);

    if (hasAttemptedSubmit) {
      runValidation(nextFields);
    }
  };

  // ── Close helpers ───────────────────────────────────────────────────────
  const resetAllState = () => {
    setFields({});
    setValidationErrors({});
    setHasAttemptedSubmit(false);
    setUploadedImage(null);
    setPreviewUrl(null);
    setUploadedImageGcsUri(null);
    setUploadedImagePublicUri(null);
    setStartFrameFile(null);
    setEndFrameFile(null);
    setStartFramePreview(null);
    setEndFramePreview(null);
  };

  /** Closes the modal unconditionally and resets all local state. */
  const forceClose = () => {
    resetAllState();
    onClose();
  };

  /**
   * Safe close – shows the "Are you sure?" confirmation when the form
   * holds unsaved data.
   */
  const handleClose = () => {
    if (hasUnsavedData) {
      setShowCloseConfirm(true);
    } else {
      forceClose();
    }
  };

  /** User confirmed they want to discard – clear cache and close. */
  const confirmDiscard = () => {
    setShowCloseConfirm(false);
    clearCachedFields(entityType);
    forceClose();
  };

  /** Intercept Dialog onOpenChange so X / Escape / outside-click also go
   *  through the safe-close flow. */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
    }
  };

  const handleFile = (file: File) => {
    if (file.type.startsWith("image/") && canUploadImage) {
      setUploadedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else if (file.type.startsWith("audio/") && entityType === "character") {
      setUploadedImage(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setUploadedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    setPreviewUrl(null);
    clearFileInputValue(fileInputRef.current);
  };

  const canUploadImage =
    entityType === "character" ||
    entityType === "prop" ||
    entityType === "location" ||
    entityType === "scene";
  const isAudioFile = (uploadedImage || initialImageFile)?.type.startsWith("audio/");

  const uploadImageFile = async (file: File): Promise<UploadResult> => {
    const uploadData = await api.assets.uploadImage.mutate({
      fileData: await fileToBase64(file),
      fileName: file.name,
      mimeType: file.type,
    });
    return uploadData;
  };

  // const handleGenerate = async () => {
  //   setIsGenerating(true);
  //   try {
  //     let imageGcsUri;
  //     let mimeType;

  //     const imageFile = uploadedImage || initialImageFile;
  //     if (imageFile) {
  //       const uploadResult = await uploadImageFile(imageFile);
  //       imageGcsUri = uploadResult.gcsUri;
  //       mimeType = imageFile.type;
  //       setUploadedImageGcsUri(uploadResult.gcsUri);
  //       setUploadedImagePublicUri(uploadResult.publicUri);
  //     }

  //     const res = await apiFetch(api.entities.generateFields(), {
  //       method: 'POST',
  //       body: JSON.stringify({
  //         entityType,
  //         currentFields: fields,
  //         imageGcsUri,
  //         mimeType
  //       })
  //     });

  //     setFields(mergeOnlyEmptyFields(fields, res));
  //   } catch (e) {
  //     console.error(e);
  //   } finally {
  //     setIsGenerating(false);
  //   }
  // };

  /**
   *   • Images (scene reference, start frame, end frame) are uploaded to GCS
   *   • BEFORE the job is dispatched so their URIs are available in the payload.
   *   • The route returns 202 (accepted). The modal closes immediately.
   *   • Entity creation + canvas-node spawning now happens via the SSE
   *   • ENTITY_CREATED handler in usePipelineEvents, not inline here.
   *   • existingCharacters / existingLocations are no longer sent — the worker
   *   • fetches them from the DB.
   * @returns
   */
  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    const validationResult = runValidation(fields);

    if (!validationResult.isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      const entityId = generateId();
      type FormPayload = {
        [K in EntityCreatableType]: { type: K; data: EntityFormDataByType[K] };
      }[EntityCreatableType];

      const payload = { type: entityType, data: fields } as FormPayload;

      // 2. Scene handles its own unique API call and returns early
      if (payload.type === "scene") {
        const sceneData = { ...payload.data, id: entityId };
        const [startFrameUpload, endFrameUpload] = await Promise.all([
          startFrameFile ? uploadImageFile(startFrameFile) : Promise.resolve(null),
          endFrameFile ? uploadImageFile(endFrameFile) : Promise.resolve(null),
        ]);

        await api.entities.createScenesWithAutoFill.mutate({
          projectId,
          sceneFields: sceneData,
          startFrameGcsUri: startFrameUpload?.gcsUri,
          startFrameMimeType: startFrameFile?.type,
          endFrameGcsUri: endFrameUpload?.gcsUri,
          endFrameMimeType: endFrameFile?.type,
        });

        clearCachedFields(entityType);
        forceClose();
        setIsSubmitting(false);
        return;
      }

      // 4. Handle shared image uploads
      const imageFile = uploadedImage || initialImageFile;
      let uploadResult: { gcsUri: string; publicUri: string } | undefined;

      if (imageFile) {
        uploadResult = await uploadImageFile(imageFile);
      }

      // 5. Final shared mutation
      // We use `as any` solely at the API boundary here because tRPC/React Query
      // sometimes still struggles with generic mapped arrays, but your business logic is 100% type-safe.
      await api.entities.create.mutate([
        {
          entityType: payload.type,
          data: { ...payload.data, id: entityId } as any,
          images: uploadResult
            ? [
                {
                  gcsUri: uploadResult.gcsUri,
                  publicUri: uploadResult.publicUri,
                  mimeType: imageFile!.type,
                },
              ]
            : [],
        },
      ]);

      const canvasNode = NodeFactory.createNode({
        type: entityType,
        entityId: entityId,
        contextId: projectId,
        contextType: "project",
        posCanvas: {
          x: 100 + Math.random() * 200,
          y: 100 + Math.random() * 200,
        },
        scope: "project",
      });
      useNodeStore.getState().addNode(canvasNode);

      if (imageFile && entityId && uploadResult?.publicUri) {
        await api.assets.create.mutate({
          projectId,
          entityId: entityId,
          entityType,
          assetKey: getAssetKeyForEntityType(entityType),
          url: uploadResult.publicUri,
        });
      }

      const audioFile = uploadedImage || initialImageFile;
      if (
        entityType === "character" &&
        audioFile &&
        audioFile.type.startsWith("audio/") &&
        entityId
      ) {
        const arrayBuffer = await audioFile.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );

        await api.assets.uploadAudio.mutate({
          fileData: base64,
          fileName: audioFile.name,
          mimeType: audioFile.type,
        });
      }

      const entityAssets =
        entityType === "character"
          ? await getCharacterAssets({ projectId, characterId: entityId })
          : entityType === "location"
            ? await getLocationAssets({ projectId, locationId: entityId })
            : entityType === "prop"
              ? await getPropAssets({ projectId, propId: entityId })
              : await getSceneAssets({ projectId, sceneId: entityId });

      useAssetStore.getState().setAssets(entityId, entityAssets);

      clearCachedFields(entityType);
      forceClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          onPointerDownOutside={(e) => {
            // Prevent Radix from immediately closing — let onInteractOutside handle it
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            handleClose();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleClose();
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          overlayClassName="bg-transparent"
          className={cn(isDragging ? "ring-2 ring-primary ring-offset-2" : "border")}
        >
          <DialogHeader>
            <DialogTitle data-testid="title">
              New{" "}
              {entityType === "character" &&
              initialImageFile &&
              initialImageFile.type.startsWith("audio/")
                ? "Audio"
                : entityType.slice(0, 1).toLocaleUpperCase() + entityType.slice(1)}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 relative">
            {isDragging && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/10 rounded-none">
                <Upload className="h-12 w-12 text-primary mb-2" />
                <span className="text-sm font-medium">Drop file here</span>
              </div>
            )}
            {previewUrl && !isAudioFile && (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full max-h-48 object-contain rounded-none border"
                />
                <Button
                  data-testid="button-image-x"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 bg-background/10 hover:bg-background"
                  onClick={removeImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {isAudioFile && (
              <div className="text-center py-4">
                <div data-testid="input-audio-file" className="text-muted-foreground">
                  Audio file selected:
                </div>
                <div data-testid="audio-file-name" className="font-mono text-sm">
                  {getSelectedFileName(uploadedImage, initialImageFile)}
                </div>
              </div>
            )}

            {canUploadImage && !previewUrl && !isAudioFile && entityType !== "scene" && (
              <div
                className={`flex flex-col items-center justify-center border border-dashed rounded-none p-6 cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload
                  className={`h-8 w-8 mb-2 ${isDragging ? "text-primary" : "text-muted-foreground"}`}
                />
                <span
                  className={`text-sm ${isDragging ? "text-primary font-medium" : "text-muted-foreground"}`}
                >
                  {isDragging ? "Drop image here" : `Click to upload reference image`}
                </span>
                <input
                  data-testid="input-image"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            )}

            {entityType === "scene" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm">Start Frame</span>
                  {startFramePreview ? (
                    <div className="relative">
                      <img
                        src={startFramePreview}
                        alt="Start Frame"
                        className="w-full h-24 object-cover rounded-none border"
                      />
                      <Button
                        data-testid="button-image-x"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 bg-background/10 hover:bg-background"
                        onClick={() => {
                          setStartFrameFile(null);
                          setStartFramePreview(null);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center border border-dashed rounded-none p-4 cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputStartFrameRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputStartFrameRef}
                        accept="image/*"
                        data-testid="input-start-frame"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setStartFrameFile(file);
                            setStartFramePreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                      <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">
                        Upload an image
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-sm">End Frame</span>
                  {endFramePreview ? (
                    <div className="relative">
                      <img
                        src={endFramePreview}
                        alt="End Frame"
                        className="w-full h-24 object-cover rounded-none border"
                      />
                      <Button
                        data-testid="button-image-x"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 bg-background/10 hover:bg-background"
                        onClick={() => {
                          setEndFrameFile(null);
                          setEndFramePreview(null);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center border border-dashed rounded-none p-4 cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputEndFrameRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputEndFrameRef}
                        accept="image/*"
                        data-testid="input-end-frame"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setEndFrameFile(file);
                            setEndFramePreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                      <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">
                        Upload an image
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isAudioFile && (
              <>
                <EntityFormFields
                  entityType={entityType}
                  fields={fields}
                  onChange={handleFieldsChange}
                  projectId={projectId}
                  errors={validationErrors}
                  requiredFields={requiredFields}
                />
              </>
            )}

            {isAudioFile && (
              <>
                <Input
                  data-testid="input-name"
                  placeholder="Name"
                  value={fields.name || ""}
                  onChange={(e) =>
                    handleFieldsChange({ ...fields, name: e.target.value })
                  }
                  aria-invalid={Boolean(validationErrors.name)}
                  className={getFieldControlClassName(validationErrors, "name")}
                />
                <EntityFieldErrorMessage errors={validationErrors} fieldPath="name" />
                <Textarea
                  data-testid="input-description"
                  placeholder="Description (optional)"
                  value={fields.description || ""}
                  onChange={(e) =>
                    handleFieldsChange({ ...fields, description: e.target.value })
                  }
                  aria-invalid={Boolean(validationErrors.description)}
                  className={getFieldControlClassName(validationErrors, "description")}
                />
                <EntityFieldErrorMessage
                  errors={validationErrors}
                  fieldPath="description"
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button data-testid="button-cancel" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              data-testid="button-submit"
              onClick={handleSubmit}
              disabled={isSubmitting || !hasAtLeastOneValue}
            >
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close-confirmation dialog ─────────────────────────────────── */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertContent>
          <AlertHeader>
            <AlertTitle>Discard changes?</AlertTitle>
            <AlertDescription>Are you sure? You will lose your data.</AlertDescription>
          </AlertHeader>
          <AlertFooter>
            <AlertDialogCancel onClick={() => setShowCloseConfirm(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Discard</AlertDialogAction>
          </AlertFooter>
        </AlertContent>
      </AlertDialog>
    </>
  );
}
