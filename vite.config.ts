import { defineConfig } from 'vite'

// Relative base lets the build run from any sub-path, e.g. a GitHub Pages project site
export default defineConfig({ base: './', build: { rollupOptions: { input: ['index.html', 'exam.html'] } } })
