import * as Dialog from "@radix-ui/react-dialog";
import { saveAs } from "file-saver";
import OpenSeadragon from "openseadragon";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useAlertStore from "../../../stores/alertStore";
import { Button } from "../../ui/button";
import { Separator } from "../../ui/separator";
import ForwardedIconComponent from "../genericIconComponent";

interface ImageViewerProps {
  image?: string; // Kept for backward compatibility
  imageView?: {
    type: "single" | "group";
    images: {
      url: string;
      file_id?: string;
      file_name?: string;
      caption?: string;
    }[];
    current: number;
  };
}

export default function ImageViewer({ image, imageView }: ImageViewerProps) {
  const { t } = useTranslation();
  const viewerRef = useRef(null);
  const setErrorList = useAlertStore((state) => state.setErrorData);

  const currentView = imageView ?? {
    type: "single",
    images: image ? [{ url: image }] : [],
    current: 0,
  };

  const [currentIndex, setCurrentIndex] = useState(currentView.current);
  const currentImage = currentView.images[currentIndex];

  useEffect(() => {
    try {
      if (viewerRef.current && currentImage) {
        const viewer = OpenSeadragon({
          element: viewerRef.current,
          prefixUrl:
            "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
          tileSources: { type: "image", url: currentImage.url },
          defaultZoomLevel: 1,
          maxZoomPixelRatio: 4,
          showNavigationControl: false,
        });

        // Setup custom controls
        const zoomInButton = document.getElementById("zoom-in-button");
        const zoomOutButton = document.getElementById("zoom-out-button");
        const homeButton = document.getElementById("home-button");
        const fullPageButton = document.getElementById("full-page-button");

        const handlers = {
          zoomIn: () => viewer.viewport.zoomBy(1.2),
          zoomOut: () => viewer.viewport.zoomBy(0.8),
          home: () => viewer.viewport.goHome(),
          fullPage: () => viewer.setFullScreen(true),
        };

        zoomInButton?.addEventListener("click", handlers.zoomIn);
        zoomOutButton?.addEventListener("click", handlers.zoomOut);
        homeButton?.addEventListener("click", handlers.home);
        fullPageButton?.addEventListener("click", handlers.fullPage);

        return () => {
          viewer.destroy();
          zoomInButton?.removeEventListener("click", handlers.zoomIn);
          zoomOutButton?.removeEventListener("click", handlers.zoomOut);
          homeButton?.removeEventListener("click", handlers.home);
          fullPageButton?.removeEventListener("click", handlers.fullPage);
        };
      }
    } catch (error) {
      console.error("Error initializing OpenSeadragon:", error);
    }
  }, [currentImage?.url]);

  function download(url: string) {
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => {
        saveAs(blob, currentImage?.file_name || "image.jpg");
      })
      .catch((error) => {
        setErrorList({ title: "There was an error downloading your image" });
        console.error("Error downloading image:", error);
      });
  }

  const navigate = (direction: number) => {
    setCurrentIndex(
      (prev) =>
        (prev + direction + currentView.images.length) %
        currentView.images.length,
    );
  };

  if (!currentImage) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-5 rounded-md border border-border bg-muted">
        <ForwardedIconComponent name="Image" />
        {t("output.imgError")}
      </div>
    );
  }

  return (
    <Dialog.Root>
      <div className="flex flex-col items-center gap-2">
        {/* Main View */}
        <div
          className="relative h-[300px] w-full cursor-pointer overflow-hidden rounded-md border"
          onClick={() => document.getElementById("expand-trigger")?.click()}
        >
          <img
            src={currentImage.url}
            className="h-full w-full object-contain"
            alt={currentImage.caption || "Image"}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
            <ForwardedIconComponent
              name="Maximize"
              className="text-white h-10 w-10"
            />
          </div>
        </div>

        {/* Group Navigation */}
        {currentView.type === "group" && currentView.images.length > 1 && (
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => navigate(-1)}>
              <ForwardedIconComponent name="ChevronLeft" />
            </Button>
            <span>
              {currentIndex + 1} / {currentView.images.length}
            </span>
            <Button size="icon" variant="outline" onClick={() => navigate(1)}>
              <ForwardedIconComponent name="ChevronRight" />
            </Button>
          </div>
        )}

        {/* Modal/Expanded View */}
        <Dialog.Trigger asChild>
          <button id="expand-trigger" className="hidden" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[90vw] h-[90vh] -translate-x-1/2 -translate-y-1/2 bg-background p-4 rounded-lg z-50 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">{currentImage.caption}</h2>
              <Dialog.Close asChild>
                <Button variant="ghost">Close</Button>
              </Dialog.Close>
            </div>

            <div className="flex-1 relative">
              <div id="canvas" ref={viewerRef} className="h-full w-full" />

              {/* Controls inside modal */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-background/80 p-2 rounded-full">
                <Button id="zoom-in-button" size="icon" variant="ghost">
                  <ForwardedIconComponent name="ZoomIn" />
                </Button>
                <Button id="zoom-out-button" size="icon" variant="ghost">
                  <ForwardedIconComponent name="ZoomOut" />
                </Button>
                <Button id="home-button" size="icon" variant="ghost">
                  <ForwardedIconComponent name="RotateCcw" />
                </Button>
                <Button id="full-page-button" size="icon" variant="ghost">
                  <ForwardedIconComponent name="Maximize2" />
                </Button>
                <Button
                  onClick={() => download(currentImage.url)}
                  size="icon"
                  variant="ghost"
                >
                  <ForwardedIconComponent name="ArrowDownToLine" />
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </div>
    </Dialog.Root>
  );
}
