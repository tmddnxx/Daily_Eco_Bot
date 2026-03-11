/**
 * 네이버 뉴스 Collector
 *
 * 네이버 검색 API(openapi.naver.com)를 사용하여 카테고리별 뉴스를 수집합니다.
 * - 카테고리(주식, 경제, AI 등)별로 API를 호출하여 최신 뉴스 10건씩 가져옴
 * - HTML 태그와 특수문자(&amp; 등)를 제거하여 깨끗한 텍스트로 변환
 * - 필요: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수
 */
import axios from 'axios';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface NaverNewsConfig {
  clientId: string;
  clientSecret: string;
  categories: string[];
}

/** 검색 키워드 → 카테고리 매핑 (키워드 일부 포함 여부로 판단) */
const CATEGORY_MAP: Record<string, NewsCategory> = {
  '코스피': 'kr-stock',
  '코스닥': 'kr-stock',
  '증시': 'kr-stock',
  '미국증시': 'us-stock',
  '나스닥': 'us-stock',
  '부동산': 'macro',
  '금리': 'macro',
  '환율': 'macro',
  '경제': 'macro',
  '대통령': 'macro',
  '경제정책': 'macro',
  'AI': 'ai-tech',
  '반도체': 'ai-tech',
};

/** 검색 키워드 문자열에서 가장 적합한 카테고리를 찾음 */
function mapCategory(query: string): NewsCategory {
  for (const [keyword, category] of Object.entries(CATEGORY_MAP)) {
    if (query.includes(keyword)) return category;
  }
  return 'macro';
}

function stripHtml(str: string): string {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

export class NaverNewsCollector implements Collector {
  name = 'naver';
  private config: NaverNewsConfig;

  constructor(config: NaverNewsConfig) {
    this.config = config;
  }

  async collect(): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];

    for (const category of this.config.categories) {
      const response = await axios.get('https://openapi.naver.com/v1/search/news.json', {
        params: { query: category, display: 10, sort: 'date' },
        headers: {
          'X-Naver-Client-Id': this.config.clientId,
          'X-Naver-Client-Secret': this.config.clientSecret,
        },
      });

      const items: NewsItem[] = response.data.items.map((item: any) => ({
        id: createNewsItemId('naver', item.link),
        title: stripHtml(item.title),
        summary: stripHtml(item.description),
        url: item.link,
        source: 'naver',
        category: mapCategory(category),
        publishedAt: new Date(item.pubDate),
      }));

      allItems.push(...items);
    }

    return allItems;
  }
}
