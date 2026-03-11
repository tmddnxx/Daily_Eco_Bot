/**
 * Morning Briefing 봇 엔트리포인트
 *
 * 이 파일은 앱의 시작점으로, 다음을 수행합니다:
 * 1. 환경변수(.env)와 설정파일(config.yaml) 로드
 * 2. JSON 스토어(파일 기반 DB) 초기화
 * 3. Claude CLI 요약기 초기화
 * 4. 활성화된 뉴스 수집기(Collector)들을 생성
 * 5. 텔레그램 봇 시작 (폴링 모드)
 * 6. 스케줄러로 매일 아침 브리핑 + 관심 키워드 주기적 체크 등록
 * 7. SIGINT/SIGTERM 시 안전하게 종료
 */
import 'dotenv/config';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { JsonStore } from './store/json-store.js';
import { Summarizer } from './summarizer.js';
import { NaverNewsCollector } from './collectors/naver-news.js';
import { RssFeedCollector } from './collectors/rss-feed.js';
import { YahooFinanceCollector } from './collectors/yahoo-finance.js';
import { WebScraperCollector } from './collectors/web-scraper.js';
import { MorningBriefingBot } from './bot/telegram.js';
import { setupScheduler } from './scheduler.js';
import type { Collector } from './collectors/base.js';

// 설정 로드
const configPath = join(import.meta.dirname, '..', 'config.yaml');
const config = loadConfig(configPath);

// JSON 파일 기반 저장소 (watchlist, history, cache 등)
const storeDir = join(import.meta.dirname, 'store');
const store = new JsonStore(storeDir);

// Claude CLI를 이용한 뉴스 요약기
const summarizer = new Summarizer({
  dailyLimit: config.summarizer.dailyLimit,
  language: config.summarizer.language,
});

// 활성화된 뉴스 수집기만 등록
const collectors: Collector[] = [];

if (config.sources['naver-news'].enabled) {
  collectors.push(new NaverNewsCollector({
    clientId: process.env.NAVER_CLIENT_ID || '',
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    categories: config.sources['naver-news'].categories,
  }));
}

if (config.sources.rss.enabled) {
  collectors.push(new RssFeedCollector({
    feeds: config.sources.rss.feeds,
  }));
}

if (config.sources['yahoo-finance'].enabled) {
  collectors.push(new YahooFinanceCollector({
    symbols: config.sources['yahoo-finance'].symbols,
  }));
}

if (config.sources['web-scraper'].enabled) {
  collectors.push(new WebScraperCollector());
}

// 텔레그램 봇 시작 (폴링 모드로 메시지 수신 대기)
const bot = new MorningBriefingBot(config, store, summarizer, collectors);

// node-cron으로 매일 브리핑 + 관심 키워드 체크 스케줄 등록
setupScheduler(bot, config);

logger.info(`🚀 Morning Briefing 시작 — 활성 소스: ${collectors.map((c) => c.name).join(', ')}`);

// 프로세스 종료 시 봇 정리
process.on('SIGINT', () => {
  logger.info('👋 봇 종료 중...');
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('👋 봇 종료 중...');
  bot.stop();
  process.exit(0);
});
