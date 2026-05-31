/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_IMAGE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Set true by the print route once fonts are ready + all images decoded.
   *  Polled by the headless Chromium screenshot job before capture. */
  __PRINT_READY__?: boolean;
}
