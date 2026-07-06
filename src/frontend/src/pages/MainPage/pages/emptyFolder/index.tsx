import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { useFolderStore } from "@/stores/foldersStore";

type EmptyFolderProps = {
  setOpenModal: (open: boolean) => void;
  setOpenNewProjectModal?: (open: boolean) => void;
};

export const EmptyFolder = ({ setOpenModal, setOpenNewProjectModal }: EmptyFolderProps) => {
  const folders = useFolderStore((state) => state.folders);

  return (
    <div className="m-0 flex w-full justify-center">
      <div className="absolute top-1/2 flex w-full -translate-y-1/2 flex-col items-center justify-center gap-2">
        <h3
          className="pt-5 font-chivo text-2xl font-semibold"
          data-testid="mainpage_title"
        >
          {folders?.length > 1 ? "Empty project" : "Start building"}
        </h3>
        <p className="pb-5 text-sm text-secondary-foreground">
          Begin with a template, or start from scratch.
        </p>
        <Button
          variant="default"
          onClick={() => {
            // If no folders exist, open project modal first
            if (folders.length === 0 && setOpenNewProjectModal) {
              setOpenNewProjectModal(true);
            } else {
              setOpenModal(true);
            }
          }}
          id="new-project-btn"
          data-testid="new_project_btn_empty_page"
        >
          <ForwardedIconComponent
            name="plus"
            aria-hidden="true"
            className="h-4 w-4"
          />
          <span className="whitespace-nowrap font-semibold">New Flow</span>
        </Button>
      </div>
    </div>
  );
};

export default EmptyFolder;
