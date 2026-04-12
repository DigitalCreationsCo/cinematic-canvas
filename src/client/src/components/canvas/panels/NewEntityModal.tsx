import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import { Input } from "#client/components/ui/input.js";
import { Textarea } from "#client/components/ui/textarea.js";
import { apiFetch, apiFetchMultipart, getSceneAssets, getCharacterAssets, getLocationAssets } from '../../../lib/api.js';
import { api } from '../../../lib/routes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useAssetStore } from '../../../store/useAssetStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { NodeFactory } from '../../../domain/canvas/NodeFactory.js';
import { EntityFormFields } from './entity-form-fields/EntityFormFields.js';
import { Upload, X } from 'lucide-react';
import { cn } from '#client/lib/utils.js';

interface NewEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'character' | 'location' | 'scene';
  initialImageFile: File | null;
  projectId: string;
}

const mergeOnlyEmptyFields = (current: Record<string, unknown>, aiResult: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...current };

  for (const key of Object.keys(aiResult)) {
    const currentValue = current[key];
    const aiValue = aiResult[key];

    if (currentValue === undefined || currentValue === '' || currentValue === null) {
      if (typeof aiValue === 'object' && aiValue !== null && !Array.isArray(aiValue)) {
        result[key] = mergeOnlyEmptyFields(
          (typeof currentValue === 'object' && currentValue !== null)
            ? currentValue as Record<string, unknown>
            : {},
          aiValue as Record<string, unknown>
        );
      } else if (Array.isArray(aiValue) && (!Array.isArray(currentValue) || currentValue.length === 0)) {
        result[key] = aiValue;
      } else if (!Array.isArray(aiValue)) {
        result[key] = aiValue;
      }
    }
  }

  return result;
};

export function NewEntityModal({ isOpen, onClose, entityType, initialImageFile, projectId }: NewEntityModalProps) {

  const [fields, setFields] = useState<any>({});
  const hasAtLeastOneValue = Object.values(fields).some(val => Boolean(val));

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<File | null>(initialImageFile);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialImageFile ? URL.createObjectURL(initialImageFile) : null
  );
  const [uploadedImageGcsUri, setUploadedImageGcsUri] = useState<string | null>(null);
  const [uploadedImagePublicUri, setUploadedImagePublicUri] = useState<string | null>(null);
  const [startFrameFile, setStartFrameFile] = useState<File | null>(null);
  const [endFrameFile, setEndFrameFile] = useState<File | null>(null);
  const [startFramePreview, setStartFramePreview] = useState<string | null>(null);
  const [endFramePreview, setEndFramePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleFile = (file: File) => {
    if (file.type.startsWith('image/') && canUploadImage) {
      setUploadedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else if (file.type.startsWith('audio/') && entityType === 'character') {
      setUploadedImage(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
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
    if (file && file.type.startsWith('image/')) {
      setUploadedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const canUploadImage = entityType === 'character' || entityType === 'location' || entityType === 'scene';
  const isAudioFile = (uploadedImage || initialImageFile)?.type.startsWith('audio/');

  const getAssetKey = () => {
    switch (entityType) {
      case 'character':
        return 'character_image';
      case 'location':
        return 'location_image';
      case 'scene':
        return 'scene_start_frame';
      default:
        return 'image_file';
    }
  };

  const uploadImageFile = async (file: File): Promise<{ gcsUri: string; publicUri: string }> => {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("projectId", projectId);
    const uploadData = await apiFetchMultipart(api.assets.uploadImage(), formData);
    return { gcsUri: uploadData.imageGcsUri, publicUri: uploadData.imagePublicUri };
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
    setIsSubmitting(true);
    try {
      const dataToSubmit = { ...fields };

      if (entityType === 'scene') {
        // ── 1. Upload any user-provided images before dispatching the job ───────
        // All uploads happen in parallel so we don't serialise unnecessary work.
        const [sceneUpload, startFrameUpload, endFrameUpload] = await Promise.all([
          // Scene reference / thumbnail image (used as visual context for generation)
          (uploadedImage || initialImageFile)
            ? uploadImageFile((uploadedImage || initialImageFile)!)
            : Promise.resolve(null),
          // Start frame
          startFrameFile
            ? uploadImageFile(startFrameFile)
            : Promise.resolve(null),
          // End frame
          endFrameFile
            ? uploadImageFile(endFrameFile)
            : Promise.resolve(null),
        ]);

        // ── 2. Dispatch the CREATE_SCENE_WITH_ENTITIES job ──────────────────────
        // The server returns 202; the worker handles the rest asynchronously.
        // The client will receive an ENTITY_CREATED batch event via SSE when done.
        await apiFetch(api.entities.createSceneWithAutoFill(), {
          method: "POST",
          body: JSON.stringify({
            projectId,
            sceneFields: dataToSubmit,
            // Pass GCS URIs so the worker can save them as versioned assets
            sceneImageGcsUri: sceneUpload?.gcsUri,
            sceneImageMimeType: (uploadedImage || initialImageFile)?.type,
            startFrameGcsUri: startFrameUpload?.gcsUri,
            startFrameMimeType: startFrameFile?.type,
            endFrameGcsUri: endFrameUpload?.gcsUri,
            endFrameMimeType: endFrameFile?.type,
          }),
        });

        // Close immediately. Canvas nodes and project-store updates arrive via SSE.
        onClose();
        setIsSubmitting(false);
        return;
      }

      if (entityType === 'character') {
        dataToSubmit.aliases = dataToSubmit.aliases || [];
        dataToSubmit.physicalTraits = dataToSubmit.physicalTraits || {};
        dataToSubmit.state = dataToSubmit.state || {};
        dataToSubmit.referenceId = dataToSubmit.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      } else if (entityType === 'location') {
        dataToSubmit.timeOfDay = dataToSubmit.timeOfDay || 'day';
        dataToSubmit.weather = dataToSubmit.weather || 'clear';
      }

      const imageFile = uploadedImage || initialImageFile;
      let uploadedImageUri: string | undefined;

      if (imageFile) {
        const uploadResult = await uploadImageFile(imageFile);
        uploadedImageUri = uploadResult.publicUri;
      }

      const { entities } = await apiFetch(api.entities.list(), {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          inserts: [{
            entityType,
            data: dataToSubmit
          }]
        })
      });

      let newEntity = entities[0];
      const projectStore = useProjectStore.getState();
      const assetStore = useAssetStore.getState();
      if (entityType === 'character') {
        projectStore.addCharacter(newEntity);
      } else if (entityType === 'location') {
        projectStore.addLocation(newEntity);
      } else if (entityType === 'scene') {
        projectStore.addScene(newEntity);
      }

      const canvasNode = NodeFactory.createNode({
        type: entityType,
        entityId: newEntity.id,
        contextId: projectId,
        contextType: 'project',
        posCanvas: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
        scope: 'project'
      });
      useNodeStore.getState().addNode(canvasNode);

      if (imageFile && newEntity.id && uploadedImageUri) {
        await apiFetch(api.assets.list(), {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            entityId: newEntity.id,
            entityType,
            assetKey: getAssetKey(),
            url: uploadedImageUri
          })
        });

        const entityAssets = entityType === 'character'
          ? await getCharacterAssets(projectId, newEntity.id)
          : entityType === 'location'
            ? await getLocationAssets(projectId, newEntity.id)
            : await getSceneAssets(projectId, newEntity.id);
        assetStore.setAssets(newEntity.id, entityAssets);
      }

      if (startFrameFile && newEntity.id) {
        const uploadResult = await uploadImageFile(startFrameFile);
        await apiFetch(api.assets.list(), {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            entityId: newEntity.id,
            entityType: 'scene',
            assetKey: 'scene_start_frame',
            url: uploadResult.publicUri
          })
        });
      }

      if (endFrameFile && newEntity.id) {
        const uploadResult = await uploadImageFile(endFrameFile);
        await apiFetch(api.assets.list(), {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            entityId: newEntity.id,
            entityType: 'scene',
            assetKey: 'scene_end_frame',
            url: uploadResult.publicUri
          })
        });
      }

      const audioFile = uploadedImage || initialImageFile;
      if (entityType === 'character' && audioFile && audioFile.type.startsWith('audio/') && newEntity.id) {
        const formData = new FormData();
        formData.append("audio", audioFile);
        formData.append("projectId", projectId);

        const uploadData = await apiFetchMultipart(api.assets.uploadAudio(), formData);

        await apiFetch(api.assets.list(), {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            entityId: newEntity.id,
            entityType: 'audio',
            assetKey: 'audio_file',
            url: uploadData.audioPublicUri
          })
        });
      }

      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        overlayClassName='bg-transparent'
        className={cn(isDragging ? 'ring-2 ring-primary ring-offset-2' : 'border')}
      >
        <DialogHeader>
          <DialogTitle>New {entityType === 'character' && initialImageFile && initialImageFile.type.startsWith('audio/') ? 'Audio' : entityType}</DialogTitle>
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
              <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain rounded-none border" />
              <Button
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
              <div className="text-muted-foreground">Audio file selected:</div>
              <div className="font-mono text-sm">{uploadedImage?.name || initialImageFile?.name}</div>
            </div>
          )}

          {canUploadImage && !previewUrl && !isAudioFile && entityType !== 'scene' && (
            <div
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-none p-6 cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'hover:border-primary/50'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className={`h-8 w-8 mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-sm ${isDragging ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                {isDragging ? 'Drop image here' : `Click to upload reference image`}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          )}

          {entityType === 'scene' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Start Frame</span>
                {startFramePreview ? (
                  <div className="relative">
                    <img src={startFramePreview} alt="Start Frame" className="w-full h-24 object-cover rounded-none border" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 bg-background/10 hover:bg-background"
                      onClick={() => { setStartFrameFile(null); setStartFramePreview(null); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center border-2 border-dashed rounded-none p-4 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          setStartFrameFile(file);
                          setStartFramePreview(URL.createObjectURL(file));
                        }
                      };
                      input.click();
                    }}
                  >
                    <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Upload an image</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">End Frame</span>
                {endFramePreview ? (
                  <div className="relative">
                    <img src={endFramePreview} alt="End Frame" className="w-full h-24 object-cover rounded-none border" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 bg-background/10 hover:bg-background"
                      onClick={() => { setEndFrameFile(null); setEndFramePreview(null); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center border-2 border-dashed rounded-none p-4 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          setEndFrameFile(file);
                          setEndFramePreview(URL.createObjectURL(file));
                        }
                      };
                      input.click();
                    }}
                  >
                    <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Upload an image</span>
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
                onChange={setFields}
                projectId={projectId}
              />
            </>
          )}

          {isAudioFile && (
            <>
              <Input
                placeholder="Name"
                value={fields.name || ''}
                onChange={(e) => setFields({ ...fields, name: e.target.value })}
              />
              <Textarea
                placeholder="Description (optional)"
                value={fields.description || ''}
                onChange={(e) => setFields({ ...fields, description: e.target.value })}
              />
            </>
          )}

        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !hasAtLeastOneValue}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}