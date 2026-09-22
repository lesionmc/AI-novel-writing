"""作品路由（R15）。只解析请求、调服务、组装响应。"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.models.book import BookBrief, BookCreate, BookOut, BookUpdate
from app.services import book_service

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("", response_model=list[BookBrief])
def list_books() -> list[BookBrief]:
    return book_service.list_books()


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate) -> BookOut:
    return book_service.create_book(payload)


@router.get("/{book}", response_model=BookOut)
def get_book(book: str) -> BookOut:
    return book_service.get_book(book)


@router.patch("/{book}", response_model=BookOut)
def update_book(book: str, payload: BookUpdate) -> BookOut:
    return book_service.update_book(book, payload)


@router.delete("/{book}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book: str) -> None:
    book_service.delete_book(book)
