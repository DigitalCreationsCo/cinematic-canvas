interface DropFilesOverlayProps {
    isDraggingFileOverCanvas: boolean;
    draggedFileType?: 'image' | 'audio' | null;
}

export function DropFilesOverlay({ isDraggingFileOverCanvas, draggedFileType }: DropFilesOverlayProps) {
    if (!isDraggingFileOverCanvas) return null;

    const isAudio = draggedFileType === 'audio';
    const isImage = draggedFileType === 'image';

    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/50 text-white z-[99999] pointer-events-none border-2 border-white/20">
            <span className="text-2xl font-bold mb-2">
                {isAudio ? 'Drop audio files on canvas' : isImage ? 'Drop image files on canvas' : 'Drop files on canvas'}
            </span>
            <span className="text-sm text-gray-300">
                {isAudio 
                    ? 'Creates AudioNodes from .mp3, .wav, .ogg files'
                    : isImage 
                        ? 'Creates ImageNodes from .png, .jpg, .jpeg files'
                        : 'Creates nodes from dropped files'}
            </span>
        </div>
    );
}
