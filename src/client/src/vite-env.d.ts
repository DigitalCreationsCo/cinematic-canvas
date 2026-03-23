/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_CLOUD_NODE_SYNC?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
