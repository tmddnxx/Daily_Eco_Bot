/**
 * 브리핑 명령어 (/now, /search, /market)
 *
 * - /now: 모든 소스에서 실시간 수집 → 요약 → 브리핑 전송
 * - /search 키워드: 캐시에서 먼저 검색, 없으면 실시간 수집 후 검색
 * - /market: Yahoo Finance에서 주요 지수 실시간 시세 조회
 */
import type { Collector } from '../../collectors/base.js';
import { runCollectors } from '../../collectors/base.js';
import { aggregate } from '../../aggregator.js';
import type { NewsItem } from '../../types.js';
import { formatMarketSnapshot } from '../formatter.js';

export async function handleSearch(
  keyword: string,
  collectors: Collector[],
  cachedItems: NewsItem[],
): Promise<string> {
  if (!keyword.trim()) {
    return '⚠️ 검색어를 입력해주세요. 예: /search 삼성전자';
  }

  // 캐시에서 먼저 검색
  let matching = cachedItems.filter(
    (item) => item.title.includes(keyword) || item.summary.includes(keyword)
  );

  // 캐시에 없으면 실시간 수집
  if (matching.length === 0) {
    const { items } = await runCollectors(collectors);
    matching = items.filter(
      (item) => item.title.includes(keyword) || item.summary.includes(keyword)
    );
  }

  if (matching.length === 0) {
    return `🔍 "${keyword}" 관련 뉴스를 찾을 수 없습니다.`;
  }

  const lines = matching.slice(0, 10).map((item, i) => `${i + 1}. ${item.title}\n   ${item.url}`);
  return `🔍 "${keyword}" 검색 결과:\n\n${lines.join('\n\n')}`;
}

export async function handleMarket(
  marketCollectors: Collector[],
  cachedItems: NewsItem[],
): Promise<string> {
  // 캐시에서 시장 데이터 확인
  let marketItems = cachedItems.filter((i) => i.source === 'yahoo-finance');

  // 캐시에 없으면 실시간 조회
  if (marketItems.length === 0) {
    const { items } = await runCollectors(marketCollectors);
    marketItems = items;
  }

  if (marketItems.length === 0) {
    return '⚠️ 시장 데이터를 조회할 수 없습니다.';
  }

  return formatMarketSnapshot(marketItems);
}
