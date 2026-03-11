/**
 * 스케줄러
 *
 * node-cron을 사용하여 두 가지 반복 작업을 등록합니다:
 * 1. 매일 브리핑: config.yaml의 schedule.time(기본 07:00) 시간에 전체 파이프라인 실행
 * 2. 관심 키워드 체크: watch.checkInterval(기본 30분)마다 새 뉴스 확인 후 알림
 *
 * 모든 스케줄은 config.yaml의 timezone(기본 Asia/Seoul) 기준입니다.
 */
import cron from 'node-cron';
import type { MorningBriefingBot } from './bot/telegram.js';
import type { AppConfig } from './config.js';
import { logger } from './logger.js';

export function setupScheduler(bot: MorningBriefingBot, config: AppConfig): void {
  const [hour, minute] = config.schedule.time.split(':');

  // 매일 브리핑
  cron.schedule(`${minute} ${hour} * * *`, async () => {
    logger.info('⏰ 예약 브리핑 시작');
    try {
      await bot.sendScheduledBriefing();
    } catch (error) {
      logger.error({ error }, '❌ 예약 브리핑 실패');
    }
  }, { timezone: config.schedule.timezone });

  logger.info(`📅 매일 ${config.schedule.time} (${config.schedule.timezone}) 브리핑 예약됨`);

  // Watch 키워드 체크
  const watchInterval = config.watch.checkInterval;
  cron.schedule(`*/${watchInterval} * * * *`, async () => {
    logger.info('👀 관심 키워드 체크 시작');
    try {
      await bot.checkWatchKeywords();
    } catch (error) {
      logger.error({ error }, '❌ 관심 키워드 체크 실패');
    }
  }, { timezone: config.schedule.timezone });

  logger.info(`👀 ${watchInterval}분마다 관심 키워드 체크 예약됨`);
}
