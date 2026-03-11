/**
 * RSS 피드 Collector
 *
 * 한국경제, 매일경제 등의 RSS 피드를 파싱하여 뉴스를 수집합니다.
 * - rss-parser 라이브러리로 XML을 파싱
 * - 제목 키워드 기반으로 카테고리를 자동 추측 (guessCategory)
 * - 피드당 최대 10건, 여러 피드를 병렬로 처리
 */
import Parser from 'rss-parser';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface RssFeedConfig {
  feeds: { name: string; url: string }[];
}

function guessCategory(title: string): NewsCategory {
  const lower = title.toLowerCase();
  if (/코스피|코스닥|주가|종목|상장|증권|배당|공매도/.test(title)) return 'kr-stock';
  if (/나스닥|s&p|다우|미국|월가|nyse|연준|fed|테슬라|엔비디아/.test(lower)) return 'us-stock';
  if (/ai|인공지능|chatgpt|llm|반도체|gpu|클라우드|로봇/.test(lower)) return 'ai-tech';
  // 부동산, 정책, 환율, 금리 등 시장에 영향 주는 매크로 뉴스
  if (/부동산|아파트|금리|환율|기준금리|대통령|정책|재정|무역|수출|수입|GDP|물가/.test(title)) return 'macro';
  return 'macro';
}

export class RssFeedCollector implements Collector {
  name = 'rss';
  private config: RssFeedConfig;
  private parser: Parser;

  constructor(config: RssFeedConfig) {
    this.config = config;
    this.parser = new Parser();
  }

  async collect(): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];

    const results = await Promise.allSettled(
      this.config.feeds.map((feed) => this.parseFeed(feed))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }

    return allItems;
  }

  private async parseFeed(feed: { name: string; url: string }): Promise<NewsItem[]> {
    const parsed = await this.parser.parseURL(feed.url);

    return (parsed.items || []).slice(0, 10).map((item) => ({
      id: createNewsItemId(feed.name, item.link || ''),
      title: item.title || '',
      summary: item.contentSnippet?.slice(0, 200) || '',
      url: item.link || '',
      source: feed.name,
      category: guessCategory(item.title || ''),
      publishedAt: new Date(item.pubDate || Date.now()),
    }));
  }
}
