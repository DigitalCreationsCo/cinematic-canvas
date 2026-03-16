import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "#/components/ui/dialog.js";
import { Button } from "#/components/ui/button.js";
import { Input } from "#/components/ui/input.js";
import { Textarea } from "#/components/ui/textarea.js";
import { apiFetch, apiFetchMultipart } from '../../../lib/api.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { NodeFactory } from '../../../domain/canvas/NodeFactory.js';

interface NewEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'character' | 'location' | 'scene';
  initialImageFile: File | null;
  projectId: string;
}

export function NewEntityModal({ isOpen, onClose, entityType, initialImageFile, projectId }: NewEntityModalProps) {
  const [fields, setFields] = useState<any>({ name: '', description: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialImageFile ? URL.createObjectURL(initialImageFile) : null
  );

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      let imageGcsUri;
      let mimeType;

      if (initialImageFile) {
        const formData = new FormData();
        formData.append("image", initialImageFile);
        formData.append("projectId", projectId);
        
        const uploadData = await apiFetchMultipart('/upload-image', formData);
        imageGcsUri = uploadData.imageGcsUri;
        mimeType = initialImageFile.type;
      }

      const res = await apiFetch('/entities/generate-fields', {
        method: 'POST',
        body: JSON.stringify({
          entityType,
          currentFields: fields,
          imageGcsUri,
          mimeType
        })
      });
      
      setFields({ ...fields, ...res });
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const dataToSubmit = { ...fields };
      if (entityType === 'character') {
        dataToSubmit.aliases = dataToSubmit.aliases || [];
        dataToSubmit.physicalTraits = dataToSubmit.physicalTraits || {};
        dataToSubmit.state = dataToSubmit.state || {};
        dataToSubmit.referenceId = dataToSubmit.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      } else if (entityType === 'location') {
        dataToSubmit.timeOfDay = dataToSubmit.timeOfDay || 'day';
        dataToSubmit.weather = dataToSubmit.weather || 'clear';
      }
      
      const newEntity = await apiFetch('/entities', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          type: entityType,
          data: dataToSubmit
        })
      });

      const projectStore = useProjectStore.getState();
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

      if (initialImageFile && newEntity.id) {
        const formData = new FormData();
        formData.append("image", initialImageFile);
        formData.append("projectId", projectId);
        
        const uploadData = await apiFetchMultipart('/upload-image', formData);
        
        await apiFetch('/assets', {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            entityId: newEntity.id,
            entityType,
            assetKey: entityType === 'character' ? 'character_image' : 'location_image',
            url: uploadData.imagePublicUri
          })
        });
      }
      
      // Handle audio file upload (for when entityType is reused for audio)
      if (entityType === 'character' && initialImageFile && initialImageFile.type.startsWith('audio/') && newEntity.id) {
        // For audio, we'll treat it as a special case - upload as audio asset
        const formData = new FormData();
        formData.append("audio", initialImageFile);
        formData.append("projectId", projectId);
        
        const uploadData = await apiFetchMultipart('/upload-audio', formData);
        
        await apiFetch('/assets', {
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {entityType === 'character' && initialImageFile && initialImageFile.type.startsWith('audio/') ? 'Audio' : entityType}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {previewUrl && !initialImageFile?.type.startsWith('audio/') && (
            <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain rounded-md border" />
          )}
          
          {initialImageFile?.type.startsWith('audio/') && (
            <div className="text-center py-4">
              <div className="text-muted-foreground">Audio file selected:</div>
              <div className="font-mono text-sm">{initialImageFile.name}</div>
            </div>
          )}
          
          {!initialImageFile?.type.startsWith('audio/') && (
            <>
              <Input 
                placeholder="Name" 
                value={fields.name || ''} 
                onChange={(e) => setFields({ ...fields, name: e.target.value })} 
              />
              <Textarea 
                placeholder="Description" 
                value={fields.description || ''} 
                onChange={(e) => setFields({ ...fields, description: e.target.value })} 
              />
            </>
          )}
          
          {initialImageFile?.type.startsWith('audio/') && (
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
          
          <Button variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Auto-fill with AI"}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !fields.name}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}