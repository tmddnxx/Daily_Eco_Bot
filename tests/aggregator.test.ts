import { describe, it, expect } from 'vitest';
import { aggregate } from '../src/aggregator.js';
import type { NewsItem } from '../src/types.js';

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'test-id',
    title: 'Test Title',
    summary: 'Test summary',
    url: 'https://example.com',
    source: 'test',
    category: 'kr-stock',
    publishedAt: new Date('2026-03-10T06:00:00Z'),
    ...overrides,
  };
}

describe('aggregate', () => {
  it('should group items by category', () => {
    const items = [
      makeItem({ id: '1', category: 'kr-stock' }),
      makeItem({ id: '2', category: 'us-stock' }),
      makeItem({ id: '3', category: 'kr-stock' }),
    ];

    const result = aggregate(items);
    expect(result.get('kr-stock')).toHaveLength(2);
    expect(result.get('us-stock')).toHaveLength(1);
  });

  it('should deduplicate by id', () => {
    const items = [
      makeItem({ id: 'same-id', title: 'First' }),
      makeItem({ id: 'same-id', title: 'Duplicate' }),
    ];

    const result = aggregate(items);
    const krStock = result.get('kr-stock')!;
    expect(krStock).toHaveLength(1);
    expect(krStock[0].title).toBe('First');
  });

  it('should sort by publishedAt descending', () => {
    const items = [
      makeItem({ id: '1', publishedAt: new Date('2026-03-10T04:00:00Z') }),
      makeItem({ id: '2', publishedAt: new Date('2026-03-10T06:00:00Z') }),
      makeItem({ id: '3', publishedAt: new Date('2026-03-10T05:00:00Z') }),
    ];

    const result = aggregate(items);
    const sorted = result.get('kr-stock')!;
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('3');
    expect(sorted[2].id).toBe('1');
  });

  it('should return empty map for empty input', () => {
    const result = aggregate([]);
    expect(result.size).toBe(0);
  });
});
