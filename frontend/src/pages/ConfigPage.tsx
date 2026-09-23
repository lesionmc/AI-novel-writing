import { useNavigate, useParams } from 'react-router-dom';
import { useBook, useChapterBriefs, useProviders } from '@/hooks/queries';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBar } from '@/components/common/ErrorBar';
import { Icon } from '@/components/common/Icon';
import { SkeletonRows } from '@/components/common/Skeleton';
import { TaskRoleMapping } from '@/components/config/TaskRoleMapping';
import { WritingModeSwitch } from '@/components/config/WritingModeSwitch';
import { ProviderList } from '@/components/config/ProviderList';
import { ExportPanel } from '@/components/config/ExportPanel';
import { WebSearchPanel } from '@/components/config/WebSearchPanel';
import { ThemeSwitcher } from '@/components/config/ThemeSwitcher';
import { WordlistStatusCard } from '@/components/audit/WordlistStatusCard';
import styles from '@/components/config/config.module.css';

/**
 * 设置 `/book/:slug/config`（R5 / R16），也可无作品进入 `/config`。
 * 五块：模型分工 / 写作模式三档 / 已配置模型 / 数据导出 / 外观主题。
 * 后两块依赖具体作品，无作品时自动隐藏（模型配置是全局的，不该被挡住 —— QA M6）。
 * 「外观」是人的偏好，不随作品变化，所以永远显示。
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
      <header className="pageHeader">
        <div>
          <h1 className="pageTitle">设置</h1>
          <p className="pageSubtitle">
            {bookScoped
              ? '模型、写作模式与数据导出都在这里。不配模型也能写作，配了才解锁 AI 能力。'
              : '先在这里把 AI 配起来。不配模型也能写作，配了才解锁「帮你写」「帮你记」这些能力。'}
          </p>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.sectionTitle}>
              <Icon name="target" size={20} /> 谁干什么
            </span>
            <span className={styles.sectionHint}>
              可以让不同服务商各管一摊，也可以只用一个模型全包。不指定就用下面那个默认模型。
            </span>
          </div>
        </div>
        <div className={styles.sectionBody}>
          {providersQuery.isPending ? (
            <div className={styles.stateWrap}>
              <SkeletonRows count={2} />
            </div>
          ) : providersQuery.isError ? (
            <ErrorBar error={providersQuery.error} onRetry={() => void providersQuery.refetch()} />
          ) : (
            <TaskRoleMapping providers={providers} />
          )}
        </div>
      </section>

      {bookScoped ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitleWrap}>
              <span className={styles.sectionTitle}>
                <Icon name="edit" size={20} /> 写作模式
              </span>
              <span className={styles.sectionHint}>
                决定写作台里 AI 出现到什么程度。随时可以改，不影响已写内容。
              </span>
            </div>
          </div>
          <div className={styles.sectionBody}>
            <WritingModeSwitch slug={slug} current={writingMode} />
          </div>
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.sectionTitle}>
              <Icon name="model" size={20} /> 已配置的模型
            </span>
            <span className={styles.sectionHint}>
              密钥保存在系统密钥环里，数据库只留引用名，界面永不回显明文。
            </span>
          </div>
        </div>
        <div className={styles.sectionBody}>
          <ProviderList />
        </div>
      </section>

      {bookScoped ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitleWrap}>
              <span className={styles.sectionTitle}>
                <Icon name="export" size={20} /> 导出书稿
              </span>
              <span className={styles.sectionHint}>
                把书稿导出成纯文本或 Word，导到哪都行。
              </span>
            </div>
          </div>
          <div className={styles.sectionBody}>
            <ExportPanel slug={slug} chapterCount={briefsQuery.data?.length} />
          </div>
        </section>
      ) : null}

      {/* 敏感词词库是「可选功能」：状态常驻可查，未配置也不是错误态（11 §5.3） */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.sectionTitle}>
              <Icon name="search" size={20} /> 敏感词词库
            </span>
            <span className={styles.sectionHint}>
              质检页的敏感词自查要用一份你自己准备的词表。词库只在本机匹配，不上传、不联网。
            </span>
          </div>
        </div>
        <div className={styles.sectionBody}>
          <WordlistStatusCard />
        </div>
      </section>

      {/* 联网搜索的后端配置：默认 DDG，国内网络填代理或自建端点（AI 助手「联网」开关用） */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.sectionTitle}>
              <Icon name="world" size={20} /> 联网搜索
            </span>
            <span className={styles.sectionHint}>
              AI 助手打开「联网」开关时从这里查外部实时资料。默认直连 DuckDuckGo，
              国内网络不通时填代理地址或自建搜索端点。
            </span>
          </div>
        </div>
        <div className={styles.sectionBody}>
          <WebSearchPanel />
        </div>
      </section>

      {/* 外观是「人」的偏好，不属于任何一本书 —— 所以它永远显示，不受作品上下文影响 */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleWrap}>
            <span className={styles.sectionTitle}>
              <Icon name="palette" size={20} /> 外观
            </span>
            <span className={styles.sectionHint}>
              换主题只影响颜色，不改任何内容和设置。写稿时挑一个眼睛不累的。
            </span>
          </div>
        </div>
        <div className={styles.sectionBody}>
          <ThemeSwitcher />
        </div>
      </section>
    </main>
  );
}
