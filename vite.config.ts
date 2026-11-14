import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  // GitHub Pages 项目站点地址：https://king-jingxiang.github.io/Bento3D-Studio/
  // 生产构建使用子路径，本地开发仍保持在根路径。
  base: mode === 'production' ? '/Bento3D-Studio/' : '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  build: {
    target: 'es2022',
  },
}));
