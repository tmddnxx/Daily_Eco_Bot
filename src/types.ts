/**
 * 공통 타입 정의
 *
 * 프로젝트 전역에서 사용하는 핵심 타입들을 정의합니다.
 * - NewsCategory: 뉴스를 4가지 카테고리로 분류 (한국주식, 미국주식, AI/Tech, 매크로)
 * - NewsItem: 수집된 개별 뉴스 항목
 * - BriefingSection: 카테고리별로 그룹핑된 브리핑 섹션
 * - Briefing: 최종 브리핑 결과물 (섹션 배열 + 에러 목록)
 * - createNewsItemId: 소스+URL로 뉴스 고유 ID 생성 (중복 감지용)
 */
import { createHash } from 'node:crypto';

/** 뉴스 카테고리: 한국주식 | 미국주식 | AI/Tech | 매크로/경제 */
export type NewsCategory = 'kr-stock' | 'us-stock' | 'ai-tech' | 'macro';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: NewsCategory;
  publishedAt: Date;
}

export interface BriefingSection {
  category: NewsCategory;
  label: string;
  summary: string;
  items: NewsItem[];
}

export interface Briefing {
  date: Date;
  sections: BriefingSection[];
  errors: string[];
}

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  'kr-stock': '한국 주식',
  'us-stock': '미국 주식',
  'ai-tech': 'AI/Tech',
  'macro': '매크로/경제',
};

export const CATEGORY_ORDER: NewsCategory[] = ['kr-stock', 'us-stock', 'ai-tech', 'macro'];

export function createNewsItemId(source: string, url: string): string {
  return createHash('sha256').update(`${source}:${url}`).digest('hex').slice(0, 16);
}
