import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../src/pipeline.js';
import type { Collector } from '../src/collectors/base.js';
import type { NewsItem } from '../src/types.js';

describe('runPipeline', () => {
  it('should collect, aggregate, and summarize', async () => {
    const mockCollector: Collector = {
      name: 'mock',
      collect: vi.fn().mockResolvedValue([
        {
          id: 'test-1',
          title: '테스트 뉴스',
          summary: '테스트 요약',
          url: 'https://example.com',
          source: 'mock',
          category: 'kr-stock',
          publishedAt: new Date(),
        },
      ] as NewsItem[]),
    };

    const mockSummarizer = {
      summarize: vi.fn().mockResolvedValue('AI 요약 결과'),
      summarizeDetail: vi.fn(),
      getRemainingCalls: vi.fn().mockReturnValue(50),
    };

    const briefing = await runPipeline([mockCollector], mockSummarizer as any);
    expect(briefing.sections.length).toBeGreaterThan(0);
    expect(briefing.sections[0].items).toHaveLength(1);
  });

  it('should capture collector errors without failing', async () => {
    const failingCollector: Collector = {
      name: 'failing',
      collect: vi.fn().mockRejectedValue(new Error('API down')),
    };

    const mockSummarizer = {
      summarize: vi.fn().mockResolvedValue(null),
      summarizeDetail: vi.fn(),
      getRemainingCalls: vi.fn().mockReturnValue(50),
    };

    const briefing = await runPipeline([failingCollector], mockSummarizer as any);
    expect(briefing.errors).toContain('failing: API down');
    expect(briefing.sections).toHaveLength(0);
  });
});
