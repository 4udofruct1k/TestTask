import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Относительные пути: одна сборка работает и в Capacitor (от корня),
  // и на GitHub Pages (из подкаталога /TestTask/)
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
