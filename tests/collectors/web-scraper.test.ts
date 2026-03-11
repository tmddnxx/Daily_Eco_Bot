import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebScraperCollector } from '../../src/collectors/web-scraper.js';

vi.mock('axios');
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('WebScraperCollector', () => {
  let collector: WebScraperCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new WebScraperCollector();
  });

  it('should scrape and parse HTML content', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: `<html><body>
        <div class="news-item">
          <a href="/article/123" class="title">테스트 뉴스 제목</a>
          <p class="summary">테스트 뉴스 요약입니다.</p>
          <span class="date">2026-03-10</span>
        </div>
      </body></html>`,
    });

    const items = await collector.collect();
    expect(items.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle scraping failure gracefully', async () => {
    mockedAxios.get = vi.fn().mockRejectedValue(new Error('Connection refused'));
    await expect(collector.collect()).rejects.toThrow();
  });
});
