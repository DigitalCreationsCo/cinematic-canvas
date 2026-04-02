import { useCallback, useRef } from 'react';
import { generateId } from "#shared/utils/id.js";
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { NodeFactory } from '#client/domain/canvas/NodeFactory.js';
import { screenToWorld } from '#client/domain/canvas/CoordinateSystem.js';

const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
const STAGGER_OFFSET = 80;

export function useAudioFileDrop(externalRef?: React.RefObject<HTMLDivElement | null>) {
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

  const handleAudioFile = async (
    file: File,
    dropPosition: { x: number; y: number },
    projectId: string
  ): Promise<void> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_EXTENSIONS.includes(extension)) {
      console.warn('[useAudioFileDrop] Unsupported audio file type:', file.name);
      return;
    }

    const audioId = generateId();
    const dataUrl = await readFileAsDataUrl(file);
    const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Imported Audio';

    useProjectStore.getState().updateMetadata({
      audioPublicUri: dataUrl,
      audioGcsUri: undefined,
      hasAudio: true,
    });

    const audioNode = NodeFactory.createNode({
      type: 'audio',
      entityId: audioId,
      contextId: projectId,
      contextType: 'project',
      posCanvas: dropPosition,
      scope: 'project',
      nodeTypeFlag: 'import',
      width: 320,
      height: 150,
    });
    audioNode.data.audioSrc = dataUrl;
    audioNode.data.audioFileName = displayName;
    audioNode.data.audioTitle = displayName;

    addNode(audioNode);

    console.debug('[useAudioFileDrop] Created AudioNode:', {
      audioId,
      fileName: file.name,
      position: dropPosition,
    });
  };

  const handleFileDrop = useCallback(
    async (event: DragEvent, projectId: string): Promise<boolean> => {
      event.preventDefault();
      event.stopPropagation();

      const isFileDrag = event.dataTransfer?.types?.includes('Files');
      if (!isFileDrag) {
        console.debug('[useAudioFileDrop] Not a file drag');
        return false;
      }

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) {
        console.debug('[useAudioFileDrop] No files in drop');
        return false;
      }

      const audioFiles = Array.from(files).filter((file) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        return extension && SUPPORTED_EXTENSIONS.includes(extension);
      });

      console.debug('[useAudioFileDrop] Found audio files:', audioFiles.length);

      if (audioFiles.length === 0) return false;

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

      for (let i = 0; i < audioFiles.length; i++) {
        const staggeredPosition = {
          x: dropPosition.x + i * STAGGER_OFFSET,
          y: dropPosition.y + i * STAGGER_OFFSET,
        };
        await handleAudioFile(audioFiles[i], staggeredPosition, projectId);
      }

      return true;
    },
    [viewport, addNode, handleAudioFile]
  );

  const isSupportedExtension = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? SUPPORTED_EXTENSIONS.includes(extension) : false;
  };

  const isAudioFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? SUPPORTED_EXTENSIONS.includes(extension) : false;
  };

  return {
    setWrapperRef: externalRef ? undefined : setWrapperRef,
    handleFileDrop,
    handleAudioFile,
    isSupportedExtension,
    isAudioFile,
    SUPPORTED_EXTENSIONS,
  };
}
