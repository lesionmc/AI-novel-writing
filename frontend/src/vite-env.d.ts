/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 开发环境后端代理目标（默认 http://127.0.0.1:8756） */
  readonly VITE_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
