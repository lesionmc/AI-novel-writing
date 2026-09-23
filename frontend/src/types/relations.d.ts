/** API 契约 · 人物关系（关系图谱）。由 api.d.ts 统一再导出。 */

export interface CharacterRelation {
  id: number;
  from_char_id: number;
  from_name: string;
  to_char_id: number;
  to_name: string;
  relation_type: string;
  note: string | null;
}

/** `POST /api/books/{book}/character-relations` 请求体 */
export interface CharacterRelationInput {
  from_char_id: number;
  to_char_id: number;
  relation_type: string;
  note?: string | null;
}
