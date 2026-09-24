import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  /** 一句话说明这页是干什么的（全站统一小字号次要色） */
  subtitle?: ReactNode;
  /** 右侧动作区（如「新建作品」「添加总纲」） */
  actions?: ReactNode;
}

/**
 * 全站统一页头（配合 global.css 的 .pageHeader 系列类）。
 * 此前每页手写同样的 header 结构，样式微调要改六处 —— 收敛为一个组件。
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="pageHeader">
      <div>
        <h1 className="pageTitle">{title}</h1>
        {subtitle ? <p className="pageSubtitle">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}
