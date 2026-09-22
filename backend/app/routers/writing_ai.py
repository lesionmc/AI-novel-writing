"""正文辅助 AI 路由（R20：剧情走向 / 校对 / 续写 / 扩写）。

只解析请求、调服务、组装响应 —— 业务逻辑全在 `services/writing_ai_service.py`。
**这四个端点都没有落库副作用**（红线见该服务文件头）：
续写 / 扩写产出的是草稿，由前端放进编辑器、作者自己删改后再生效。

路径参数统一用 `{chapter_id}`（**新端点不再沿用契约里 `{id}` 的写法** ——
那是 16 个历史端点的遗留不一致，见 `docs/开发导览` 第 6 条铁律的说明；
新代码不该继续扩散这个问题）。
"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.writing_ai import (
    ContinueRequest,
    DraftTextResponse,
    ExpandRequest,
    PlotDirectionsRequest,
    PlotDirectionsResponse,
    ProofreadRequest,
    ProofreadResponse,
)
from app.services import writing_ai_service

router = APIRouter(tags=["writing"])


@router.post(
    "/api/chapters/{chapter_id}/plot-directions",
    response_model=PlotDirectionsResponse,
)
def plot_directions(
    chapter_id: int, payload: PlotDirectionsRequest | None = None
) -> PlotDirectionsResponse:
    """给几条可选剧情走向。**不产出正文。**"""
    return writing_ai_service.plot_directions(chapter_id, payload or PlotDirectionsRequest())


@router.post("/api/chapters/{chapter_id}/proofread", response_model=ProofreadResponse)
def proofread(chapter_id: int, payload: ProofreadRequest | None = None) -> ProofreadResponse:
    """挑错 + 给修改建议。**只报问题，不返回改写后的正文。**"""
    return writing_ai_service.proofread(chapter_id, payload or ProofreadRequest())


@router.post("/api/chapters/{chapter_id}/continue", response_model=DraftTextResponse)
def continue_writing(
    chapter_id: int, payload: ContinueRequest | None = None
) -> DraftTextResponse:
    """续写草稿。**不写库** —— 由前端插入编辑器，作者自己删改。"""
    return writing_ai_service.continue_writing(chapter_id, payload or ContinueRequest())


@router.post("/api/chapters/{chapter_id}/expand", response_model=DraftTextResponse)
def expand(chapter_id: int, payload: ExpandRequest) -> DraftTextResponse:
    """扩写草稿（必须有选中文本）。**不写库。**"""
    return writing_ai_service.expand(chapter_id, payload)
