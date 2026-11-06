import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';

// 纯前端（client）静态检查配置，基于 Vite + React + TS 官方模板的推荐规则集。
// CI 里跑 `npm run lint`，与 `npm run build`（tsc 类型检查）互补：
// tsc 管类型，ESLint 管 Hooks 依赖、潜在 bug、React 规范等。
export default tseslint.config([
  globalIgnores(['dist', 'node_modules', 'test']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // WebCodecs（AudioEncoder/AudioDecoder/AudioData…）等实验性/带厂商前缀的
      // 浏览器 API 没有稳定的类型声明，相关音频文件里用 any 是刻意的；
      // 降级为警告，既能在日志里看到，又不会把类型噪声当成构建失败。
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);
