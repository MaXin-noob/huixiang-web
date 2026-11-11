import React from 'react';
import { createRoot } from 'react-dom/client';
// semi-ui 2.104 的 package.json exports 没导出 dist/css，只能按文件路径引，
// 不然 Vite 会报 "Missing ./dist/css/semi.min.css specifier"。
import '../node_modules/@douyinfe/semi-ui/dist/css/semi.min.css';
import './styles.css';
import App from './App';
import './button-semi-overrides.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 注册 Service Worker（仅生产构建）：让网页版可作为 PWA 安装、并在断网时
// 仍能打开外壳。dev 下不注册，避免缓存开发资源；浏览器不支持时静默跳过。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // 已有旧 Service Worker 接管时，新版本接管后自动刷新一次，避免长期停留在旧包
  // （旧界面里暂离等按钮可能看起来"点了没反应"）。
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      // 每次加载主动检查一次 SW 更新（配合 sw.js 的 skipWaiting 立即接管）。
      .then((reg) => reg.update().catch(() => undefined))
      .catch((err) => {
        console.warn('[pwa] Service Worker 注册失败：', err);
      });
  });
}
