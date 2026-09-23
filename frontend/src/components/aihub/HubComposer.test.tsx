import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HubComposer } from './HubComposer';

function renderComposer(overrides: Partial<Parameters<typeof HubComposer>[0]> = {}) {
  const props = {
    actionKey: 'auto',
    onActionChange: vi.fn(),
    useWeb: false,
    onUseWebChange: vi.fn(),
    onSend: vi.fn(),
    pending: false,
    disabled: false,
    needChapter: false,
    ...overrides,
  };
  render(<HubComposer {...props} />);
  return props;
}

describe('HubComposer（AI 助手输入区）', () => {
  it('空文本禁用发送；输入后可发送并清空', () => {
    const props = renderComposer();
    const send = screen.getByRole('button', { name: /发送/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('输入你想说的话'), { target: { value: ' 你好 ' } });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    expect(props.onSend).toHaveBeenCalledWith('你好');
  });

  it('联网开关：点击回调取反值，aria-pressed 如实反映状态', () => {
    const props = renderComposer();
    const web = screen.getByRole('button', { name: '联网' });
    expect(web.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(web);
    expect(props.onUseWebChange).toHaveBeenCalledWith(true);
  });

  it('未配模型时：输入框照常可打字（想法不该被锁），但发送被拦并给人话解释', () => {
    renderComposer({ disabled: true });
    const input = screen.getByLabelText('输入你想说的话') as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: '先记个想法' } });
    const send = screen.getByRole('button', { name: /发送/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/现在还不能用，请先配置模型/)).toBeTruthy();
  });

  it('需要先选章节的动作：发送禁用 + 提示选章', () => {
    const props = renderComposer({ actionKey: 'continue', needChapter: true });
    fireEvent.change(screen.getByLabelText('输入你想说的话'), { target: { value: '写' } });
    const send = screen.getByRole('button', { name: /发送/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/要先在上面选一章/)).toBeTruthy();
    expect(props.onSend).not.toHaveBeenCalled();
  });
});
