/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PROJECT_ID: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_STOCKFISH_WASM_URL: string;
  readonly VITE_PREMIUM_NNUE: string;
  readonly VITE_LOVABLE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
