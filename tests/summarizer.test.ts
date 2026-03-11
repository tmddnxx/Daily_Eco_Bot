import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Summarizer } from '../src/summarizer.js';
import { exec } from 'node:child_process';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: 0 })),
    existsSync: vi.fn(() => false),
  };
});

const mockedExec = vi.mocked(exec);

describe('Summarizer', () => {
  let summarizer: Summarizer;

  beforeEach(() => {
    vi.clearAllMocks();
    summarizer = new Summarizer({ dailyLimit: 50, language: 'ko' });
  });

  it('should call claude CLI via file pipe and return summary', async () => {
    mockedExec.mockImplementation((_cmd, _opts, callback: any) => {
      callback(null, '오늘 코스피는 1.2% 상승했습니다.', '');
      return {} as any;
    });

    const result = await summarizer.summarize('뉴스 내용...');
    expect(result).toBe('오늘 코스피는 1.2% 상승했습니다.');
  });

  it('should return fallback on CLI failure', async () => {
    mockedExec.mockImplementation((_cmd, _opts, callback: any) => {
      callback(new Error('CLI not found'));
      return {} as any;
    });

    const result = await summarizer.summarize('뉴스 내용...');
    expect(result).toBeNull();
  });

  it('should respect daily limit', async () => {
    summarizer = new Summarizer({ dailyLimit: 1, language: 'ko' });

    mockedExec.mockImplementation((_cmd, _opts, callback: any) => {
      callback(null, 'summary', '');
      return {} as any;
    });

    await summarizer.summarize('first');
    const second = await summarizer.summarize('second');
    expect(second).toBeNull();
  });
});
