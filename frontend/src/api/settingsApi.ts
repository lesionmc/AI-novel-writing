/**
 * 设定库扩展端点（人物关系图谱）。
 * 单独文件与 `aiHubApi`/`writingApi` 同一动机：守住 client.ts 的行数门禁，
 * 对外仍并入同一个 `api` 对象。
 */

import { slugSegment } from '@/lib/slug';
import { request } from './request';
import type { CharacterRelation, CharacterRelationInput } from '@/types/api';

export const settingsApi = {
  listCharacterRelations: (book: string) =>
    request<CharacterRelation[]>(`/books/${slugSegment(book)}/character-relations`),
  createCharacterRelation: (book: string, payload: CharacterRelationInput) =>
    request<CharacterRelation>(`/books/${slugSegment(book)}/character-relations`, {
      method: 'POST',
      body: payload,
    }),
  deleteCharacterRelation: (book: string, id: number) =>
    request<void>(`/books/${slugSegment(book)}/character-relations/${id}`, { method: 'DELETE' }),
};
