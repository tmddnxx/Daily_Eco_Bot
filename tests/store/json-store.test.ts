import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonStore } from '../../src/store/json-store.js';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('JsonStore', () => {
  const testDir = join(import.meta.dirname, 'tmp-store');
  let store: JsonStore;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    store = new JsonStore(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('watchlist', () => {
    it('should start empty', () => {
      expect(store.getWatchlist()).toEqual([]);
    });

    it('should add and remove keywords', () => {
      store.addWatch('삼성전자');
      store.addWatch('AI');
      expect(store.getWatchlist()).toEqual(['삼성전자', 'AI']);

      store.removeWatch('삼성전자');
      expect(store.getWatchlist()).toEqual(['AI']);
    });

    it('should not add duplicate keywords', () => {
      store.addWatch('삼성전자');
      store.addWatch('삼성전자');
      expect(store.getWatchlist()).toEqual(['삼성전자']);
    });
  });

  describe('sent cache', () => {
    it('should track sent news ids', () => {
      expect(store.isSent('abc123')).toBe(false);
      store.markSent('abc123');
      expect(store.isSent('abc123')).toBe(true);
    });
  });

  describe('history', () => {
    it('should save and retrieve briefings', () => {
      const briefing = { date: '2026-03-10', content: 'test briefing' };
      store.saveHistory(briefing);
      const history = store.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('test briefing');
    });

    it('should return N most recent entries', () => {
      store.saveHistory({ date: '2026-03-08', content: 'old' });
      store.saveHistory({ date: '2026-03-09', content: 'mid' });
      store.saveHistory({ date: '2026-03-10', content: 'new' });
      const history = store.getHistory(2);
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('new');
    });
  });

  describe('pruning', () => {
    it('should prune entries older than retention days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);
      store.markSent('old-id', oldDate);
      store.markSent('new-id', new Date());

      store.pruneCache(30);
      expect(store.isSent('old-id')).toBe(false);
      expect(store.isSent('new-id')).toBe(true);
    });
  });
});
