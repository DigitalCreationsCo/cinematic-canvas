// src/client/src/hooks/useImageFileDrop.ts
import { useCallback, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useNodeStore } from '#/store/useNodeStore.js';
import { useProjectStore } from '#/store/useProjectStore.js';
import { useAssetStore } from '#/store/useAssetStore.js';
import { NodeFactory } from '#/domain/canvas/NodeFactory.js';
import { screenToWorld } from '#/domain/canvas/CoordinateSystem.js';
import type { AssetHistory, AssetVersion } from '#/../../shared/types/assets.types.js';
import type { Location } from '#/../../shared/types/workflow.types.js';
import { LocationAttributes } from '#/../../shared/types/location.types.js';

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

  const createLocationFromImage = async (
    file: File,
    dataUrl: string,
    projectId: string
  ): Promise<{ location: Location; imageAsset: AssetHistory }> => {
    const locationId = uuidv7();
    const dimensions = await getImageDimensions(dataUrl);
    const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Imported Image';

    const locationAttributes = LocationAttributes.parse({
      referenceId: `imported_${locationId.slice(0, 8)}`,
      name: displayName,
      type: 'imported',
      mood: 'Imported',
      timeOfDay: 'Unspecified',
      weather: 'Unknown',
      colorPalette: [],
      architecture: [],
      naturalElements: [],
      manMadeObjects: [],
      groundSurface: '',
      skyOrCeiling: '',
      state: {
        mood: 'Imported',
        timeOfDay: 'Unspecified',
        weather: 'Unknown',
        precipitation: 'none',
        visibility: 'clear',
        lighting: {},
        groundCondition: { wetness: 'dry', debris: [], damage: [] },
        atmosphericEffects: [],
        season: 'unspecified',
        temperatureIndicators: [],
      },
    });

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

    const location: Location = {
      id: locationId,
      projectId,
      ...locationAttributes,
      referenceId: `imported_${locationId.slice(0, 8)}`,
      guidanceLevel: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return { location, imageAsset };
  };

  const handleImageFile = async (
    file: File,
    dropPosition: { x: number; y: number },
    projectId: string
  ): Promise<void> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_EXTENSIONS.includes(extension)) {
      console.warn('[useImageFileDrop] Unsupported file type:', file.name);
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const { location, imageAsset } = await createLocationFromImage(file, dataUrl, projectId);

    useProjectStore.getState().addLocation(location);
    useAssetStore.getState().mergeAssets(location.id, { location_image: imageAsset });

    const imageNode = NodeFactory.createNode({
      type: 'image',
      entityId: location.id,
      contextId: projectId,
      contextType: 'project',
      posCanvas: dropPosition,
      scope: 'project',
      nodeTypeFlag: 'import',
    });

    addNode(imageNode);

    console.debug('[useImageFileDrop] Created ImageNode:', {
      locationId: location.id,
      fileName: file.name,
      position: dropPosition,
    });
  };

  const handleFileDrop = useCallback(
    async (event: DragEvent, projectId: string): Promise<boolean> => {
      event.preventDefault();
      event.stopPropagation();

      const isFileDrag = event.dataTransfer?.types?.includes('Files');
      if (!isFileDrag) return false;

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;

      const imageFiles = Array.from(files).filter((file) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        return extension && SUPPORTED_EXTENSIONS.includes(extension);
      });

      if (imageFiles.length === 0) return false;

      let dropPosition: { x: number; y: number };

      if (wrapperRef.current) {
        const bounds = wrapperRef.current.getBoundingClientRect();
        dropPosition = screenToWorld(
          event.clientX - bounds.left,
          event.clientY - bounds.top,
          viewport
        );
      } else {
        dropPosition = screenToWorld(
          event.clientX || window.innerWidth / 2,
          event.clientY || window.innerHeight / 2,
          viewport
        );
      }

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

  return {
    setWrapperRef: externalRef ? undefined : setWrapperRef,
    handleFileDrop,
    handleImageFile,
    isSupportedExtension: (filename: string) => {
      const extension = filename.split('.').pop()?.toLowerCase();
      return extension ? SUPPORTED_EXTENSIONS.includes(extension) : false;
    },
    SUPPORTED_EXTENSIONS,
  };
}
