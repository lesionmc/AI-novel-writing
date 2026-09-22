"""记忆与召回（memory / R3 / R4）模型。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CharacterUpdateItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    state: str
    reason: str | None = None
    accepted: bool = True


class PlotProgressItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    arc: str
    progress: str
    accepted: bool = True


class NewForeshadowItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    importance: str = "medium"
    accepted: bool = True


class WritebackSuggestion(BaseModel):
    """finalize 返回、用户可改、confirm 落库，三处共用同一结构。"""

    model_config = ConfigDict(extra="ignore")

    chapter_summary: str | None = None
    character_updates: list[CharacterUpdateItem] = Field(default_factory=list)
    plot_progress: list[PlotProgressItem] = Field(default_factory=list)
    new_foreshadows: list[NewForeshadowItem] = Field(default_factory=list)
    closed_foreshadow_ids: list[int] = Field(default_factory=list)
    hook: str | None = None
    raw_ai_output: str | None = None


class ConfirmResult(BaseModel):
    character_states_written: int = 0
    foreshadows_created: int = 0
    foreshadows_closed: int = 0
    chunks_indexed: int = 0
    plot_arcs_updated: int = 0


class RecallCharacter(BaseModel):
    character_id: int
    name: str
    role: str
    current_state: str | None = None
    last_seen_seq: int | None = None
    relation_notes: str | None = None


class RecallForeshadow(BaseModel):
    id: int
    title: str
    planted_seq: int | None = None
    importance: str
    age: int = 0


class RecallChunk(BaseModel):
    chunk_id: int
    chapter_seq: int | None = None
    text: str
    score: float = 0.0


class RecallBudget(BaseModel):
    injected_chars: int = 0
    injected_tokens_est: int = 0
    truncated: bool = False
    semantic_available: bool = False


class RecallResult(BaseModel):
    chapter_seq: int
    characters: list[RecallCharacter] = Field(default_factory=list)
    open_foreshadows: list[RecallForeshadow] = Field(default_factory=list)
    recalled_chunks: list[RecallChunk] = Field(default_factory=list)
    plot_arcs: list[dict] = Field(default_factory=list)
    budget: RecallBudget = Field(default_factory=RecallBudget)


class CharacterStateView(BaseModel):
    character_id: int
    name: str
    role: str
    chapter_seq: int
    state: str
    source: str


class RecallLogOut(BaseModel):
    id: int
    chapter_seq: int
    query_text: str | None = None
    structured_hits: int = 0
    semantic_hits: int = 0
    injected_chars: int = 0
    injected_tokens_est: int = 0
    created_at: str
