import { useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useBook, useChapterBriefs, useProviders } from '@/hooks/queries';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { PageHeader } from '@/components/common/PageHeader';
import { SkeletonRows } from '@/components/common/Skeleton';
import { TaskRoleMapping } from '@/components/config/TaskRoleMapping';
import { WritingModeSwitch } from '@/components/config/WritingModeSwitch';
import { ProviderList } from '@/components/config/ProviderList';
import { ExportPanel } from '@/components/config/ExportPanel';
import { WebSearchPanel } from '@/components/config/WebSearchPanel';
import { ThemeSwitcher } from '@/components/config/ThemeSwitcher';
import { WordlistStatusCard } from '@/components/audit/WordlistStatusCard';
import type { IconName } from '@/types/ui';
import styles from '@/components/config/config.module.css';

/** 设置页统一的分区卡片（标题 + 一句说明 + 内容），收敛此前七段重复标记 */
function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: IconName;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitleWrap}>
          <span className={styles.sectionTitle}>
            <Icon name={icon} size={20} /> {title}
          </span>
          <span className={styles.sectionHint}>{hint}</span>
        </div>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

/** 折叠区里的小块标题（比 Section 轻一级） */
function SubTitle({ icon, title }: { icon: IconName; title: string }) {
  return (
    <span className={styles.sectionTitle}>
      <Icon name={icon} size={16} /> {title}
    </span>
  );
}

/**
 * 设置 `/book/:slug/config`（R5 / R16），也可无作品进入 `/config`。
 * 顺序按使用频率：① 模型 ② 外观主题 ③ 导出（书内页）④ 进阶设置（默认折叠）。
 * 未配置任何模型时，其余页面本地功能照常可用（红线 3）。
 */
export function ConfigPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const bookScoped = Boolean(slug);
  const bookQuery = useBook(slug);
  const providersQuery = useProviders();
  // 章节数不在 Book 契约里（只在 BookBrief），从章节列表取
  const briefsQuery = useChapterBriefs(slug);

  const providers = providersQuery.data ?? [];
  const writingMode = bookQuery.data?.writing_mode ?? 'assist';

  if (bookQuery.isError) {
    return (
      <main className="pageContent">
        <EmptyState
          icon="error"
          title="打不开这部作品"
          description="它可能已被移入回收目录。回到书库看看当前有哪些作品。"
          actionLabel="返回书库"
          actionIcon="book"
          onAction={() => navigate('/')}
        />
      </main>
    );
  }

  return (
    <main className="pageContent">
      <PageHeader
        title="设置"
        subtitle="先把模型和主题定下来，其余都是低频开关，收在「进阶设置」里。不配模型也能写作，配了才解锁 AI 能力。"
      />

      <Section
        icon="model"
        title="模型"
        hint="添加一家 OpenAI 兼容 / Claude / Ollama 服务即可解锁全部 AI 能力。密钥保存在系统密钥环里，界面永不回显明文。"
      >
        <ProviderList />
      </Section>

      {/* 外观是「人」的偏好，不属于任何一本书 —— 永远显示，不受作品上下文影响 */}
      <Section
        icon="palette"
        title="外观"
        hint="换主题只影响颜色，不改任何内容和设置。写稿时挑一个眼睛不累的。"
      >
        <ThemeSwitcher />
      </Section>

      {bookScoped ? (
        <Section icon="export" title="导出书稿" hint="把书稿导出成纯文本或 Word，导到哪都行；要迁移就点整本备份。">
          <ExportPanel slug={slug} chapterCount={briefsQuery.data?.length} />
        </Section>
      ) : null}

      <CollapsibleSection title="进阶设置" icon="settings" defaultOpen={false}>
        <div className={styles.advancedStack}>
          <div>
            <SubTitle icon="target" title="谁干什么（模型分工）" />
            <p className={styles.sectionHint}>
              可以让不同服务商各管一摊，也可以只用一个模型全包。不指定就用默认模型。
            </p>
            {providersQuery.isPending ? (
              <SkeletonRows count={2} />
            ) : providersQuery.isError ? (
              <ErrorBar
                error={providersQuery.error}
                onRetry={() => void providersQuery.refetch()}
              />
            ) : (
              <TaskRoleMapping providers={providers} />
            )}
          </div>

          {bookScoped ? (
            <div>
              <SubTitle icon="edit" title="写作模式" />
              <p className={styles.sectionHint}>
                决定写作台里 AI 出现到什么程度。随时可以改，不影响已写内容。
              </p>
              <WritingModeSwitch slug={slug} current={writingMode} />
            </div>
          ) : null}

          <div>
            <SubTitle icon="world" title="联网搜索" />
            <p className={styles.sectionHint}>
              AI 助手打开「联网」开关时从这里查外部实时资料。默认直连 DuckDuckGo，
              国内网络不通时填代理地址或自建搜索端点。
            </p>
            <WebSearchPanel />
          </div>

          <div>
            <SubTitle icon="search" title="敏感词词库" />
            <p className={styles.sectionHint}>
              质检页的敏感词自查要用一份你自己准备的词表。词库只在本机匹配，不上传、不联网。
            </p>
            <WordlistStatusCard />
          </div>
        </div>
      </CollapsibleSection>
    </main>
  );
}
