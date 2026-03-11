/**
 * 텔레그램 봇 코어
 *
 * 봇의 핵심 클래스로, 다음을 담당합니다:
 * - 폴링 모드로 텔레그램 메시지 수신
 * - 명령어 라우팅 (/now, /search, /watch, /market, /cancel 등)
 * - 인라인 버튼 콜백 처리 (상세보기)
 * - 구독자 인증 (subscriberChatIds가 비어있으면 누구나 사용 가능)
 * - 타임아웃: 브리핑 생성이 2분 초과 시 자동 취소
 * - /cancel: 진행 중인 브리핑 생성을 즉시 취소
 * - 메시지 분할: 4096자 제한 초과 시 자동 분할 전송
 */
import TelegramBot from 'node-telegram-bot-api';
import type { AppConfig } from '../config.js';
import type { JsonStore } from '../store/json-store.js';
import type { Summarizer } from '../summarizer.js';
import type { Collector } from '../collectors/base.js';
import { runCollectors } from '../collectors/base.js';
import { runPipeline } from '../pipeline.js';
import {
  handleWatch, handleUnwatch, handleWatchlist,
  handleHistory, handleHelp, handleSettings,
  handleChatId, handleSearch, handleMarket,
} from './commands/index.js';
import { formatBriefing, formatNewsDetail, getInlineKeyboard, splitMessage } from './formatter.js';
import type { Briefing, NewsItem } from '../types.js';
import { logger } from '../logger.js';

/** 브리핑 생성 타임아웃 (2분) */
const BRIEFING_TIMEOUT_MS = 120_000;

export class MorningBriefingBot {
  private bot: TelegramBot;
  private config: AppConfig;
  private store: JsonStore;
  private summarizer: Summarizer;
  private collectors: Collector[];
  private lastBriefing: Briefing | null = null;
  /** 마지막으로 포맷된 브리핑 메시지 (캐시용) */
  private lastBriefingFormatted: string | null = null;
  private allItems: NewsItem[] = [];
  /** 현재 진행 중인 브리핑 작업 (chatId → AbortController) */
  private pendingTasks = new Map<number, AbortController>();
  /** 폴링 상태 체크 타이머 (잠자기 복귀 후 자동 재연결) */
  private pollHealthTimer: ReturnType<typeof setInterval>;

  constructor(
    config: AppConfig,
    store: JsonStore,
    summarizer: Summarizer,
    collectors: Collector[],
  ) {
    this.config = config;
    this.store = store;
    this.summarizer = summarizer;
    this.collectors = collectors;
    this.bot = new TelegramBot(config.telegram.botToken, {
      polling: {
        autoStart: true,
        params: { timeout: 30 },
      },
    });

    // 폴링 에러 시 자동 재연결 (잠자기 복귀 등)
    this.bot.on('polling_error', (err: any) => {
      logger.warn(`⚠️ 폴링 에러: ${err?.message || err}`);
    });
    this.bot.on('error', (err: any) => {
      logger.error(`❌ 봇 에러: ${err?.message || err}`);
    });

    // 네트워크 끊김 후 자동 복구: 30초마다 폴링 상태 체크
    this.pollHealthTimer = setInterval(() => {
      if (!this.bot.isPolling()) {
        logger.warn('🔄 폴링이 중단됨 — 재시작 시도');
        this.bot.startPolling().catch((e: any) => {
          logger.error(`❌ 폴링 재시작 실패: ${e?.message}`);
        });
      }
    }, 30_000);

    this.registerCommands();
    this.registerCallbacks();
    logger.info('🤖 텔레그램 봇 시작 (폴링 모드)');
  }

  private isAuthorized(chatId: number): boolean {
    const { subscriberChatIds } = this.config.telegram;
    if (subscriberChatIds.length === 0) return true;
    return subscriberChatIds.includes(String(chatId));
  }

  /** 미인증 사용자에게 안내 메시지 전송. 인증되었으면 true 반환 */
  private async checkAuth(chatId: number): Promise<boolean> {
    if (this.isAuthorized(chatId)) return true;
    await this.bot.sendMessage(chatId,
      '🔒 권한이 없습니다.\n\n' +
      '/chatid 로 본인의 Chat ID를 확인한 후 관리자에게 전달해주세요.\n' +
      '관리자가 등록을 완료하면 모든 명령어를 사용할 수 있습니다.'
    );
    return false;
  }

  /** 긴 메시지를 자동 분할하여 전송 */
  private async safeSendMessage(chatId: number, text: string, options?: TelegramBot.SendMessageOptions): Promise<void> {
    const chunks = splitMessage(text);
    for (let i = 0; i < chunks.length; i++) {
      // 인라인 키보드는 마지막 메시지에만 붙임
      const opts = i === chunks.length - 1 ? options : undefined;
      await this.bot.sendMessage(chatId, chunks[i], opts);
    }
  }

  /** 작업 취소 처리 */
  private cancelTask(chatId: number): boolean {
    const abort = this.pendingTasks.get(chatId);
    if (abort) {
      abort.abort();
      this.summarizer.cancel();
      this.pendingTasks.delete(chatId);
      return true;
    }
    return false;
  }

  private registerCommands(): void {
    // /start — 처음 입장 시 안내 메시지
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      if (this.isAuthorized(chatId)) {
        await this.bot.sendMessage(chatId,
          '👋 모닝 브리핑 봇에 오신 것을 환영합니다!\n\n' +
          '/now — 즉시 브리핑 받기\n' +
          '/market — 시장 현황\n' +
          '/help — 전체 명령어 보기'
        );
      } else {
        await this.bot.sendMessage(chatId,
          '👋 모닝 브리핑 봇에 오신 것을 환영합니다!\n\n' +
          '🔒 아직 등록되지 않은 사용자입니다.\n\n' +
          `📌 본인의 Chat ID: \`${chatId}\`\n\n` +
          '위 Chat ID를 관리자에게 전달해주세요.\n' +
          '등록이 완료되면 모든 명령어를 사용할 수 있습니다.',
          { parse_mode: 'Markdown' }
        );
      }
    });

    // /cancel — 진행 중인 작업 취소
    this.bot.onText(/\/cancel/, async (msg) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      if (this.cancelTask(msg.chat.id)) {
        await this.bot.sendMessage(msg.chat.id, '🛑 진행 중인 작업을 취소했습니다.');
      } else {
        await this.bot.sendMessage(msg.chat.id, '💤 현재 진행 중인 작업이 없습니다.');
      }
    });

    // /chatid — 누구나 사용 가능 (인증 불필요)
    this.bot.onText(/\/chatid/, async (msg) => {
      await this.bot.sendMessage(msg.chat.id, handleChatId(msg.chat.id), { parse_mode: 'Markdown' });
    });

    this.bot.onText(/\/now/, async (msg) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      const chatId = msg.chat.id;

      // 이미 진행 중이면 안내
      if (this.pendingTasks.has(chatId)) {
        await this.bot.sendMessage(chatId, '⏳ 이미 브리핑을 생성 중입니다. /cancel 로 취소할 수 있습니다.');
        return;
      }

      // 30분 이내 캐시된 요약이 있으면 바로 반환
      if (this.lastBriefingFormatted && this.summarizer.isCacheFresh()) {
        logger.info('📦 캐시된 브리핑 사용 (30분 이내)');
        await this.sendBriefing(chatId, this.lastBriefingFormatted);
        return;
      }

      await this.bot.sendMessage(chatId, '⏳ 브리핑을 생성 중입니다... (최대 2분, /cancel 로 취소)');

      const abort = new AbortController();
      this.pendingTasks.set(chatId, abort);

      // 타임아웃 설정
      const timeout = setTimeout(() => {
        this.cancelTask(chatId);
      }, BRIEFING_TIMEOUT_MS);

      try {
        const message = await this.runBriefingAndFormat(abort.signal);
        clearTimeout(timeout);
        this.pendingTasks.delete(chatId);

        if (abort.signal.aborted) {
          await this.bot.sendMessage(chatId, '🛑 브리핑 생성이 취소되었습니다.');
        } else {
          await this.sendBriefing(chatId, message);
        }
      } catch (error: any) {
        clearTimeout(timeout);
        this.pendingTasks.delete(chatId);

        if (error?.name === 'AbortError' || abort.signal.aborted) {
          await this.bot.sendMessage(chatId, '🛑 브리핑 생성이 취소되었습니다.');
        } else {
          logger.error({ error }, '❌ 브리핑 생성 실패');
          await this.bot.sendMessage(chatId, '⚠️ 브리핑 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        }
      }
    });

    this.bot.onText(/\/search (.+)/, async (msg, match) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      await this.bot.sendMessage(msg.chat.id, '🔍 검색 중...');
      try {
        const result = await handleSearch(match?.[1] || '', this.collectors, this.allItems);
        await this.safeSendMessage(msg.chat.id, result);
      } catch {
        await this.bot.sendMessage(msg.chat.id, '⚠️ 검색 중 오류가 발생했습니다.');
      }
    });

    this.bot.onText(/\/watch (.+)/, async (msg, match) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      await this.bot.sendMessage(msg.chat.id, handleWatch(match?.[1] || '', this.store));
    });

    this.bot.onText(/\/unwatch (.+)/, async (msg, match) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      await this.bot.sendMessage(msg.chat.id, handleUnwatch(match?.[1] || '', this.store));
    });

    this.bot.onText(/\/watchlist/, async (msg) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      await this.bot.sendMessage(msg.chat.id, handleWatchlist(this.store));
    });

    this.bot.onText(/\/market/, async (msg) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      await this.bot.sendMessage(msg.chat.id, '⏳ 시장 데이터 조회 중...');
      try {
        const marketCollectors = this.collectors.filter((c) => c.name === 'yahoo-finance');
        const result = await handleMarket(marketCollectors, this.allItems);
        await this.bot.sendMessage(msg.chat.id, result);
      } catch {
        await this.bot.sendMessage(msg.chat.id, '⚠️ 시장 데이터를 조회할 수 없습니다.');
      }
    });

    this.bot.onText(/\/history\s*(\d*)/, async (msg, match) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      const n = parseInt(match?.[1] || '3', 10);
      await this.safeSendMessage(msg.chat.id, handleHistory(n, this.store));
    });

    this.bot.onText(/\/settings/, async (msg) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      await this.bot.sendMessage(msg.chat.id, handleSettings(
        this.config,
        this.summarizer.getRemainingCalls(),
        this.store.getWatchlist().length,
      ));
    });

    // /broadcast — 관리자 전용: 전체 구독자에게 브리핑 발송
    this.bot.onText(/\/broadcast/, async (msg) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      const chatId = msg.chat.id;

      // 첫 번째 등록된 구독자만 관리자로 허용
      const adminId = this.config.telegram.subscriberChatIds[0];
      if (String(chatId) !== adminId) {
        await this.bot.sendMessage(chatId, '🔒 관리자만 사용할 수 있는 명령어입니다.');
        return;
      }

      await this.bot.sendMessage(chatId, '📢 전체 구독자에게 브리핑을 발송합니다...');
      try {
        await this.sendScheduledBriefing();
        await this.bot.sendMessage(chatId, '✅ 전체 구독자에게 브리핑 발송 완료!');
      } catch (error: any) {
        logger.error({ error }, '❌ 브로드캐스트 실패');
        await this.bot.sendMessage(chatId, '⚠️ 브리핑 발송 중 오류가 발생했습니다.');
      }
    });

    this.bot.onText(/\/help/, async (msg) => {
      if (!(await this.checkAuth(msg.chat.id))) return;
      await this.bot.sendMessage(msg.chat.id, handleHelp());
    });
  }

  private registerCallbacks(): void {
    this.bot.on('callback_query', async (query) => {
      if (!query.data || !query.message) return;
      if (!(await this.checkAuth(query.message.chat.id))) return;

      if (query.data.startsWith('detail:')) {
        const newsId = query.data.replace('detail:', '');
        await this.bot.answerCallbackQuery(query.id, { text: '상세 정보 로딩 중...' });
        await this.sendDetail(query.message.chat.id, newsId);
      }
    });
  }

  private async sendDetail(chatId: number, newsId: string): Promise<void> {
    const item = this.allItems.find((i) => i.id === newsId);
    if (!item) {
      await this.bot.sendMessage(chatId, '⚠️ 해당 뉴스를 찾을 수 없습니다.');
      return;
    }

    const cached = this.store.getCachedDetail(newsId);
    if (cached) {
      await this.safeSendMessage(chatId, formatNewsDetail(item, cached));
      return;
    }

    const detail = await this.summarizer.summarizeDetail(
      `제목: ${item.title}\n요약: ${item.summary}\nURL: ${item.url}`
    );

    if (detail) {
      this.store.cacheDetail(newsId, detail);
      await this.safeSendMessage(chatId, formatNewsDetail(item, detail));
    } else {
      await this.safeSendMessage(chatId, formatNewsDetail(item, item.summary + '\n\n(AI 상세 요약을 생성할 수 없습니다.)'));
    }
  }

  async runBriefingAndFormat(signal?: AbortSignal): Promise<string> {
    const briefing = await runPipeline(this.collectors, this.summarizer);

    // 취소 확인
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    this.lastBriefing = briefing;
    this.allItems = briefing.sections.flatMap((s) => s.items);

    const formatted = formatBriefing(briefing);
    this.lastBriefingFormatted = formatted;
    this.store.saveHistory({
      date: new Date().toISOString().slice(0, 10),
      content: formatted,
    });

    this.store.pruneCache(30);
    this.store.pruneHistory(90);
    this.summarizer.cleanupTmpFiles();

    return formatted;
  }

  async sendBriefing(chatId: number, message: string): Promise<void> {
    const allItems = this.lastBriefing?.sections.flatMap((s) => s.items) || [];
    const keyboard = getInlineKeyboard(allItems);

    await this.safeSendMessage(chatId, message, {
      reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
    });
  }

  async sendScheduledBriefing(): Promise<void> {
    const subscriberIds = this.config.telegram.subscriberChatIds;
    if (subscriberIds.length === 0) {
      logger.warn('⚠️ 구독자가 없어 예약 브리핑을 건너뜁니다');
      return;
    }

    const message = await this.runBriefingAndFormat();

    for (const chatId of subscriberIds) {
      try {
        await this.sendBriefing(Number(chatId), message);
        logger.info(`📨 브리핑 전송 완료 → ${chatId}`);
      } catch (error) {
        logger.error({ chatId, error }, `❌ 브리핑 전송 실패 → ${chatId}`);
      }
    }
  }

  async checkWatchKeywords(): Promise<void> {
    const watchlist = this.store.getWatchlist();
    if (watchlist.length === 0) return;

    const { items: freshItems } = await runCollectors(this.collectors);
    this.allItems = freshItems;

    const subscriberIds = this.config.telegram.subscriberChatIds;

    for (const keyword of watchlist) {
      const matching = freshItems.filter(
        (item) => !this.store.isSent(item.id) &&
          (item.title.includes(keyword) || item.summary.includes(keyword))
      );

      for (const item of matching) {
        for (const chatId of subscriberIds) {
          try {
            await this.bot.sendMessage(Number(chatId),
              `🔔 관심 키워드 알림: "${keyword}"\n\n📰 ${item.title}\n${item.summary}\n\n🔗 ${item.url}`
            );
          } catch (error) {
            logger.error({ chatId, error }, `❌ 관심 키워드 알림 전송 실패 → ${chatId}`);
          }
        }
        this.store.markSent(item.id);
      }
    }
  }

  stop(): void {
    clearInterval(this.pollHealthTimer);
    this.bot.stopPolling();
    logger.info('👋 텔레그램 봇 종료');
  }
}
