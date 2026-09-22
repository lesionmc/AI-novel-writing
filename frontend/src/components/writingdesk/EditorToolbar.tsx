import type { Editor } from '@tiptap/react';
import { Button } from '@/components/common/Button';
import styles from './Editor.module.css';

export interface EditorToolbarProps {
  editor: Editor | null;
  onToggleFind: () => void;
  findOpen: boolean;
}

/**
 * 编辑器工具条：仅加粗 / 斜体 + 撤销重做 + 查找。
 * 04 §2.3：纯文本 + 基础格式，**不做复杂排版**。
 */
export function EditorToolbar({ editor, onToggleFind, findOpen }: EditorToolbarProps) {
  const disabled = !editor;

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="编辑格式">
      <Button
        variant={editor?.isActive('bold') ? 'secondary' : 'ghost'}
        size="sm"
        iconOnly
        icon="bold"
        aria-label="加粗"
        title="加粗（Ctrl+B）"
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <Button
        variant={editor?.isActive('italic') ? 'secondary' : 'ghost'}
        size="sm"
        iconOnly
        icon="italic"
        aria-label="斜体"
        title="斜体（Ctrl+I）"
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <span className={styles.toolbarDivider} aria-hidden="true" />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="undo"
        aria-label="撤销"
        title="撤销（Ctrl+Z）"
        disabled={disabled || !editor?.can().undo()}
        onClick={() => editor?.chain().focus().undo().run()}
      />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="redo"
        aria-label="重做"
        title="重做（Ctrl+Shift+Z）"
        disabled={disabled || !editor?.can().redo()}
        onClick={() => editor?.chain().focus().redo().run()}
      />
      <span className={styles.toolbarSpacer} />
      <Button
        variant={findOpen ? 'secondary' : 'ghost'}
        size="sm"
        icon="search"
        onClick={onToggleFind}
        disabled={disabled}
        title="本章内查找（Ctrl+F）"
      >
        查找
      </Button>
    </div>
  );
}
