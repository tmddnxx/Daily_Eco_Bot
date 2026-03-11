import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RssFeedCollector } from '../../src/collectors/rss-feed.js';

const mockParseURL = vi.fn().mockResolvedValue({
  items: [
    {
      title: '코스피 상승세',
      contentSnippet: '코스피가 1% 상승했다.',
      link: 'https://hankyung.com/article/1',
      pubDate: 'Mon, 10 Mar 2026 06:00:00 +0900',
    },
  ],
});

vi.mock('rss-parser', () => {
  return {
    default: class MockParser {
      parseURL = mockParseURL;
    },
  };
});

describe('RssFeedCollector', () => {
  let collector: RssFeedCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new RssFeedCollector({
      feeds: [{ name: '한국경제', url: 'https://hankyung.com/rss' }],
    });
  });

  it('should parse RSS feed into NewsItem array', async () => {
    const items = await collector.collect();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('코스피 상승세');
    expect(items[0].source).toBe('한국경제');
  });

  it('should handle multiple feeds', async () => {
    collector = new RssFeedCollector({
      feeds: [
        { name: '한국경제', url: 'https://hankyung.com/rss' },
        { name: '매일경제', url: 'https://mk.co.kr/rss' },
      ],
    });
    const items = await collector.collect();
    expect(items).toHaveLength(2);
  });
});
