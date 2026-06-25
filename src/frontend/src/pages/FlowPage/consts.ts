import { cloneDeep } from "lodash";
import { DefaultEdge } from "@/CustomEdges";
import GenericNode from "@/CustomNodes/GenericNode";
import NoteNode from "@/CustomNodes/NoteNode";
import { useTypesStore } from "@/stores/typesStore";
import type { APIClassType, OutputFieldType } from "@/types/api";

export const IMAGE_NODE_OUTPUTS: OutputFieldType[] = [
  {
    display_name: "Image Data",
    name: "image_data",
    types: ["Data"],
    selected: "Data",
    method: "build_data",
    allows_loop: false,
  },
];

/**
 * Method that extracts sidebar drop logic.
 * Fetches the template master, deep clones it, and patches values.
 */
export const spawnImageNode = (
  fileInfo: { filePath: string; fileId: string; fileName?: string },
  position: { x: number; y: number },
  addComponent: Function,
) => {
  const templateName = "ImageLoader";
  const templates = useTypesStore.getState().templates;
  let baseTemplate: null | APIClassType = null;

  if (templates[templateName]) {
    baseTemplate = templates[templateName];
  }

  if (!baseTemplate) {
    console.error(
      `${templateName} template missing from registry. Ensure the Python backend is running and the component is loaded.`,
    );
    return;
  }

  const nodeData = cloneDeep(baseTemplate);
  console.log(
    `[DEBUG] ImageLoader template definition:`,
    JSON.stringify(nodeData.template.image_path),
  );
  if (nodeData.template.image_path) {
    nodeData.template.image_path.value = fileInfo.filePath;
    nodeData.template.image_path.show = true; // Force show
  } else {
    console.warn(
      `Input 'image_path' missing from ${templateName} template schema.`,
    );
  }

  if (nodeData.template.file_id) {
    nodeData.template.file_id.value = fileInfo.fileId;
  }

  addComponent(nodeData, "genericNode", position);
};

export function buildImageNodeClass({
  filePath,
  fileId,
  displayName = "Image",
  description,
}: {
  filePath: string;
  fileId: string;
  displayName?: string;
  description?: string;
}): APIClassType {
  return {
    display_name: displayName,
    documentation: "",
    icon: "Image",
    outputs: IMAGE_NODE_OUTPUTS,
    template: {
      image_path: {
        display_name: "",
        value: filePath,
        type: "str",
        required: false,
        list: false,
        show: true,
        readonly: true,
      },
      file_id: {
        value: fileId,
        type: "str",
        required: false,
        list: false,
        show: false,
        readonly: true,
      },
    },
  };
}

/**
 * Shared ReactFlow node/edge type registrations used by the main canvas
 * (PageComponent).
 */
export const nodeTypes = {
  genericNode: GenericNode,
  noteNode: NoteNode,
};

export const edgeTypes = {
  default: DefaultEdge,
};
