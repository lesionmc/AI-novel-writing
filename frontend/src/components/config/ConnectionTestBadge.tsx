import { Badge } from '@/components/common/Badge';

export interface ConnectionTestBadgeProps {
  connected: boolean | null;
  latencyMs: number | null;
  testing: boolean;
}

/** 连通性徽标：检测中 / 连通（含延迟）/ 失败 / 未检测 */
export function ConnectionTestBadge({ connected, latencyMs, testing }: ConnectionTestBadgeProps) {
  if (testing) {
    return (
      <Badge variant="neutral" icon="loader">
        检测中…
      </Badge>
    );
  }
  if (connected === true) {
    return (
      <Badge variant="success" icon="plug">
        {latencyMs != null ? `连通 · ${latencyMs}ms` : '连通'}
      </Badge>
    );
  }
  if (connected === false) {
    return (
      <Badge variant="danger" icon="error">
        连通失败
      </Badge>
    );
  }
  return <Badge variant="neutral">未检测</Badge>;
}
