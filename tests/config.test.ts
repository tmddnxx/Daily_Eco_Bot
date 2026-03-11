import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, type AppConfig } from '../src/config.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('config', () => {
  const testDir = join(import.meta.dirname, 'tmp-config');
  const configPath = join(testDir, 'config.yaml');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(configPath, `
schedule:
  time: "08:00"
  timezone: "Asia/Seoul"
telegram:
  subscriberChatIds: []
summarizer:
  tool: "claude-cli"
  language: "ko"
  briefingStyle: "concise"
  dailyLimit: 50
  cacheDetailSummary: true
sources:
  naver-news:
    enabled: true
    categories: ["주식"]
  rss:
    enabled: false
    feeds: []
  yahoo-finance:
    enabled: true
    symbols: ["^GSPC"]
  web-scraper:
    enabled: false
watch:
  checkInterval: 30
`);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load config from yaml file', () => {
    const config = loadConfig(configPath);
    expect(config.schedule.time).toBe('08:00');
    expect(config.schedule.timezone).toBe('Asia/Seoul');
  });

  it('should load telegram settings', () => {
    const config = loadConfig(configPath);
    expect(config.telegram.subscriberChatIds).toEqual([]);
  });

  it('should load source settings', () => {
    const config = loadConfig(configPath);
    expect(config.sources['naver-news'].enabled).toBe(true);
    expect(config.sources.rss.enabled).toBe(false);
  });

  it('should throw on missing config file', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow();
  });
});
