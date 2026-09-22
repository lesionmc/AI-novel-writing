"""应用配置加载（pydantic-settings）。

路径约定：项目根 = backend 目录的父目录，即 `ai-novel/`。
所有可调参数集中于此，禁止散落硬编码。
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AINOVEL_", env_file=".env", extra="ignore"
    )

    # 运行
    host: str = "127.0.0.1"
    port: int = 0  # 0 = 自动选择可用端口
    log_level: str = "INFO"

    # 路径
    project_root: Path = PROJECT_ROOT

    # 召回预算 / 语义检索参数（ADR-002）
    embedding_dim: int = 1024
    recall_budget_chars: int = 4000
    semantic_top_k: int = 5
    semantic_score_threshold: float = 0.6
    chunk_size: int = 800
    chunk_overlap: int = 100

    # 费用预估单价（元 / 千 token）。**仅为本地估算的示例值，非厂商账单**，
    # 真实价格随厂商调整，M2 需核对；provider 未列出时按 0 计。
    price_per_1k_cny: dict[str, float] = {
        "deepseek": 0.002,
        "qwen": 0.008,
        "kimi": 0.012,
        "claude": 0.02,
        "ollama": 0.0,
    }

    @property
    def books_dir(self) -> Path:
        return self.project_root / "books"

    @property
    def recycle_dir(self) -> Path:
        return self.project_root / ".recycle"

    @property
    def data_dir(self) -> Path:
        return self.project_root / "data"

    @property
    def frontend_dist(self) -> Path:
        return self.project_root / "frontend" / "dist"


settings = Settings()
