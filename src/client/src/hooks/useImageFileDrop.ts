import { useCallback, useRef } from 'react';
import { generateId } from "#shared/utils/id.js";
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useAssetStore } from '#client/store/useAssetStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { apiFetch, apiFetchMultipart } from '#client/lib/api.js';
import { api } from '#client/lib/routes.js';
import { NodeFactory } from '#client/domain/canvas/NodeFactory.js';
import { screenToWorld } from '#client/domain/canvas/CoordinateSystem.js';
import type { AssetHistory, AssetVersion } from '#client/../../shared/types/assets.types.js';

const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg'];
const STAGGER_OFFSET = 80;

export function useImageFileDrop(externalRef?: React.RefObject<HTMLDivElement | null>) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = externalRef || internalRef;
  const addNode = useNodeStore((s) => s.addNode);
  const viewport = useNodeStore((s) => s.viewport);

  const setWrapperRef = useCallback((el: HTMLDivElement | null) => {
    internalRef.current = el;
  }, []);

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUrl;
    });
  };

  const handleImageFile = async (
    file: File,
    dropPosition: { x: number; y: number },
    projectId: string,
    entityType?: 'character' | 'location'
  ): Promise<{ nodeId: string; entityId?: string }> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_EXTENSIONS.includes(extension)) {
      console.warn('[useImageFileDrop] Unsupported file type:', file.name);
      return { nodeId: '' };
    }

    // If entityType is provided, create entity in DB
    if (entityType === 'character' || entityType === 'location') {
      try {
        // Upload image to GCS
        const formData = new FormData();
        formData.append('image', file);
        formData.append('projectId', projectId);
        const uploadData = await apiFetchMultipart(api.assets.uploadImage(), formData);

        // Prepare entity data
        const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const entityData = {
          name: displayName,
          referenceId: displayName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          ...(entityType === 'character' ? {
            aliases: [],
            physicalTraits: {},
            state: {}
          } : {
            timeOfDay: 'day',
            weather: 'clear'
          })
        };

        // Create entity in DB
        const { entities } = await apiFetch(api.entities.list(), {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            inserts: [{
              entityType,
              data: entityData
            }]
          })
        });

        const newEntity = entities[0];

        // Add to project store
        const projectStore = useProjectStore.getState();
        if (entityType === 'character') {
          projectStore.addCharacter(newEntity);
        } else {
          projectStore.addLocation(newEntity);
        }

        // Create canvas node with entity type
        const canvasNode = NodeFactory.createNode({
          type: entityType,
          entityId: newEntity.id,
          contextId: projectId,
          contextType: 'project',
          posCanvas: dropPosition,
          scope: 'project',
          nodeTypeFlag: 'import',
          label: displayName,
        });

        addNode(canvasNode);

        // Attach asset
        await apiFetch(api.assets.list(), {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            entityId: newEntity.id,
            entityType,
            assetKey: entityType === 'character' ? 'character_image' : 'location_image',
            url: uploadData.imagePublicUri
          })
        });

        console.debug('[useImageFileDrop] Created entity:', {
          entityType,
          entityId: newEntity.id,
          fileName: file.name,
        });

        return { nodeId: canvasNode.id, entityId: newEntity.id };
      } catch (error) {
        console.error('[useImageFileDrop] Entity creation failed:', error);
        return { nodeId: '' };
      }
    }

    // Default behavior: create IMAGE node with dataUrl
    const dataUrl = await readFileAsDataUrl(file);
    const dimensions = await getImageDimensions(dataUrl);

    const imageId = generateId();
    const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Imported Image';

    const assetVersion: AssetVersion = {
      version: 1,
      data: dataUrl,
      type: 'image',
      metadata: { width: dimensions.width, height: dimensions.height },
      createdAt: new Date(),
      startedAt: new Date(),
    };

    const imageAsset: AssetHistory = {
      head: 1,
      best: 1,
      versions: [assetVersion],
    };

    console.debug('[useImageFileDrop] Storing asset:', { imageId, assetKey: 'image_file', hasData: !!dataUrl });
    useAssetStore.getState().setAssets(imageId, { image_file: imageAsset });

    const storedAssets = useAssetStore.getState().assets.get(imageId);
    console.debug('[useImageFileDrop] Stored assets verification:', {
      imageId,
      stored: !!storedAssets,
      hasImageFile: !!storedAssets?.image_file,
      versionsCount: storedAssets?.image_file?.versions?.length
    });

    const imageNode = NodeFactory.createNode({
      type: 'image',
      entityId: imageId,
      contextId: projectId,
      contextType: 'project',
      posCanvas: dropPosition,
      scope: 'project',
      nodeTypeFlag: 'import',
      label: displayName,
    });

    addNode(imageNode);

    console.debug('[useImageFileDrop] Created ImageNode:', {
      imageId,
      fileName: file.name,
      position: dropPosition,
      hasDataUrl: !!dataUrl,
    });

    return { nodeId: imageNode.id };
  };

  const handleFileDrop = useCallback(
    async (event: DragEvent, projectId: string): Promise<boolean> => {
      event.preventDefault();
      event.stopPropagation();

      console.debug('[useImageFileDrop] handleFileDrop called', {
        hasFiles: event.dataTransfer?.files?.length,
        clientX: event.clientX,
        clientY: event.clientY,
        wrapperRefExists: !!wrapperRef.current,
      });

      const isFileDrag = event.dataTransfer?.types?.includes('Files');
      if (!isFileDrag) {
        console.debug('[useImageFileDrop] Not a file drag');
        return false;
      }

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) {
        console.debug('[useImageFileDrop] No files in drop');
        return false;
      }

      const imageFiles = Array.from(files).filter((file) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        return extension && SUPPORTED_EXTENSIONS.includes(extension);
      });

      console.debug('[useImageFileDrop] Found image files:', imageFiles.length);

      if (imageFiles.length === 0) return false;

      let dropPosition: { x: number; y: number };

      if (wrapperRef.current) {
        const bounds = wrapperRef.current.getBoundingClientRect();
        console.debug('[useImageFileDrop] Using wrapper bounds:', bounds);
        dropPosition = screenToWorld(
          event.clientX - bounds.left,
          event.clientY - bounds.top,
          viewport
        );
      } else {
        console.debug('[useImageFileDrop] No wrapper ref, using fallback position');
        dropPosition = screenToWorld(
          event.clientX || window.innerWidth / 2,
          event.clientY || window.innerHeight / 2,
          viewport
        );
      }

      console.debug('[useImageFileDrop] Final drop position:', dropPosition);

      for (let i = 0; i < imageFiles.length; i++) {
        const staggeredPosition = {
          x: dropPosition.x + i * STAGGER_OFFSET,
          y: dropPosition.y + i * STAGGER_OFFSET,
        };
        await handleImageFile(imageFiles[i], staggeredPosition, projectId);
      }

      return true;
    },
    [viewport, addNode, handleImageFile]
  );

  const isSupportedExtension = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? SUPPORTED_EXTENSIONS.includes(extension) : false;
  };

  return {
    setWrapperRef: externalRef ? undefined : setWrapperRef,
    handleFileDrop,
    handleImageFile,
    isSupportedExtension,
    SUPPORTED_EXTENSIONS,
  };
}
