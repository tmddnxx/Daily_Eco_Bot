/**
 * 설정 로더
 *
 * config.yaml 파일과 .env 환경변수를 읽어 AppConfig 객체를 생성합니다.
 * - YAML: 스케줄, 소스 설정, watch 간격 등 일반 설정
 * - .env: TELEGRAM_BOT_TOKEN, NAVER_CLIENT_ID 등 민감한 시크릿
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import 'dotenv/config';

export interface AppConfig {
  schedule: {
    time: string;
    timezone: string;
  };
  telegram: {
    botToken: string;
    subscriberChatIds: string[];
  };
  summarizer: {
    tool: string;
    language: string;
    briefingStyle: 'concise' | 'detailed';
    dailyLimit: number;
    cacheDetailSummary: boolean;
  };
  sources: {
    'naver-news': { enabled: boolean; categories: string[] };
    rss: { enabled: boolean; feeds: { name: string; url: string }[] };
    'yahoo-finance': { enabled: boolean; symbols: string[] };
    'web-scraper': { enabled: boolean };
  };
  watch: {
    checkInterval: number;
  };
}

export function loadConfig(configPath: string): AppConfig {
  const raw = readFileSync(configPath, 'utf-8');
  const yaml = parse(raw) as Omit<AppConfig, 'telegram'> & { telegram: Partial<AppConfig['telegram']> };

  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const subscriberChatIds = yaml.telegram?.subscriberChatIds || [];

  return {
    ...yaml,
    telegram: {
      botToken,
      subscriberChatIds,
    },
  } as AppConfig;
}
