import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@dimforge/rapier')) return 'physics';
          if (id.includes('/three/')) return 'three';
        },
      },
    },
  },
});
