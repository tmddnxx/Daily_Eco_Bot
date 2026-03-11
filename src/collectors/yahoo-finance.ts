/**
 * Yahoo Finance Collector
 *
 * Yahoo Finance API를 통해 주요 시장 지수의 실시간 시세를 가져옵니다.
 * - S&P 500, NASDAQ, KOSPI 등의 현재가와 전일 대비 변동률을 계산
 * - 뉴스 형태(NewsItem)로 변환하여 브리핑에 포함
 * - /market 명령어에서도 실시간 조회에 사용됨
 */
import axios from 'axios';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface YahooFinanceConfig {
  symbols: string[];
}

const SYMBOL_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  '^KS11': 'KOSPI',
  '^KQ11': 'KOSDAQ',
  '^DJI': 'Dow Jones',
  'USDKRW=X': 'USD/KRW 환율',
};

function symbolCategory(symbol: string): NewsCategory {
  if (symbol.startsWith('^KS') || symbol.startsWith('^KQ')) return 'kr-stock';
  if (symbol.includes('KRW') || symbol.includes('JPY') || symbol.includes('EUR')) return 'macro';
  return 'us-stock';
}

export class YahooFinanceCollector implements Collector {
  name = 'yahoo-finance';
  private config: YahooFinanceConfig;

  constructor(config: YahooFinanceConfig) {
    this.config = config;
  }

  async collect(): Promise<NewsItem[]> {
    const items: NewsItem[] = [];

    for (const symbol of this.config.symbols) {
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
        {
          params: { interval: '1d', range: '1d' },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000,
        }
      );

      const meta = response.data.chart.result[0].meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose ?? meta.chartPreviousClose;
      // previousClose가 없거나 0이면 변동률을 0으로 처리
      const changeNum = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
      const change = changeNum.toFixed(2);
      const direction = changeNum >= 0 ? '+' : '';
      const name = SYMBOL_NAMES[symbol] || symbol;

      items.push({
        id: createNewsItemId('yahoo-finance', `${symbol}-${new Date().toISOString().slice(0, 10)}`),
        title: `${name} ${price.toLocaleString()} (${direction}${change}%)`,
        summary: `${name} 전일 대비 ${direction}${change}% 변동. 현재가 ${price.toLocaleString()}`,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
        source: 'yahoo-finance',
        category: symbolCategory(symbol),
        publishedAt: new Date(),
      });
    }

    return items;
  }
}
