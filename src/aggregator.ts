/**
 * 뉴스 통합기 (Aggregator)
 *
 * 여러 Collector에서 수집된 뉴스를 하나로 합치는 역할을 합니다:
 * 1. 동일 ID 기준 중복 제거 (먼저 수집된 것 우선)
 * 2. 카테고리별로 그룹핑
 * 3. 각 카테고리 내에서 최신순 정렬
 * 4. 카테고리당 최대 10건으로 제한
 */
import type { NewsItem, NewsCategory } from './types.js';

export function aggregate(items: NewsItem[]): Map<NewsCategory, NewsItem[]> {
  const seen = new Set<string>();
  const grouped = new Map<NewsCategory, NewsItem[]>();

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const list = grouped.get(item.category) || [];
    list.push(item);
    grouped.set(item.category, list);
  }

  for (const [category, list] of grouped) {
    list.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    grouped.set(category, list.slice(0, 10));
  }

  return grouped;
}
