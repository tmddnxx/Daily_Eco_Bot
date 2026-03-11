import { describe, it, expect } from 'vitest';
import { formatBriefing, formatMarketSnapshot } from '../../src/bot/formatter.js';
import type { Briefing, BriefingSection, NewsItem } from '../../src/types.js';

function makeSection(category: string, items: Partial<NewsItem>[] = []): BriefingSection {
  return {
    category: category as any,
    label: category === 'kr-stock' ? '한국 주식' : '미국 주식',
    summary: '테스트 요약입니다.',
    items: items.map((item, i) => ({
      id: `item-${i}`,
      title: `뉴스 ${i + 1}`,
      summary: '요약',
      url: 'https://example.com',
      source: 'test',
      category: category as any,
      publishedAt: new Date(),
      ...item,
    })),
  };
}

describe('formatter', () => {
  it('should format briefing with sections', () => {
    const briefing: Briefing = {
      date: new Date('2026-03-10'),
      sections: [makeSection('kr-stock', [{ title: '삼성전자 상승' }])],
      errors: [],
    };

    const message = formatBriefing(briefing);
    expect(message).toContain('모닝 브리핑');
    expect(message).toContain('한국 주식');
    expect(message).toContain('삼성전자 상승');
  });

  it('should include error warnings', () => {
    const briefing: Briefing = {
      date: new Date('2026-03-10'),
      sections: [],
      errors: ['naver: API timeout'],
    };

    const message = formatBriefing(briefing);
    expect(message).toContain('naver');
  });
});
