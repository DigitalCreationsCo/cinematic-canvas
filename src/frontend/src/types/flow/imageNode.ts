import type { Node } from "@xyflow/react";

export type ImageNodeDataType = {
  showNode?: boolean;
  type: "imageNode";
  node: {
    file_id: string;
    file_path: string;
    file_name: string;
  };
  id: string;
};

export type ImageNodeType = Node<ImageNodeDataType, "imageNode">;
