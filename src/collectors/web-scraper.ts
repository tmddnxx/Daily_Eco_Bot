/**
 * 웹 스크래퍼 Collector
 *
 * cheerio를 사용하여 웹사이트에서 뉴스를 직접 크롤링합니다.
 * - ScrapeTarget 설정으로 크롤링 대상 사이트와 CSS 셀렉터를 지정
 * - 기본 타겟: investing.com 한국 주식 뉴스
 * - 사이트별로 container/title/link/summary 셀렉터를 커스터마이징 가능
 * - 모든 타겟이 실패하면 에러를 throw (부분 실패는 허용)
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface ScrapeTarget {
  name: string;
  url: string;
  category: NewsCategory;
  selectors: {
    container: string;
    title: string;
    link: string;
    summary?: string;
  };
  baseUrl?: string;
}

const DEFAULT_TARGETS: ScrapeTarget[] = [
  {
    name: 'investing.com-news',
    url: 'https://kr.investing.com/news/stock-market-news',
    category: 'kr-stock',
    selectors: {
      container: 'article[data-test="article-item"]',
      title: 'a.title',
      link: 'a.title',
      summary: 'p',
    },
    baseUrl: 'https://kr.investing.com',
  },
];

export class WebScraperCollector implements Collector {
  name = 'web-scraper';
  private targets: ScrapeTarget[];

  constructor(targets?: ScrapeTarget[]) {
    this.targets = targets || DEFAULT_TARGETS;
  }

  async collect(): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];

    const results = await Promise.allSettled(
      this.targets.map((target) => this.scrapeTarget(target))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }

    if (allItems.length === 0 && results.every((r) => r.status === 'rejected')) {
      throw new Error('All scrape targets failed');
    }

    return allItems;
  }

  private async scrapeTarget(target: ScrapeTarget): Promise<NewsItem[]> {
    const response = await axios.get(target.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const items: NewsItem[] = [];

    $(target.selectors.container).slice(0, 10).each((_, el) => {
      const titleEl = $(el).find(target.selectors.title);
      const title = titleEl.text().trim();
      let link = titleEl.attr('href') || '';
      if (link && target.baseUrl && !link.startsWith('http')) {
        link = target.baseUrl + link;
      }
      const summary = target.selectors.summary
        ? $(el).find(target.selectors.summary).text().trim().slice(0, 200)
        : '';

      if (title && link) {
        items.push({
          id: createNewsItemId(target.name, link),
          title,
          summary,
          url: link,
          source: target.name,
          category: target.category,
          publishedAt: new Date(),
        });
      }
    });

    return items;
  }
}
