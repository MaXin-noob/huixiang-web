// 统一的错误提示与危险操作确认，避免各页面各弹各的、文案和样式不一致。
//
// - showError：把未知异常 / 字符串规范成一句可读文案后弹出；同一条消息 3 秒内只弹一次，
//   避免并发请求失败时刷屏。
// - confirmDanger：危险操作（删除、踢出、封禁等）的统一二次确认，红色主按钮、居中、
//   点遮罩不关闭，必须显式点「确定 / 取消」。

import { Modal, Toast } from '@douyinfe/semi-ui';

/** 从任意错误对象里抽出可展示的文案。 */
export function errorMessage(input: unknown, fallback = '操作失败'): string {
  if (typeof input === 'string') return input.trim() || fallback;
  if (input instanceof Error) return input.message.trim() || fallback;
  if (input && typeof input === 'object' && 'message' in input) {
    const m = (input as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return fallback;
}

let lastError = '';
let lastErrorAt = 0;

/** 统一的错误提示：同一条消息 3 秒内只弹一次。 */
export function showError(input: unknown, fallback = '操作失败'): void {
  const msg = errorMessage(input, fallback);
  const now = Date.now();
  if (msg === lastError && now - lastErrorAt < 3000) return;
  lastError = msg;
  lastErrorAt = now;
  Toast.error(msg);
}

export type ConfirmDangerOptions = {
  title: string;
  content: string;
  okText?: string;
  cancelText?: string;
  onOk: () => void | Promise<void>;
};

/** 危险操作的统一二次确认。 */
export function confirmDanger({
  title,
  content,
  okText = '确定',
  cancelText = '取消',
  onOk,
}: ConfirmDangerOptions): void {
  Modal.confirm({
    title,
    content,
    okText,
    cancelText,
    okButtonProps: { type: 'danger' },
    centered: true,
    maskClosable: false,
    onOk,
  });
}
