/**
 * 뉴스 파이프라인
 *
 * 브리핑 생성의 전체 흐름을 조율합니다:
 * 1. 수집 (Collectors) → 모든 소스에서 병렬로 뉴스 수집
 * 2. 통합 (Aggregator) → 중복 제거, 카테고리별 그룹핑, 정렬
 * 3. 요약 (Summarizer) → Claude CLI로 카테고리별 요약 생성
 * 4. 결과 (Briefing) → 섹션 배열 + 에러 목록으로 반환
 */
import type { Collector } from './collectors/base.js';
import { runCollectors } from './collectors/base.js';
import { aggregate } from './aggregator.js';
import type { Summarizer } from './summarizer.js';
import type { Briefing, BriefingSection } from './types.js';
import { logger } from './logger.js';

const CATEGORY_LABELS: Record<string, string> = {
  'kr-stock': '한국 주식',
  'us-stock': '미국 주식',
  'ai-tech': 'AI/Tech',
  'macro': '매크로/경제',
};

export async function runPipeline(collectors: Collector[], summarizer: Summarizer): Promise<Briefing> {
  logger.info('📡 뉴스 수집 파이프라인 시작');

  // 1. 수집
  const { items, errors } = await runCollectors(collectors);
  logger.info(`📰 뉴스 ${items.length}건 수집 완료 (실패: ${errors.length}건)`);

  // 2. 통합
  const grouped = aggregate(items);

  // 3. 요약
  const sections: BriefingSection[] = [];

  for (const [category, categoryItems] of grouped) {
    // 뉴스 텍스트를 최대 3000자로 제한 (Claude CLI 입력 크기 관리)
    const newsText = categoryItems
      .map((item) => `- ${item.title}: ${item.summary.slice(0, 100)}`)
      .join('\n')
      .slice(0, 3000);

    let summary: string | null = null;
    try {
      summary = await summarizer.summarize(newsText, undefined, category);
    } catch (err: any) {
      logger.error(`❌ ${CATEGORY_LABELS[category]} 요약 실패: ${err?.message || err}`);
      errors.push(`${CATEGORY_LABELS[category]} 요약 실패`);
    }

    sections.push({
      category,
      label: CATEGORY_LABELS[category] || category,
      summary: summary || categoryItems.slice(0, 5).map((i) => `• ${i.title}`).join('\n'),
      items: categoryItems,
    });
  }

  logger.info(`🤖 AI 요약 완료 (${sections.length}개 카테고리)`);

  return {
    date: new Date(),
    sections,
    errors,
  };
}
