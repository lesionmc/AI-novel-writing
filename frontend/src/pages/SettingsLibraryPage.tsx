import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { BookContext } from '@/types/api';
import { useBook, useCharacters, useForeshadows, useWorldEntries } from '@/hooks/queries';
import { useCapabilities } from '@/hooks/useCapabilities';
import { Button } from '@/components/common/Button';
import { EntryBanner } from '@/components/common/EntryBanner';
import { Tabs } from '@/components/settings/Tabs';
import type { TabItem } from '@/components/settings/Tabs';
import { CharactersTab } from '@/components/settings/CharactersTab';
import { WorldEntriesTab } from '@/components/settings/WorldEntriesTab';
import { ForeshadowTable } from '@/components/settings/ForeshadowTable';
import { SetupChatDialog } from '@/components/ai/SetupChatDialog';
import { toast } from '@/stores/toastStore';
import styles from './SettingsLibraryPage.module.css';

type TabKey = 'characters' | 'world' | 'foreshadows';

const TAB_KEYS: TabKey[] = ['characters', 'world', 'foreshadows'];

function parseTab(raw: string | null): TabKey {
  return raw && (TAB_KEYS as string[]).includes(raw) ? (raw as TabKey) : 'characters';
}

/**
 * 设定库 `/book/:slug/settings`（R1）。
 * 三 Tab（人物卡 / 世界词条 / 待回收的线索），Tab 状态入 URL query 便于深链
 * （写作台「查看完整档案」会带 `?tab=characters&highlight=<名>` 跳进来；
 *  写作台 AI 菜单会带 `?ai=1` 跳进来并直接打开对话）。
 * 全本地 CRUD，无 AI 依赖 —— 未配模型时依然完整可用（红线 3）；
 * 顶部另有「跟 AI 聊聊」入口（AI 只出草稿，确认后才写入）。
 */
export function SettingsLibraryPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const active = parseTab(searchParams.get('tab'));
  const highlight = searchParams.get('highlight') ?? undefined;

  const bookQuery = useBook(slug);
  const characters = useCharacters(slug);
  const worldEntries = useWorldEntries(slug);
  const foreshadows = useForeshadows(slug);
  const capabilities = useCapabilities();

  /** AI 对话式建设定：每次打开换 key → 重挂载，清空上一轮对话。
   *  `?ai=1`（写作台 AI 菜单带过来）时直接打开 —— 初值即可，不必 effect。 */
  const [chatOpen, setChatOpen] = useState(searchParams.get('ai') === '1');
  const [chatKey, setChatKey] = useState(0);

  const noModel = capabilities.data?.llm_configured === false;
  const charCount = characters.data?.length ?? 0;
  const worldCount = worldEntries.data?.length ?? 0;
  /** 空态：一张人物卡和一条词条都没有 —— AI 入口更该突出 */
  const isEmpty = charCount === 0 && worldCount === 0;

  const items: TabItem<TabKey>[] = useMemo(
    () => [
      { key: 'characters', label: '人物卡', icon: 'user', count: characters.data?.length },
      { key: 'world', label: '世界词条', icon: 'world', count: worldEntries.data?.length },
      { key: 'foreshadows', label: '待回收的线索', icon: 'foreshadow', count: foreshadows.data?.length },
    ],
    [characters.data, worldEntries.data, foreshadows.data],
  );

  const changeTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    // 切 Tab 时清掉仅对人物卡有意义的高亮参数，避免跨 Tab 残留
    if (key !== 'characters') next.delete('highlight');
    setSearchParams(next, { replace: true });
  };

  /** 人物卡弹窗成功打开一次后，把 highlight 从 URL 抹掉 —— 与 closeChat 删 ai 一致。
   *  否则刷新 / 前进后退时 `highlightName` 还在，弹窗会被再次弹开。 */
  const consumeHighlight = useCallback(() => {
    if (!searchParams.get('highlight')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('highlight');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const bookContext: BookContext = {
    title: bookQuery.data?.title ?? '',
    genre: bookQuery.data?.genre ?? null,
    premise: bookQuery.data?.premise ?? null,
  };

  const openChat = () => {
    setChatKey((k) => k + 1);
    setChatOpen(true);
    void capabilities.refetch();
  };

  /** 关闭对话时顺手把 `?ai=1` 抹掉，避免刷新/返回又自动弹一次 */
  const closeChat = () => {
    setChatOpen(false);
    if (searchParams.get('ai')) {
      const next = new URLSearchParams(searchParams);
      next.delete('ai');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <main className="pageContent">
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">设定库</h1>
          <p className="pageSubtitle">
            把人物、世界和你埋下的线索集中记在这里。写得越具体，写作台右栏「本章提醒」就越准。
          </p>
        </div>
        {/* QA L8：写作台有「返回书库」按钮，设定库只有顶栏一个不起眼的链接 —— 统一加一个 */}
        <Button variant="secondary" icon="chevronLeft" onClick={() => navigate('/')}>
          返回书库
        </Button>
      </header>

      <div className={styles.entryWrap}>
        <EntryBanner
          icon="sparkles"
          title="跟 AI 聊聊，帮你把设定建起来"
          description="不用对着空表单发呆。聊几句，AI 把人物卡和世界观生成好，你改改就行 —— 确认后才会写进库里。"
          prominent={isEmpty}
          onClick={openChat}
        />
      </div>

      <Tabs items={items} active={active} onChange={changeTab} ariaLabel="设定库分类" />

      <div className={styles.tabPanel}>
        {active === 'characters' ? (
          <CharactersTab slug={slug} highlightName={highlight} onConsumeHighlight={consumeHighlight} />
        ) : active === 'world' ? (
          <WorldEntriesTab slug={slug} />
        ) : (
          <ForeshadowTable slug={slug} />
        )}
      </div>

      {chatOpen ? (
        <SetupChatDialog
          key={chatKey}
          slug={slug}
          bookContext={bookContext}
          noModel={noModel}
          onOpenConfig={() => {
            closeChat();
            navigate(`/book/${encodeURIComponent(slug)}/config`);
          }}
          onClose={closeChat}
          onWritten={(res) => {
            closeChat();
            changeTab(res.worldEntries > 0 && res.characters === 0 ? 'world' : 'characters');
            toast.success(
              `已写入 ${res.characters} 张人物卡、${res.worldEntries} 条世界词条`,
            );
          }}
        />
      ) : null}
    </main>
  );
}
