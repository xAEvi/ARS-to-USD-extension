interface ImportMetaEnv {
  readonly VITE_DOLARAPI_URL?: string;
  readonly VITE_BLUELYTICS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
