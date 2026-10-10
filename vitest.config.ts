import { defineConfig } from 'vitest/config';
import path from 'node:path';
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
const cssAsText = (): Plugin => ({ name: 'css-as-text', enforce: 'pre', load(id) { return id.endsWith('.csstxt') ? `export default ${JSON.stringify(readFileSync(id, 'utf8'))}` : null; } });

export default defineConfig({
  plugins: [cssAsText()],
  test: { environment: 'happy-dom', include: ['src/**/*.test.ts'] },
  resolve: { alias: { obsidian: path.resolve(__dirname, 'src/__mocks__/obsidian.ts') } },
});
