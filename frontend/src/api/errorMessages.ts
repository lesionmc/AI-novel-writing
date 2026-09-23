/**
 * 错误码 → 可读中文文案映射
 * -----------------------------------------------------------------------------
 * 依据 `04-界面设计说明.md` §6.2 + Spec §10「错误文案」。
 * 铁律：**绝不把技术错误原文（堆栈 / HTTP 状态码）直接丢给用户**。
 * 未命中的 code 统一兜底为通用可读文案，原始 code 仅保留在控制台。
 */

export const ERROR_MESSAGES: Record<string, string> = {
  // --- AI / 模型（R5 / 04 §6.2） ---
  // P2-10：指向具体位置，且与全项目统一指向「模型配置处」的口径一致
  LLM_NOT_CONFIGURED: '还没有配置 AI 模型，去「设置 · 已配置的模型」里添加一个吧',
  LLM_AUTH_FAILED: '模型的密钥好像不对，检查一下密钥有没有填错',
  LLM_RATE_LIMITED: '模型调用太频繁了，等一会儿再试',
  LLM_TIMEOUT: '模型响应超时了，可能是网络问题，请重试',
  LLM_UNAVAILABLE: '模型服务暂时连不上，检查一下网络或端点地址',
  LLM_RESPONSE_INVALID: 'AI 这次返回的格式不对，已保留原始输出供你查看',
  JSON_PARSE_FAILED: 'AI 这次返回的格式不对，已保留原始输出供你查看',
  // discover-models / 拉取模型等上游 502：后端 code=LLM_REQUEST_FAILED
  LLM_REQUEST_FAILED: '模型请求失败，请检查密钥、模型名与接入地址后重试',
  // 密钥环不可用（数据库里没存明文，密钥写不进去）
  SECRET_STORE_UNAVAILABLE: '系统密钥环打不开，密钥没能保存，请检查系统凭据服务',

  // --- 作品 / 章节 ---
  NO_ACTIVE_BOOK: '还没有打开的作品，先回书库选一本',
  BOOK_NOT_FOUND: '这部作品不存在，可能已被移入回收目录',
  BOOK_EXISTS: '已经有一部同名作品了，换个书名试试',
  BOOK_ALREADY_EXISTS: '已经有一部同名作品了，换个书名试试',
  BOOK_SLUG_INVALID: '书名无法转换成合法的目录名，请换一个书名',
  CHAPTER_NOT_FOUND: '章节不存在，可能已被删除',
  CHAPTER_SEQ_DUPLICATED: '这个章节序号已经被占用了',
  VERSION_NOT_FOUND: '这个版本不存在，刷新后再试',
  OUTLINE_NOT_FOUND: '这个大纲节点不存在',
  CHARACTER_NOT_FOUND: '这个人物不存在',
  WORLD_ENTRY_NOT_FOUND: '这个世界词条不存在',
  FORESHADOW_NOT_FOUND: '这条线索不存在',
  PROVIDER_NOT_FOUND: '这个模型配置不存在',

  // --- 校验 / 冲突 ---
  VALIDATION_ERROR: '填写的内容有误，请检查标红的字段',
  CONFLICT: '数据已被修改，请刷新后重试',
  NOT_FOUND: '请求的资源不存在',
  INTERNAL_ERROR: '服务出了点问题，请重试；若持续出现请查看启动日志',

  // --- 存储能力降级（红线 3：不得阻断） ---
  VECTOR_UNAVAILABLE: '联想搜索暂时用不了，人物状态与线索仍会正常显示',
  FTS_UNAVAILABLE: '关键词搜索暂时用不了，其余功能正常',
  EMBEDDING_MODEL_MISMATCH: '换了「记住全文」用的模型，需要重建一次索引才能恢复联想搜索',

  // --- 网络 ---
  NETWORK_ERROR: '连不上本地服务，请确认程序仍在运行',
  TIMEOUT_ERROR: '请求超时了，请重试',
};

const FALLBACK = '操作没有成功，请重试';

/** 把后端 error.code 转成用户可读文案（永不返回技术原文） */
export function messageForCode(code: string | undefined | null): string {
  if (!code) return FALLBACK;
  return ERROR_MESSAGES[code] ?? FALLBACK;
}
