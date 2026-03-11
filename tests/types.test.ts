import { describe, it, expect } from 'vitest';
import { createNewsItemId, type NewsItem, type BriefingSection, type NewsCategory } from '../src/types.js';

describe('types', () => {
  describe('createNewsItemId', () => {
    it('should generate consistent id from source and url', () => {
      const id1 = createNewsItemId('naver', 'https://example.com/news/1');
      const id2 = createNewsItemId('naver', 'https://example.com/news/1');
      expect(id1).toBe(id2);
    });

    it('should generate different ids for different inputs', () => {
      const id1 = createNewsItemId('naver', 'https://example.com/news/1');
      const id2 = createNewsItemId('naver', 'https://example.com/news/2');
      expect(id1).not.toBe(id2);
    });

    it('should return a hex string', () => {
      const id = createNewsItemId('naver', 'https://example.com/news/1');
      expect(id).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('NewsCategory', () => {
    it('should accept valid categories', () => {
      const categories: NewsCategory[] = ['kr-stock', 'us-stock', 'ai-tech', 'macro'];
      expect(categories).toHaveLength(4);
    });
  });
});
