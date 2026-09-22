/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 开发环境后端代理目标（默认 http://127.0.0.1:8756） */
  readonly VITE_API_TARGET?: string;
  /** 设为 'true' 时启用 MSW Mock（默认关闭，走真实后端） */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
