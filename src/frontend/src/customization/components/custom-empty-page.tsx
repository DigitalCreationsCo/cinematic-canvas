import { EmptyPageCommunity } from "@/pages/MainPage/pages/empty-page";

export const CustomEmptyPageCommunity = ({
  setOpenModal,
  setOpenNewProjectModal,
}: {
  setOpenModal: (open: boolean) => void;
  setOpenNewProjectModal?: (open: boolean) => void;
}) => {
  return (
    <EmptyPageCommunity
      setOpenModal={setOpenModal}
      setOpenNewProjectModal={setOpenNewProjectModal}
    />
  );
};
export default CustomEmptyPageCommunity;
