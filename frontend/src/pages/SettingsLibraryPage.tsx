import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCharacters, useForeshadows, useWorldEntries } from '@/hooks/queries';
import { Button } from '@/components/common/Button';
import { EntryBanner } from '@/components/common/EntryBanner';
import { Tabs } from '@/components/settings/Tabs';
import type { TabItem } from '@/components/settings/Tabs';
import { CharactersTab } from '@/components/settings/CharactersTab';
import { WorldEntriesTab } from '@/components/settings/WorldEntriesTab';
import { ForeshadowTable } from '@/components/settings/ForeshadowTable';
import styles from './SettingsLibraryPage.module.css';
import { bookPath } from '@/lib/slug';

type TabKey = 'characters' | 'world' | 'foreshadows';

const TAB_KEYS: TabKey[] = ['characters', 'world', 'foreshadows'];

function parseTab(raw: string | null): TabKey {
  return raw && (TAB_KEYS as string[]).includes(raw) ? (raw as TabKey) : 'characters';
}

/**
 * 设定库 `/book/:slug/settings`（R1）。
 * 三 Tab（人物卡 / 世界词条 / 待回收的线索），Tab 状态入 URL query 便于深链
 * （写作台「查看完整档案」会带 `?tab=characters&highlight=<名>` 跳进来）。
 * 全本地 CRUD，无 AI 依赖 —— 未配模型时依然完整可用（红线 3）；
 * 「跟 AI 聊聊」已并入 AI 助手单对话（2026-09-23 整合），这里只做跳转。
 */
export function SettingsLibraryPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const active = parseTab(searchParams.get('tab'));
  const highlight = searchParams.get('highlight') ?? undefined;

  const characters = useCharacters(slug);
  const worldEntries = useWorldEntries(slug);
  const foreshadows = useForeshadows(slug);

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

  return (
    <main className="pageContent">
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">设定库</h1>
          <p className="pageSubtitle">
            把人物、世界和你埋下的线索集中记在这里。写得越具体，写作台右栏「本章提醒」就越准。
          </p>
        </div>
        {/* QA L8：写作台有「返回书库」按钮，设定库只有顶栏一个不起眼的链接 —— 统一加一个。
            用 ghost 而不是 secondary：本页的主行动是各 Tab 里的「新建人物 / 新建词条」，
            页头这个按钮只是"离开"通道。做成带边框的次级按钮会跟主行动抢注意力，
            也和「开书清单」页头（ghost + accent 主行动）的约定不一致。 */}
        <Button variant="ghost" icon="chevronLeft" onClick={() => navigate('/')}>
          返回书库
        </Button>
      </header>

      <div className={styles.entryWrap}>
        <EntryBanner
          icon="sparkles"
          title="跟 AI 聊聊，帮你把设定建起来"
          description="不用对着空表单发呆。聊几句，AI 把人物卡和世界观生成好，你改改就行 —— 确认后才会写进库里。"
          prominent={isEmpty}
          onClick={() => navigate(bookPath(slug, '/chat'))}
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
    </main>
  );
}
