/**
 * Collector 베이스 인터페이스
 *
 * 모든 뉴스 수집기가 구현해야 하는 인터페이스를 정의합니다.
 * runCollectors()는 여러 Collector를 병렬로 실행하고,
 * 개별 실패가 전체를 중단시키지 않도록 Promise.allSettled를 사용합니다.
 */
import type { NewsItem } from '../types.js';

export interface Collector {
  name: string;
  collect(): Promise<NewsItem[]>;
}

export async function runCollectors(collectors: Collector[]): Promise<{ items: NewsItem[]; errors: string[] }> {
  const results = await Promise.allSettled(collectors.map((c) => c.collect()));
  const items: NewsItem[] = [];
  const errors: string[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      errors.push(`${collectors[i].name}: ${result.reason?.message || 'Unknown error'}`);
    }
  });

  return { items, errors };
}
