import { useEffect, useState } from 'react';
import { api, userMessageOf } from '@/api/client';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { toast } from '@/stores/toastStore';
import styles from './config.module.css';

/**
 * 联网搜索配置（AI 助手「联网」开关的后端）。
 *
 * 默认直连 DuckDuckGo —— 大陆网络不通，所以给两条出路：
 * ① 填代理（如 `http://127.0.0.1:7890`）；② 填自建 JSON 端点
 * （约定 `GET {端点}?q=...` 返回 `{"results":[{title,url,snippet}]}`）。
 * 两项留空即恢复默认。配置存全局库，对所有作品生效。
 */
export function WebSearchPanel() {
  const [endpoint, setEndpoint] = useState('');
  const [proxy, setProxy] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api
      .getWebSearchSettings()
      .then((s) => {
        setEndpoint(s.endpoint ?? '');
        setProxy(s.proxy ?? '');
      })
      .catch((e: unknown) => toast.error(userMessageOf(e)))
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.putWebSearchSettings({
        endpoint: endpoint.trim() || null,
        proxy: proxy.trim() || null,
      });
      setEndpoint(s.endpoint ?? '');
      setProxy(s.proxy ?? '');
      toast.success(s.endpoint || s.proxy ? '联网搜索配置已保存' : '已恢复默认（直连 DuckDuckGo）');
    } catch (e) {
      toast.error(userMessageOf(e));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <>
      <div className={styles.exportRow}>
        <div className={styles.exportRange}>
          <Input
            label="搜索端点（可选）"
            value={endpoint}
            placeholder="留空 = 用 DuckDuckGo"
            hint="自建/第三方服务：GET 端点?q=关键词，返回 {results:[{title,url,snippet}]}"
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </div>
        <div className={styles.exportRange}>
          <Input
            label="代理地址（可选）"
            value={proxy}
            placeholder="例如 http://127.0.0.1:7890"
            hint="网络到不了 DuckDuckGo 时填这个；用了自建端点一般不需要"
            onChange={(e) => setProxy(e.target.value)}
          />
        </div>
        <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </>
  );
}
