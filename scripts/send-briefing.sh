#!/bin/bash
# 전체 구독자에게 브리핑을 수동 발송하는 스크립트
# 사용법: ./scripts/send-briefing.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📢 전체 구독자에게 브리핑 발송 중..."

cd "$PROJECT_DIR"
node -e "
import 'dotenv/config';
import { join } from 'node:path';
import { loadConfig } from './dist/config.js';
import { JsonStore } from './dist/store/json-store.js';
import { Summarizer } from './dist/summarizer.js';
import { NaverNewsCollector } from './dist/collectors/naver-news.js';
import { RssFeedCollector } from './dist/collectors/rss-feed.js';
import { YahooFinanceCollector } from './dist/collectors/yahoo-finance.js';
import { runPipeline } from './dist/pipeline.js';
import { formatBriefing, splitMessage } from './dist/bot/formatter.js';
import TelegramBot from 'node-telegram-bot-api';

const configPath = join(import.meta.dirname, 'config.yaml');
const config = loadConfig(configPath);

const summarizer = new Summarizer({
  dailyLimit: config.summarizer.dailyLimit,
  language: config.summarizer.language,
});

const collectors = [];
if (config.sources['naver-news'].enabled) {
  collectors.push(new NaverNewsCollector({
    clientId: process.env.NAVER_CLIENT_ID || '',
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    categories: config.sources['naver-news'].categories,
  }));
}
if (config.sources.rss.enabled) {
  collectors.push(new RssFeedCollector({ feeds: config.sources.rss.feeds }));
}
if (config.sources['yahoo-finance'].enabled) {
  collectors.push(new YahooFinanceCollector({ symbols: config.sources['yahoo-finance'].symbols }));
}

const briefing = await runPipeline(collectors, summarizer);
const message = formatBriefing(briefing);
const chunks = splitMessage(message);

const bot = new TelegramBot(config.telegram.botToken);

for (const chatId of config.telegram.subscriberChatIds) {
  try {
    for (const chunk of chunks) {
      await bot.sendMessage(Number(chatId), chunk);
    }
    console.log('✅ 발송 완료 → ' + chatId);
  } catch (err) {
    console.error('❌ 발송 실패 → ' + chatId, err.message);
  }
}

process.exit(0);
"

echo "✅ 완료!"
