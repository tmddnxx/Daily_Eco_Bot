import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NaverNewsCollector } from '../../src/collectors/naver-news.js';

vi.mock('axios');
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('NaverNewsCollector', () => {
  let collector: NaverNewsCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new NaverNewsCollector({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      categories: ['주식'],
    });
  });

  it('should return NewsItem array from Naver API response', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            title: '삼성전자 <b>주가</b> 상승',
            description: '삼성전자 주가가 3% 상승했다.',
            link: 'https://news.naver.com/123',
            pubDate: 'Mon, 10 Mar 2026 06:00:00 +0900',
          },
        ],
      },
    });

    const items = await collector.collect();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('삼성전자 주가 상승');
    expect(items[0].source).toBe('naver');
    expect(items[0].url).toBe('https://news.naver.com/123');
  });

  it('should strip HTML tags from title and description', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            title: '<b>AI</b> &amp; 반도체',
            description: '<b>설명</b>입니다',
            link: 'https://example.com',
            pubDate: 'Mon, 10 Mar 2026 06:00:00 +0900',
          },
        ],
      },
    });

    const items = await collector.collect();
    expect(items[0].title).toBe('AI & 반도체');
    expect(items[0].summary).toBe('설명입니다');
  });

  it('should make requests for each category', async () => {
    collector = new NaverNewsCollector({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      categories: ['주식', '경제'],
    });

    mockedAxios.get = vi.fn().mockResolvedValue({ data: { items: [] } });

    await collector.collect();
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});
