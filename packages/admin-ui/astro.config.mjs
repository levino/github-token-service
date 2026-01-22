import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  base: '/admin',
  adapter: node({
    mode: 'middleware',
  }),
});
