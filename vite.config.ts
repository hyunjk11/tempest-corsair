/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

const base = process.env.VITE_BASE && process.env.VITE_BASE.length > 0 ? process.env.VITE_BASE : '/tempest-corsair/';

export default defineConfig({
  base,
  server: { host: '0.0.0.0', port: 43123, strictPort: true },
  preview: { host: '0.0.0.0', port: 43123, strictPort: true },
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
