import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Used only by the motion-video investigation; never affects the game.
export default defineConfig({
  ...base,
  outputDir: process.env.MOTION_VIDEO_OUTPUT || 'test-results-video',
  reporter: [['list']],
  use: {...base.use, video: {mode: 'on', size: {width: 390, height: 844}}, trace: 'on'},
});
