/**
 * Claude CLI 요약 엔진 (파일 기반)
 *
 * Claude CLI를 호출하여 뉴스를 요약합니다.
 * - tmp/ 폴더에 프롬프트 파일(prompt-*.txt)을 생성
 * - Claude CLI가 프롬프트 파일을 읽어서 요약 파일(summary-*.txt)에 저장
 * - 요약 파일은 30분간 캐시로 유지 → /now 요청 시 재활용
 * - 일일 호출 횟수 제한 (dailyLimit)으로 API 비용 관리
 * - 자정 기준 자동 리셋
 * - AbortController로 외부에서 취소 가능
 */
import { exec } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

/** launchd 등 제한된 PATH 환경에서도 claude CLI를 찾기 위한 후보 경로 */
const CLAUDE_PATHS = [
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
  `${process.env.HOME}/.local/bin/claude`,
  `${process.env.HOME}/.claude/local/claude`,
];

function findClaudePath(): string {
  for (const p of CLAUDE_PATHS) {
    if (existsSync(p)) return p;
  }
  return 'claude';
}

/** 프롬프트/요약 파일을 저장할 디렉토리 */
const TMP_DIR = join(import.meta.dirname, '..', 'tmp');

/** 요약 캐시 유효 시간 (30분, 밀리초) */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** tmp 디렉토리가 없으면 생성 */
function ensureTmpDir(): void {
  mkdirSync(TMP_DIR, { recursive: true });
}

/** 파일명에 사용할 수 있도록 카테고리 이름 정리 */
function sanitizeCategory(category: string): string {
  return category.replace(/[^a-zA-Z0-9-_]/g, '_');
}

interface SummarizerConfig {
  dailyLimit: number;
  language: string;
}

export class Summarizer {
  private config: SummarizerConfig;
  private callCount = 0;
  private lastResetDate = new Date().toISOString().slice(0, 10);
  private claudePath: string;
  private currentAbort: AbortController | null = null;

  constructor(config: SummarizerConfig) {
    this.config = config;
    this.claudePath = findClaudePath();
    ensureTmpDir();
    logger.info(`🔧 Claude CLI 경로: ${this.claudePath}`);
  }

  private resetIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastResetDate) {
      this.callCount = 0;
      this.lastResetDate = today;
    }
  }

  /** 진행 중인 요약 작업을 취소 */
  cancel(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
      logger.info('🛑 AI 요약 작업 취소됨');
    }
  }

  /**
   * 캐시된 요약 파일이 있고 30분 이내이면 반환
   * @param category 카테고리 키 (예: 'kr-stock')
   * @returns 캐시된 요약 텍스트 또는 null
   */
  getCachedSummary(category: string): string | null {
    const summaryFile = join(TMP_DIR, `summary-${sanitizeCategory(category)}.txt`);
    if (!existsSync(summaryFile)) return null;

    const stat = statSync(summaryFile);
    const age = Date.now() - stat.mtimeMs;

    if (age < CACHE_TTL_MS) {
      logger.debug(`📦 캐시 사용 (${category}, ${Math.round(age / 1000)}초 전)`);
      return readFileSync(summaryFile, 'utf-8');
    }

    return null;
  }

  /** 모든 카테고리의 캐시가 유효한지 확인 */
  isCacheFresh(): boolean {
    try {
      const files = readdirSync(TMP_DIR).filter(f => f.startsWith('summary-'));
      if (files.length === 0) return false;

      return files.every(f => {
        const stat = statSync(join(TMP_DIR, f));
        return (Date.now() - stat.mtimeMs) < CACHE_TTL_MS;
      });
    } catch {
      return false;
    }
  }

  /**
   * Claude CLI를 파일 기반으로 호출
   * 1. tmp/prompt-{category}.txt에 프롬프트 저장
   * 2. cat으로 파일을 읽어 claude CLI에 stdin 파이프
   * 3. tmp/summary-{category}.txt에 결과 저장
   */
  private runClaude(input: string, category: string, abort: AbortController): Promise<string> {
    const safeCategory = sanitizeCategory(category);
    const promptFile = join(TMP_DIR, `prompt-${safeCategory}.txt`);
    const summaryFile = join(TMP_DIR, `summary-${safeCategory}.txt`);

    // 1. 프롬프트를 파일로 저장
    writeFileSync(promptFile, input, 'utf-8');
    logger.debug(`📝 프롬프트 파일 생성: ${promptFile}`);

    return new Promise((resolve, reject) => {
      // 2. cat으로 프롬프트 파일을 읽어 claude stdin으로 파이프
      const cmd = `cat "${promptFile}" | "${this.claudePath}" -p - --output-format text 2>/dev/null`;

      exec(cmd, {
        timeout: 120000,
        signal: abort.signal,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, ANTHROPIC_LOG: '' },
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        const result = stdout.trim();

        // 3. 요약 결과를 파일로 저장 (캐시)
        try {
          writeFileSync(summaryFile, result, 'utf-8');
          logger.debug(`💾 요약 파일 저장: ${summaryFile}`);
        } catch (writeErr: any) {
          logger.warn(`⚠️ 요약 파일 저장 실패: ${writeErr?.message}`);
        }

        resolve(result);
      });
    });
  }

  async summarize(content: string, prompt?: string, category?: string): Promise<string | null> {
    this.resetIfNewDay();

    // 카테고리가 있으면 캐시 확인
    if (category) {
      const cached = this.getCachedSummary(category);
      if (cached) {
        logger.info(`📦 캐시된 요약 사용: ${category}`);
        return cached;
      }
    }

    if (this.callCount >= this.config.dailyLimit) {
      logger.warn('⚠️ Claude CLI 일일 호출 한도 초과');
      return null;
    }

    const systemPrompt = prompt ||
      `당신은 금융/기술 뉴스 요약 전문가입니다. 다음 뉴스를 ${this.config.language === 'ko' ? '한국어' : 'English'}로 간결하게 요약해주세요. 핵심 포인트만 3-5줄로 정리하세요.`;

    const fullInput = `${systemPrompt}\n\n${content}`;

    const abort = new AbortController();
    this.currentAbort = abort;

    const categoryKey = category || 'default';

    try {
      const result = await this.runClaude(fullInput, categoryKey, abort);
      this.callCount++;
      return result;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        logger.info('🛑 Claude CLI 호출 취소됨');
        return null;
      }
      logger.error({ error: error?.message || error }, '❌ Claude CLI 호출 실패');
      return null;
    } finally {
      this.currentAbort = null;
    }
  }

  async summarizeDetail(content: string): Promise<string | null> {
    const prompt = `당신은 금융/기술 뉴스 분석가입니다. 다음 뉴스를 상세하게 분석해주세요.
포함할 내용: 1) 핵심 내용 2) 배경 및 맥락 3) 시장 영향 4) 투자 시사점
한국어로 작성하세요.`;
    return this.summarize(content, prompt);
  }

  /** 오래된 임시 파일 정리 (1시간 이상 된 파일 삭제) */
  cleanupTmpFiles(): void {
    try {
      const files = readdirSync(TMP_DIR);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      for (const file of files) {
        const filePath = join(TMP_DIR, file);
        const stat = statSync(filePath);
        if (stat.mtimeMs < oneHourAgo) {
          unlinkSync(filePath);
          logger.debug(`🗑️ 오래된 임시 파일 삭제: ${file}`);
        }
      }
    } catch {
      /* 무시 */
    }
  }

  getRemainingCalls(): number {
    this.resetIfNewDay();
    return this.config.dailyLimit - this.callCount;
  }
}
