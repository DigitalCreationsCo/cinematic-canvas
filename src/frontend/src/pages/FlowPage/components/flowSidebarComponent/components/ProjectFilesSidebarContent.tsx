import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import {
  getFilePreviewUrl,
  isImageFile,
} from "@/components/core/playgroundComponent/chat-view/utils/file-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Loading from "@/components/ui/loading";

// Drag MIME type for image file drags from the project-files sidebar.
// Kept separate from DRAG_EVENTS_CUSTOM_TYPESS so that the canvas onDrop
// handler can distinguish image-file drags from standard component drags
// (which go through addComponent).
// NOTE: browsers lowercase custom MIME types in dataTransfer.types, so we use
// the lowercase form. setData/getData are case-insensitive.
const IMAGE_DRAG_MIME_TYPE = "imagenode";

import { useGetFilesV2 } from "@/controllers/API/queries/file-management";
import { usePostRenameFileV2 } from "@/controllers/API/queries/file-management/use-put-rename-file";
import useUploadFile from "@/hooks/files/use-upload-file";
import FilesContextMenuComponent from "@/modals/fileManagerModal/components/filesContextMenuComponent";
import useAlertStore from "@/stores/alertStore";
import type { FileType } from "@/types/file_management";
import { formatFileSize } from "@/utils/stringManipulation";
import { FILE_ICONS } from "@/utils/styleUtils";
import { cn } from "@/utils/utils";

interface ProjectFilesSidebarContentProps {
  folderId?: string;
}

const getFileExtension = (file: FileType) =>
  file.path.split(".").pop()?.toLowerCase() ?? "";

const getDisplayName = (file: FileType) => {
  const extension = getFileExtension(file);
  return extension ? `${file.name}.${extension}` : file.name;
};

export default function ProjectFilesSidebarContent({
  folderId,
}: ProjectFilesSidebarContentProps) {
  const [search, setSearch] = useState("");
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);

  const { t } = useTranslation();

  const { data: files, isLoading } = useGetFilesV2(
    folderId ? { folderId } : undefined,
    { enabled: !!folderId },
  );
  const uploadFile = useUploadFile({ multiple: true, folderId });
  const { mutate: renameFile } = usePostRenameFileV2();

  const filteredFiles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const scopedFiles = files ?? [];
    const filtered = normalizedSearch
      ? scopedFiles.filter((file) =>
          getDisplayName(file).toLowerCase().includes(normalizedSearch),
        )
      : scopedFiles;

    return [...filtered].sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at).getTime() -
        new Date(a.updated_at ?? a.created_at).getTime(),
    );
  }, [files, search]);

  const handleUpload = async (droppedFiles?: File[]) => {
    try {
      const uploadedFiles = await uploadFile({ files: droppedFiles });
      setSuccessData({
        title: `File${uploadedFiles.length > 1 ? "s" : ""} uploaded successfully`,
      });
    } catch (error) {
      setErrorData({
        title: "Error uploading file",
        list: [
          (error as Error).message ||
            "An error occurred while uploading the file",
        ],
      });
    }
  };

  const startRename = (id: string, name: string) => {
    setEditingFileId(id);
    setEditingName(name);
  };

  const commitRename = (file: FileType) => {
    const trimmedName = editingName.trim();
    if (!trimmedName || trimmedName === file.name) {
      setEditingFileId(null);
      return;
    }

    // Strip any known file extension from the submitted name to prevent
    // the extension being doubled (the display always appends the extension).
    const extension = getFileExtension(file);
    const nameWithoutExt =
      extension && trimmedName.endsWith(`.${extension}`)
        ? trimmedName.slice(0, -(extension.length + 1))
        : trimmedName;

    renameFile({
      id: file.id,
      name: nameWithoutExt,
      folderId: file.folder_id ?? folderId,
    });
    setEditingFileId(null);
  };

  if (!folderId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
        <ForwardedIconComponent name="Folder" className="h-8 w-8" />
        Open a project flow to view project files.
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      data-testid="project-files-sidebar"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const droppedFiles = Array.from(event.dataTransfer.files);
        if (droppedFiles.length > 0) {
          void handleUpload(droppedFiles);
        }
      }}
    >
      <div className="border-b p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ForwardedIconComponent name="File" className="h-4 w-4" />
            Files
          </div>
          <ShadTooltip content="Upload files" side="bottom">
            <Button
              size="iconSm"
              onClick={() => void handleUpload()}
              data-testid="flow-sidebar-upload-file-btn"
            >
              <ForwardedIconComponent name="Plus" className="h-4 w-4" />
            </Button>
          </ShadTooltip>
        </div>
        <Input
          icon="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search project files..."
          data-testid="flow-sidebar-files-search"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loading />
          </div>
        ) : filteredFiles.length > 0 ? (
          <div className="flex flex-col gap-1">
            {filteredFiles.map((file) => {
              const extension = getFileExtension(file);
              const icon = FILE_ICONS[extension]?.icon ?? "File";
              const iconColor = FILE_ICONS[extension]?.color ?? undefined;
              const isEditing = editingFileId === file.id;

              const isImage = isImageFile(file);
              const handleDragStart = (e: React.DragEvent) => {
                // Set the custom MIME type data first (most important)
                const dragPayload = JSON.stringify({
                  fileId: file.id,
                  filePath: file.path,
                  fileName: getDisplayName(file),
                });
                e.dataTransfer.setData(IMAGE_DRAG_MIME_TYPE, dragPayload);
                // Also set text/plain as fallback for browser compatibility
                try {
                  e.dataTransfer.setData("text/plain", dragPayload);
                } catch {
                  // non-critical fallback
                }
                e.dataTransfer.effectAllowed = "move";

                // Create a clone for the drag image similar to other sidebar draggables
                try {
                  const crt = (e.currentTarget as HTMLElement).cloneNode(
                    true,
                  ) as HTMLElement;
                  crt.style.position = "absolute";
                  crt.style.width = "215px";
                  crt.style.top = "-500px";
                  crt.style.right = "-500px";
                  crt.classList.add("cursor-grabbing");
                  document.body.appendChild(crt);
                  e.dataTransfer.setDragImage(crt, 0, 0);
                } catch (err) {
                  // Drag image clone is non-critical
                }
              };

              const handleDragEnd = () => {
                const elements =
                  document.getElementsByClassName("cursor-grabbing");
                while (elements.length > 0) {
                  try {
                    document.body.removeChild(elements[0]);
                  } catch {
                    break;
                  }
                }
              };

              return (
                <div
                  key={file.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent",
                    isImage && "cursor-grab active:cursor-grabbing",
                  )}
                  draggable={isImage}
                  onDragStart={isImage ? handleDragStart : undefined}
                  onDragEnd={isImage ? handleDragEnd : undefined}
                >
                  {isImage && file.id ? (
                    <img
                      src={
                        getFilePreviewUrl({
                          path: file.path,
                          file_id: file.id,
                        }) ?? undefined
                      }
                      alt={getDisplayName(file)}
                      className="h-8 w-8 shrink-0 rounded object-cover"
                      onError={(e) => {
                        // Fallback: hide broken image, show generic icon behind
                        (e.target as HTMLImageElement).style.display = "none";
                        const parent = (e.target as HTMLImageElement)
                          .parentElement;
                        const iconEl = parent?.querySelector(
                          ".file-icon-fallback",
                        );
                        if (iconEl) {
                          iconEl.classList.remove("hidden");
                        }
                      }}
                    />
                  ) : null}
                  <ForwardedIconComponent
                    name={icon}
                    className={cn(
                      "h-4 w-4 shrink-0",
                      iconColor,
                      isImage && file.id ? "file-icon-fallback hidden" : "",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editingName}
                        className="h-7"
                        onChange={(event) => setEditingName(event.target.value)}
                        onBlur={() => commitRename(file)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitRename(file);
                          }
                          if (event.key === "Escape") {
                            setEditingFileId(null);
                          }
                        }}
                      />
                    ) : (
                      <>
                        <div
                          className="truncate font-medium"
                          title={getDisplayName(file)}
                        >
                          {getDisplayName(file)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </div>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <FilesContextMenuComponent
                      file={file}
                      handleRename={startRename}
                    >
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <ForwardedIconComponent
                          name="EllipsisVertical"
                          className="h-4 w-4"
                        />
                      </Button>
                    </FilesContextMenuComponent>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
            <div>
              <div className="font-medium text-foreground">
                {t("sidebar.noProjectFiles")}
              </div>
              <div>{t("input.upload")}</div>
            </div>
            <Button size="sm" onClick={() => void handleUpload()}>
              <ForwardedIconComponent name="Plus" className="h-4 w-4" />
              {t("input.uploadFilesTitle")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
