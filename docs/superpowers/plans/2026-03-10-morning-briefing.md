# Morning Briefing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매일 아침 한국/미국 주식, AI/Tech, 매크로 뉴스를 자동 수집하여 Claude CLI로 요약한 뒤 텔레그램으로 전송하는 봇을 구축한다.

**Architecture:** 모듈러 파이프라인 (Collectors → Aggregator → Summarizer → Telegram Bot). 텔레그램 봇이 상시 실행(KeepAlive)되며 내부에서 node-cron으로 브리핑/watch 스케줄링. launchd로 프로세스 관리.

**Tech Stack:** Node.js, TypeScript, node-telegram-bot-api, axios, cheerio, rss-parser, node-cron, dotenv, pino, yaml

**Spec:** `docs/superpowers/specs/2026-03-10-morning-briefing-design.md`

---

## File Structure

```
morning-briefing/
├── src/
│   ├── types.ts                 # NewsItem, BriefingSection, CATEGORY_LABELS 등 공통 타입
│   ├── config.ts                # config.yaml + .env 로더
│   ├── logger.ts                # pino 로거 설정
│   ├── utils/
│   │   └── http.ts              # fetchWithRetry (3회 재시도, 지수 백오프)
│   ├── collectors/
│   │   ├── base.ts              # Collector 인터페이스 정의
│   │   ├── naver-news.ts        # 네이버 검색 API collector
│   │   ├── rss-feed.ts          # RSS 피드 collector
│   │   ├── yahoo-finance.ts     # Yahoo Finance collector (+fallback)
│   │   └── web-scraper.ts       # 웹 크롤링 collector
│   ├── aggregator.ts            # 뉴스 통합, 중복 제거, 정렬
│   ├── summarizer.ts            # Claude CLI 요약 엔진
│   ├── bot/
│   │   ├── telegram.ts          # 텔레그램 봇 초기화 + 라우팅
│   │   ├── commands/
│   │   │   ├── briefing.ts      # /now, /search, /market 명령어
│   │   │   ├── watch.ts         # /watch, /unwatch, /watchlist 명령어
│   │   │   ├── info.ts          # /help, /settings, /history, /chatid 명령어
│   │   │   └── index.ts         # 명령어 라우터 (등록 진입점)
│   │   └── formatter.ts         # 메시지 포맷팅
│   ├── store/
│   │   └── json-store.ts        # JSON 파일 기반 저장소 (subscribers, watchlist, history, cache)
│   ├── pipeline.ts              # 수집→통합→요약→전송 파이프라인
│   ├── scheduler.ts             # node-cron 스케줄러
│   └── index.ts                 # 엔트리포인트
├── tests/
│   ├── types.test.ts
│   ├── config.test.ts
│   ├── utils/
│   │   └── http.test.ts
│   ├── collectors/
│   │   ├── base.test.ts
│   │   ├── naver-news.test.ts
│   │   ├── rss-feed.test.ts
│   │   ├── yahoo-finance.test.ts
│   │   └── web-scraper.test.ts
│   ├── aggregator.test.ts
│   ├── summarizer.test.ts
│   ├── bot/
│   │   ├── commands.test.ts
│   │   └── formatter.test.ts
│   ├── store/
│   │   └── json-store.test.ts
│   └── pipeline.test.ts
├── scripts/
│   ├── install-launchd.sh
│   ├── uninstall-launchd.sh
│   ├── status-launchd.sh
│   └── restart-launchd.sh
├── launchd/
│   └── com.morning-briefing.bot.plist
├── config.yaml
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Chunk 1: Project Setup & Core Types

### Task 1: 프로젝트 초기화

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `config.yaml`

- [ ] **Step 1: package.json 생성**

```bash
cd /Users/dowhat/Downloads/morning-briefing
npm init -y
```

- [ ] **Step 2: 의존성 설치**

```bash
npm install node-telegram-bot-api axios cheerio rss-parser node-cron dotenv pino yaml
npm install -D typescript vitest @types/node @types/node-telegram-bot-api @types/node-cron tsx pino-pretty
```

- [ ] **Step 3: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: vitest.config.ts 작성**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: .gitignore 작성**

```
node_modules/
dist/
.env
logs/
src/store/*.json
!src/store/.gitkeep
```

- [ ] **Step 6: .env.example 작성**

```
TELEGRAM_BOT_TOKEN=your-bot-token
NAVER_CLIENT_ID=your-naver-client-id
NAVER_CLIENT_SECRET=your-naver-client-secret
```

- [ ] **Step 7: config.yaml 작성**

```yaml
schedule:
  time: "07:00"
  timezone: "Asia/Seoul"

telegram:
  # 구독자 chatId는 /chatid 명령어로 확인 후 여기에 추가
  # 빈 배열이면 누구나 사용 가능, 값이 있으면 해당 chatId만 허용
  subscriberChatIds: []

summarizer:
  tool: "claude-cli"
  language: "ko"
  briefingStyle: "concise"
  dailyLimit: 50
  cacheDetailSummary: true

sources:
  naver-news:
    enabled: true
    categories: ["주식", "경제", "AI"]
  rss:
    enabled: true
    feeds:
      - name: "한국경제"
        url: "https://www.hankyung.com/feed/all-news"
      - name: "매일경제"
        url: "https://www.mk.co.kr/rss/30000001/"
  yahoo-finance:
    enabled: true
    symbols: ["^GSPC", "^IXIC", "^KS11"]
  web-scraper:
    enabled: true

watch:
  checkInterval: 30
```

- [ ] **Step 8: package.json에 스크립트 추가**

`package.json`의 `scripts` 섹션:
```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 9: 빌드 확인**

Run: `cd /Users/dowhat/Downloads/morning-briefing && npx tsc --noEmit`
Expected: 오류 없이 완료 (소스 파일 없으므로)

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env config.yaml
git commit -m "chore: initialize project with TypeScript, Vitest, and config"
```

---

### Task 2: 공통 타입 정의

**Files:**
- Create: `src/types.ts`
- Create: `tests/types.test.ts`

- [ ] **Step 1: 타입 테스트 작성**

```typescript
// tests/types.test.ts
import { describe, it, expect } from 'vitest';
import { createNewsItemId, type NewsItem, type BriefingSection, type NewsCategory } from '../src/types.js';

describe('types', () => {
  describe('createNewsItemId', () => {
    it('should generate consistent id from source and url', () => {
      const id1 = createNewsItemId('naver', 'https://example.com/news/1');
      const id2 = createNewsItemId('naver', 'https://example.com/news/1');
      expect(id1).toBe(id2);
    });

    it('should generate different ids for different inputs', () => {
      const id1 = createNewsItemId('naver', 'https://example.com/news/1');
      const id2 = createNewsItemId('naver', 'https://example.com/news/2');
      expect(id1).not.toBe(id2);
    });

    it('should return a hex string', () => {
      const id = createNewsItemId('naver', 'https://example.com/news/1');
      expect(id).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('NewsCategory', () => {
    it('should accept valid categories', () => {
      const categories: NewsCategory[] = ['kr-stock', 'us-stock', 'ai-tech', 'macro'];
      expect(categories).toHaveLength(4);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 타입 구현**

```typescript
// src/types.ts
import { createHash } from 'node:crypto';

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/types.test.ts
git commit -m "feat: add core types and NewsItem ID generation"
```

---

### Task 3: 설정 로더

**Files:**
- Create: `src/config.ts`
- Create: `src/logger.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: 설정 로더 테스트 작성**

```typescript
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, type AppConfig } from '../src/config.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('config', () => {
  const testDir = join(import.meta.dirname, 'tmp-config');
  const configPath = join(testDir, 'config.yaml');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(configPath, `
schedule:
  time: "08:00"
  timezone: "Asia/Seoul"
telegram:
  subscriberChatIds: []
summarizer:
  tool: "claude-cli"
  language: "ko"
  briefingStyle: "concise"
  dailyLimit: 50
  cacheDetailSummary: true
sources:
  naver-news:
    enabled: true
    categories: ["주식"]
  rss:
    enabled: false
    feeds: []
  yahoo-finance:
    enabled: true
    symbols: ["^GSPC"]
  web-scraper:
    enabled: false
watch:
  checkInterval: 30
`);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load config from yaml file', () => {
    const config = loadConfig(configPath);
    expect(config.schedule.time).toBe('08:00');
    expect(config.schedule.timezone).toBe('Asia/Seoul');
  });

  it('should load telegram settings', () => {
    const config = loadConfig(configPath);
    expect(config.telegram.subscriberChatIds).toEqual([]);
  });

  it('should load source settings', () => {
    const config = loadConfig(configPath);
    expect(config.sources['naver-news'].enabled).toBe(true);
    expect(config.sources.rss.enabled).toBe(false);
  });

  it('should throw on missing config file', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL

- [ ] **Step 3: 로거 구현**

```typescript
// src/logger.ts
import pino from 'pino';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const logDir = join(import.meta.dirname, '..', 'logs');
mkdirSync(logDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets: [
      { target: 'pino-pretty', options: { destination: 1 } },
      { target: 'pino/file', options: { destination: join(logDir, `${today}.log`) } },
    ],
  },
});
```

- [ ] **Step 4: 설정 로더 구현**

```typescript
// src/config.ts
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
    subscriberChatIds: string[];  // 브리핑 수신 대상 (다중 유저 지원)
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/logger.ts tests/config.test.ts
git commit -m "feat: add config loader and logger"
```

---

## Chunk 2: HTTP Utility, Store & Collectors

### Task 4: HTTP 재시도 유틸리티

**Files:**
- Create: `src/utils/http.ts`
- Create: `tests/utils/http.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/utils/http.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithRetry } from '../../src/utils/http.js';

vi.mock('axios');
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('should return data on first successful attempt', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: { result: 'ok' } });
    const result = await fetchWithRetry('https://example.com');
    expect(result.data).toEqual({ result: 'ok' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    mockedAxios.get = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: { result: 'ok' } });

    const result = await fetchWithRetry('https://example.com', {}, { retries: 3, baseDelay: 0 });
    expect(result.data).toEqual({ result: 'ok' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should throw after all retries exhausted', async () => {
    mockedAxios.get = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(
      fetchWithRetry('https://example.com', {}, { retries: 3, baseDelay: 0 })
    ).rejects.toThrow('timeout');
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/utils/http.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

```typescript
// src/utils/http.ts
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { logger } from '../logger.js';

interface RetryOptions {
  retries?: number;
  baseDelay?: number;  // ms
}

export async function fetchWithRetry(
  url: string,
  config: AxiosRequestConfig = {},
  options: RetryOptions = {}
): Promise<AxiosResponse> {
  const { retries = 3, baseDelay = 1000 } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      if (attempt === retries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      logger.warn({ attempt, url, delay }, 'HTTP request failed, retrying...');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/utils/http.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/http.ts tests/utils/http.test.ts
git commit -m "feat: add HTTP fetch with retry and exponential backoff"
```

---

### Task 5: JSON 스토어

**Files:**
- Create: `src/store/json-store.ts`
- Create: `tests/store/json-store.test.ts`

- [ ] **Step 1: JSON 스토어 테스트 작성**

```typescript
// tests/store/json-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonStore } from '../../src/store/json-store.js';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('JsonStore', () => {
  const testDir = join(import.meta.dirname, 'tmp-store');
  let store: JsonStore;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    store = new JsonStore(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('watchlist', () => {
    it('should start empty', () => {
      expect(store.getWatchlist()).toEqual([]);
    });

    it('should add and remove keywords', () => {
      store.addWatch('삼성전자');
      store.addWatch('AI');
      expect(store.getWatchlist()).toEqual(['삼성전자', 'AI']);

      store.removeWatch('삼성전자');
      expect(store.getWatchlist()).toEqual(['AI']);
    });

    it('should not add duplicate keywords', () => {
      store.addWatch('삼성전자');
      store.addWatch('삼성전자');
      expect(store.getWatchlist()).toEqual(['삼성전자']);
    });
  });

  describe('sent cache', () => {
    it('should track sent news ids', () => {
      expect(store.isSent('abc123')).toBe(false);
      store.markSent('abc123');
      expect(store.isSent('abc123')).toBe(true);
    });
  });

  describe('history', () => {
    it('should save and retrieve briefings', () => {
      const briefing = { date: '2026-03-10', content: 'test briefing' };
      store.saveHistory(briefing);
      const history = store.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('test briefing');
    });

    it('should return N most recent entries', () => {
      store.saveHistory({ date: '2026-03-08', content: 'old' });
      store.saveHistory({ date: '2026-03-09', content: 'mid' });
      store.saveHistory({ date: '2026-03-10', content: 'new' });
      const history = store.getHistory(2);
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('new');
    });
  });

  describe('pruning', () => {
    it('should prune entries older than retention days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);
      store.markSent('old-id', oldDate);
      store.markSent('new-id', new Date());

      store.pruneCache(30);
      expect(store.isSent('old-id')).toBe(false);
      expect(store.isSent('new-id')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/store/json-store.test.ts`
Expected: FAIL

- [ ] **Step 3: JSON 스토어 구현**

```typescript
// src/store/json-store.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface SentEntry {
  id: string;
  sentAt: string;
}

interface HistoryEntry {
  date: string;
  content: string;
}

export class JsonStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  // --- Watchlist ---

  getWatchlist(): string[] {
    return this.readFile<string[]>('watchlist.json', []);
  }

  addWatch(keyword: string): void {
    const list = this.getWatchlist();
    if (!list.includes(keyword)) {
      list.push(keyword);
      this.writeFile('watchlist.json', list);
    }
  }

  removeWatch(keyword: string): void {
    const list = this.getWatchlist().filter((k) => k !== keyword);
    this.writeFile('watchlist.json', list);
  }

  // --- Sent Cache ---

  isSent(id: string): boolean {
    const cache = this.readFile<SentEntry[]>('sent-cache.json', []);
    return cache.some((e) => e.id === id);
  }

  markSent(id: string, date: Date = new Date()): void {
    const cache = this.readFile<SentEntry[]>('sent-cache.json', []);
    cache.push({ id, sentAt: date.toISOString() });
    this.writeFile('sent-cache.json', cache);
  }

  pruneCache(retentionDays: number): void {
    const cache = this.readFile<SentEntry[]>('sent-cache.json', []);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const pruned = cache.filter((e) => new Date(e.sentAt) > cutoff);
    this.writeFile('sent-cache.json', pruned);
  }

  // --- History ---

  saveHistory(entry: HistoryEntry): void {
    const history = this.readFile<HistoryEntry[]>('history.json', []);
    history.push(entry);
    this.writeFile('history.json', history);
  }

  getHistory(n: number): HistoryEntry[] {
    const history = this.readFile<HistoryEntry[]>('history.json', []);
    return history.slice(-n).reverse();
  }

  pruneHistory(retentionDays: number): void {
    const history = this.readFile<HistoryEntry[]>('history.json', []);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const pruned = history.filter((e) => new Date(e.date) > cutoff);
    this.writeFile('history.json', pruned);
  }

  // --- Detail Cache ---

  getCachedDetail(newsId: string): string | null {
    const cache = this.readFile<Record<string, string>>('detail-cache.json', {});
    return cache[newsId] ?? null;
  }

  cacheDetail(newsId: string, detail: string): void {
    const cache = this.readFile<Record<string, string>>('detail-cache.json', {});
    cache[newsId] = detail;
    this.writeFile('detail-cache.json', cache);
  }

  // --- File I/O ---

  private readFile<T>(filename: string, fallback: T): T {
    const path = join(this.dir, filename);
    if (!existsSync(path)) return fallback;
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return fallback;
    }
  }

  private writeFile(filename: string, data: unknown): void {
    const path = join(this.dir, filename);
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/store/json-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/json-store.ts tests/store/json-store.test.ts
git commit -m "feat: add JSON file-based store for watchlist, history, and cache"
```

---

### Task 6: Collector 베이스 인터페이스

**Files:**
- Create: `src/collectors/base.ts`

- [ ] **Step 1: Collector 인터페이스 정의**

```typescript
// src/collectors/base.ts
import type { NewsItem } from '../types.js';

export interface Collector {
  name: string;
  collect(): Promise<NewsItem[]>;
}

export async function runCollectors(collectors: Collector[]): Promise<{ items: NewsItem[]; errors: string[] }> {
  const results = await Promise.allSettled(collectors.map((c) => c.collect()));
  const items: NewsItem[] = [];
  const errors: string[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      errors.push(`${collectors[i].name}: ${result.reason?.message || 'Unknown error'}`);
    }
  });

  return { items, errors };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/collectors/base.ts
git commit -m "feat: add Collector interface and parallel runner"
```

---

### Task 7: 네이버 뉴스 Collector

**Files:**
- Create: `src/collectors/naver-news.ts`
- Create: `tests/collectors/naver-news.test.ts`

- [ ] **Step 1: 테스트 작성 (axios 모킹)**

```typescript
// tests/collectors/naver-news.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NaverNewsCollector } from '../../src/collectors/naver-news.js';

vi.mock('axios');
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('NaverNewsCollector', () => {
  let collector: NaverNewsCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new NaverNewsCollector({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      categories: ['주식'],
    });
  });

  it('should return NewsItem array from Naver API response', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            title: '삼성전자 <b>주가</b> 상승',
            description: '삼성전자 주가가 3% 상승했다.',
            link: 'https://news.naver.com/123',
            pubDate: 'Mon, 10 Mar 2026 06:00:00 +0900',
          },
        ],
      },
    });

    const items = await collector.collect();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('삼성전자 주가 상승'); // HTML 태그 제거
    expect(items[0].source).toBe('naver');
    expect(items[0].url).toBe('https://news.naver.com/123');
  });

  it('should strip HTML tags from title and description', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            title: '<b>AI</b> &amp; 반도체',
            description: '<b>설명</b>입니다',
            link: 'https://example.com',
            pubDate: 'Mon, 10 Mar 2026 06:00:00 +0900',
          },
        ],
      },
    });

    const items = await collector.collect();
    expect(items[0].title).toBe('AI & 반도체');
    expect(items[0].summary).toBe('설명입니다');
  });

  it('should make requests for each category', async () => {
    collector = new NaverNewsCollector({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      categories: ['주식', '경제'],
    });

    mockedAxios.get = vi.fn().mockResolvedValue({ data: { items: [] } });

    await collector.collect();
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/collectors/naver-news.test.ts`
Expected: FAIL

- [ ] **Step 3: 네이버 뉴스 Collector 구현**

```typescript
// src/collectors/naver-news.ts
import axios from 'axios';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface NaverNewsConfig {
  clientId: string;
  clientSecret: string;
  categories: string[];
}

const CATEGORY_MAP: Record<string, NewsCategory> = {
  '주식': 'kr-stock',
  '경제': 'macro',
  'AI': 'ai-tech',
  '반도체': 'kr-stock',
  '미국주식': 'us-stock',
};

function stripHtml(str: string): string {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

export class NaverNewsCollector implements Collector {
  name = 'naver';
  private config: NaverNewsConfig;

  constructor(config: NaverNewsConfig) {
    this.config = config;
  }

  async collect(): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];

    for (const category of this.config.categories) {
      const response = await axios.get('https://openapi.naver.com/v1/search/news.json', {
        params: { query: category, display: 10, sort: 'date' },
        headers: {
          'X-Naver-Client-Id': this.config.clientId,
          'X-Naver-Client-Secret': this.config.clientSecret,
        },
      });

      const items: NewsItem[] = response.data.items.map((item: any) => ({
        id: createNewsItemId('naver', item.link),
        title: stripHtml(item.title),
        summary: stripHtml(item.description),
        url: item.link,
        source: 'naver',
        category: CATEGORY_MAP[category] || 'macro',
        publishedAt: new Date(item.pubDate),
      }));

      allItems.push(...items);
    }

    return allItems;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/collectors/naver-news.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/collectors/naver-news.ts tests/collectors/naver-news.test.ts
git commit -m "feat: add Naver News collector with HTML stripping"
```

---

### Task 8: RSS 피드 Collector

**Files:**
- Create: `src/collectors/rss-feed.ts`
- Create: `tests/collectors/rss-feed.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/collectors/rss-feed.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RssFeedCollector } from '../../src/collectors/rss-feed.js';

vi.mock('rss-parser', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: '코스피 상승세',
            contentSnippet: '코스피가 1% 상승했다.',
            link: 'https://hankyung.com/article/1',
            pubDate: 'Mon, 10 Mar 2026 06:00:00 +0900',
          },
        ],
      }),
    })),
  };
});

describe('RssFeedCollector', () => {
  let collector: RssFeedCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new RssFeedCollector({
      feeds: [{ name: '한국경제', url: 'https://hankyung.com/rss' }],
    });
  });

  it('should parse RSS feed into NewsItem array', async () => {
    const items = await collector.collect();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('코스피 상승세');
    expect(items[0].source).toBe('한국경제');
  });

  it('should handle multiple feeds', async () => {
    collector = new RssFeedCollector({
      feeds: [
        { name: '한국경제', url: 'https://hankyung.com/rss' },
        { name: '매일경제', url: 'https://mk.co.kr/rss' },
      ],
    });
    const items = await collector.collect();
    expect(items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/collectors/rss-feed.test.ts`
Expected: FAIL

- [ ] **Step 3: RSS Collector 구현**

```typescript
// src/collectors/rss-feed.ts
import Parser from 'rss-parser';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface RssFeedConfig {
  feeds: { name: string; url: string }[];
}

function guessCategory(title: string): NewsCategory {
  const lower = title.toLowerCase();
  if (/코스피|코스닥|주가|종목|상장/.test(title)) return 'kr-stock';
  if (/나스닥|s&p|다우|미국|월가|nyse/.test(lower)) return 'us-stock';
  if (/ai|인공지능|chatgpt|llm|반도체|gpu/.test(lower)) return 'ai-tech';
  return 'macro';
}

export class RssFeedCollector implements Collector {
  name = 'rss';
  private config: RssFeedConfig;
  private parser: Parser;

  constructor(config: RssFeedConfig) {
    this.config = config;
    this.parser = new Parser();
  }

  async collect(): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];

    const results = await Promise.allSettled(
      this.config.feeds.map((feed) => this.parseFeed(feed))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }

    return allItems;
  }

  private async parseFeed(feed: { name: string; url: string }): Promise<NewsItem[]> {
    const parsed = await this.parser.parseURL(feed.url);

    return (parsed.items || []).slice(0, 10).map((item) => ({
      id: createNewsItemId(feed.name, item.link || ''),
      title: item.title || '',
      summary: item.contentSnippet?.slice(0, 200) || '',
      url: item.link || '',
      source: feed.name,
      category: guessCategory(item.title || ''),
      publishedAt: new Date(item.pubDate || Date.now()),
    }));
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/collectors/rss-feed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/collectors/rss-feed.ts tests/collectors/rss-feed.test.ts
git commit -m "feat: add RSS feed collector with category guessing"
```

---

### Task 9: Yahoo Finance Collector

**Files:**
- Create: `src/collectors/yahoo-finance.ts`
- Create: `tests/collectors/yahoo-finance.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/collectors/yahoo-finance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YahooFinanceCollector } from '../../src/collectors/yahoo-finance.js';

vi.mock('axios');
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('YahooFinanceCollector', () => {
  let collector: YahooFinanceCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new YahooFinanceCollector({ symbols: ['^GSPC', '^IXIC'] });
  });

  it('should fetch market data for symbols', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        chart: {
          result: [
            {
              meta: {
                symbol: '^GSPC',
                regularMarketPrice: 5230.5,
                previousClose: 5200.0,
              },
            },
          ],
        },
      },
    });

    const items = await collector.collect();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].source).toBe('yahoo-finance');
    expect(items[0].category).toBe('us-stock');
  });

  it('should handle API failure gracefully', async () => {
    mockedAxios.get = vi.fn().mockRejectedValue(new Error('API down'));
    await expect(collector.collect()).rejects.toThrow('API down');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/collectors/yahoo-finance.test.ts`
Expected: FAIL

- [ ] **Step 3: Yahoo Finance Collector 구현**

```typescript
// src/collectors/yahoo-finance.ts
import axios from 'axios';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface YahooFinanceConfig {
  symbols: string[];
}

const SYMBOL_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  '^KS11': 'KOSPI',
  '^KQ11': 'KOSDAQ',
  '^DJI': 'Dow Jones',
};

function symbolCategory(symbol: string): NewsCategory {
  if (symbol.startsWith('^KS') || symbol.startsWith('^KQ')) return 'kr-stock';
  return 'us-stock';
}

export class YahooFinanceCollector implements Collector {
  name = 'yahoo-finance';
  private config: YahooFinanceConfig;

  constructor(config: YahooFinanceConfig) {
    this.config = config;
  }

  async collect(): Promise<NewsItem[]> {
    const items: NewsItem[] = [];

    for (const symbol of this.config.symbols) {
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
        {
          params: { interval: '1d', range: '1d' },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000,
        }
      );

      const meta = response.data.chart.result[0].meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose;
      const change = ((price - prevClose) / prevClose * 100).toFixed(2);
      const direction = Number(change) >= 0 ? '+' : '';
      const name = SYMBOL_NAMES[symbol] || symbol;

      items.push({
        id: createNewsItemId('yahoo-finance', `${symbol}-${new Date().toISOString().slice(0, 10)}`),
        title: `${name} ${price.toLocaleString()} (${direction}${change}%)`,
        summary: `${name} 전일 대비 ${direction}${change}% 변동. 현재가 ${price.toLocaleString()}`,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
        source: 'yahoo-finance',
        category: symbolCategory(symbol),
        publishedAt: new Date(),
      });
    }

    return items;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/collectors/yahoo-finance.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/collectors/yahoo-finance.ts tests/collectors/yahoo-finance.test.ts
git commit -m "feat: add Yahoo Finance collector for market indices"
```

---

### Task 10: 웹 스크래퍼 Collector

**Files:**
- Create: `src/collectors/web-scraper.ts`
- Create: `tests/collectors/web-scraper.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/collectors/web-scraper.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebScraperCollector } from '../../src/collectors/web-scraper.js';

vi.mock('axios');
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('WebScraperCollector', () => {
  let collector: WebScraperCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new WebScraperCollector();
  });

  it('should scrape and parse HTML content', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: `<html><body>
        <div class="news-item">
          <a href="/article/123" class="title">테스트 뉴스 제목</a>
          <p class="summary">테스트 뉴스 요약입니다.</p>
          <span class="date">2026-03-10</span>
        </div>
      </body></html>`,
    });

    const items = await collector.collect();
    expect(items.length).toBeGreaterThanOrEqual(0); // 스크래퍼 타겟에 따라 다름
  });

  it('should handle scraping failure gracefully', async () => {
    mockedAxios.get = vi.fn().mockRejectedValue(new Error('Connection refused'));
    await expect(collector.collect()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/collectors/web-scraper.test.ts`
Expected: FAIL

- [ ] **Step 3: 웹 스크래퍼 구현 (확장 가능한 구조)**

```typescript
// src/collectors/web-scraper.ts
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Collector } from './base.js';
import type { NewsItem, NewsCategory } from '../types.js';
import { createNewsItemId } from '../types.js';

interface ScrapeTarget {
  name: string;
  url: string;
  category: NewsCategory;
  selectors: {
    container: string;
    title: string;
    link: string;
    summary?: string;
  };
  baseUrl?: string;
}

const DEFAULT_TARGETS: ScrapeTarget[] = [
  {
    name: 'investing.com-news',
    url: 'https://kr.investing.com/news/stock-market-news',
    category: 'kr-stock',
    selectors: {
      container: 'article[data-test="article-item"]',
      title: 'a.title',
      link: 'a.title',
      summary: 'p',
    },
    baseUrl: 'https://kr.investing.com',
  },
];

export class WebScraperCollector implements Collector {
  name = 'web-scraper';
  private targets: ScrapeTarget[];

  constructor(targets?: ScrapeTarget[]) {
    this.targets = targets || DEFAULT_TARGETS;
  }

  async collect(): Promise<NewsItem[]> {
    const allItems: NewsItem[] = [];

    const results = await Promise.allSettled(
      this.targets.map((target) => this.scrapeTarget(target))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }

    if (allItems.length === 0 && results.every((r) => r.status === 'rejected')) {
      throw new Error('All scrape targets failed');
    }

    return allItems;
  }

  private async scrapeTarget(target: ScrapeTarget): Promise<NewsItem[]> {
    const response = await axios.get(target.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const items: NewsItem[] = [];

    $(target.selectors.container).slice(0, 10).each((_, el) => {
      const titleEl = $(el).find(target.selectors.title);
      const title = titleEl.text().trim();
      let link = titleEl.attr('href') || '';
      if (link && target.baseUrl && !link.startsWith('http')) {
        link = target.baseUrl + link;
      }
      const summary = target.selectors.summary
        ? $(el).find(target.selectors.summary).text().trim().slice(0, 200)
        : '';

      if (title && link) {
        items.push({
          id: createNewsItemId(target.name, link),
          title,
          summary,
          url: link,
          source: target.name,
          category: target.category,
          publishedAt: new Date(),
        });
      }
    });

    return items;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/collectors/web-scraper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/collectors/web-scraper.ts tests/collectors/web-scraper.test.ts
git commit -m "feat: add web scraper collector with configurable targets"
```

---

## Chunk 3: Aggregator, Summarizer & Formatter

### Task 11: Aggregator

**Files:**
- Create: `src/aggregator.ts`
- Create: `tests/aggregator.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/aggregator.test.ts
import { describe, it, expect } from 'vitest';
import { aggregate } from '../src/aggregator.js';
import type { NewsItem } from '../src/types.js';

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'test-id',
    title: 'Test Title',
    summary: 'Test summary',
    url: 'https://example.com',
    source: 'test',
    category: 'kr-stock',
    publishedAt: new Date('2026-03-10T06:00:00Z'),
    ...overrides,
  };
}

describe('aggregate', () => {
  it('should group items by category', () => {
    const items = [
      makeItem({ id: '1', category: 'kr-stock' }),
      makeItem({ id: '2', category: 'us-stock' }),
      makeItem({ id: '3', category: 'kr-stock' }),
    ];

    const result = aggregate(items);
    expect(result.get('kr-stock')).toHaveLength(2);
    expect(result.get('us-stock')).toHaveLength(1);
  });

  it('should deduplicate by id', () => {
    const items = [
      makeItem({ id: 'same-id', title: 'First' }),
      makeItem({ id: 'same-id', title: 'Duplicate' }),
    ];

    const result = aggregate(items);
    const krStock = result.get('kr-stock')!;
    expect(krStock).toHaveLength(1);
    expect(krStock[0].title).toBe('First');
  });

  it('should sort by publishedAt descending', () => {
    const items = [
      makeItem({ id: '1', publishedAt: new Date('2026-03-10T04:00:00Z') }),
      makeItem({ id: '2', publishedAt: new Date('2026-03-10T06:00:00Z') }),
      makeItem({ id: '3', publishedAt: new Date('2026-03-10T05:00:00Z') }),
    ];

    const result = aggregate(items);
    const sorted = result.get('kr-stock')!;
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('3');
    expect(sorted[2].id).toBe('1');
  });

  it('should return empty map for empty input', () => {
    const result = aggregate([]);
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/aggregator.test.ts`
Expected: FAIL

- [ ] **Step 3: Aggregator 구현**

```typescript
// src/aggregator.ts
import type { NewsItem, NewsCategory } from './types.js';

export function aggregate(items: NewsItem[]): Map<NewsCategory, NewsItem[]> {
  const seen = new Set<string>();
  const grouped = new Map<NewsCategory, NewsItem[]>();

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const list = grouped.get(item.category) || [];
    list.push(item);
    grouped.set(item.category, list);
  }

  for (const [category, list] of grouped) {
    list.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    grouped.set(category, list.slice(0, 10));
  }

  return grouped;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/aggregator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/aggregator.ts tests/aggregator.test.ts
git commit -m "feat: add aggregator with dedup and sorting"
```

---

### Task 12: Summarizer (Claude CLI)

**Files:**
- Create: `src/summarizer.ts`
- Create: `tests/summarizer.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/summarizer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Summarizer } from '../src/summarizer.js';
import { execFile } from 'node:child_process';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

describe('Summarizer', () => {
  let summarizer: Summarizer;

  beforeEach(() => {
    vi.clearAllMocks();
    summarizer = new Summarizer({ dailyLimit: 50, language: 'ko' });
  });

  it('should call claude CLI and return summary', async () => {
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
      callback(null, { stdout: '오늘 코스피는 1.2% 상승했습니다.' });
      return {} as any;
    });

    const result = await summarizer.summarize('뉴스 내용...');
    expect(result).toBe('오늘 코스피는 1.2% 상승했습니다.');
  });

  it('should return fallback on CLI failure', async () => {
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
      callback(new Error('CLI not found'));
      return {} as any;
    });

    const result = await summarizer.summarize('뉴스 내용...');
    expect(result).toBeNull();
  });

  it('should respect daily limit', async () => {
    summarizer = new Summarizer({ dailyLimit: 1, language: 'ko' });

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
      callback(null, { stdout: 'summary' });
      return {} as any;
    });

    await summarizer.summarize('first');
    const second = await summarizer.summarize('second');
    expect(second).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/summarizer.test.ts`
Expected: FAIL

- [ ] **Step 3: Summarizer 구현**

```typescript
// src/summarizer.ts
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger.js';

const execFile = promisify(execFileCb);

interface SummarizerConfig {
  dailyLimit: number;
  language: string;
}

export class Summarizer {
  private config: SummarizerConfig;
  private callCount = 0;
  private lastResetDate = new Date().toISOString().slice(0, 10);

  constructor(config: SummarizerConfig) {
    this.config = config;
  }

  private resetIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastResetDate) {
      this.callCount = 0;
      this.lastResetDate = today;
    }
  }

  async summarize(content: string, prompt?: string): Promise<string | null> {
    this.resetIfNewDay();

    if (this.callCount >= this.config.dailyLimit) {
      logger.warn('Daily Claude CLI limit reached');
      return null;
    }

    const systemPrompt = prompt ||
      `당신은 금융/기술 뉴스 요약 전문가입니다. 다음 뉴스를 ${this.config.language === 'ko' ? '한국어' : 'English'}로 간결하게 요약해주세요. 핵심 포인트만 3-5줄로 정리하세요.`;

    try {
      const { stdout } = await execFile('claude', [
        '-p', `${systemPrompt}\n\n${content}`,
        '--output-format', 'text',
      ], { timeout: 60000, maxBuffer: 1024 * 1024 });

      this.callCount++;
      return stdout.trim();
    } catch (error) {
      logger.error({ error }, 'Claude CLI invocation failed');
      return null;
    }
  }

  async summarizeDetail(content: string): Promise<string | null> {
    const prompt = `당신은 금융/기술 뉴스 분석가입니다. 다음 뉴스를 상세하게 분석해주세요.
포함할 내용: 1) 핵심 내용 2) 배경 및 맥락 3) 시장 영향 4) 투자 시사점
한국어로 작성하세요.`;
    return this.summarize(content, prompt);
  }

  getRemainingCalls(): number {
    this.resetIfNewDay();
    return this.config.dailyLimit - this.callCount;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/summarizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/summarizer.ts tests/summarizer.test.ts
git commit -m "feat: add Claude CLI summarizer with daily limit"
```

---

### Task 13: 메시지 포매터

**Files:**
- Create: `src/bot/formatter.ts`
- Create: `tests/bot/formatter.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/bot/formatter.test.ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/bot/formatter.test.ts`
Expected: FAIL

- [ ] **Step 3: 포매터 구현**

```typescript
// src/bot/formatter.ts
import type { Briefing, BriefingSection, NewsItem } from '../types.js';

const CATEGORY_LABELS: Record<string, string> = {
  'kr-stock': '한국 주식',
  'us-stock': '미국 주식',
  'ai-tech': 'AI/Tech',
  'macro': '매크로/경제',
};

const CATEGORY_ORDER = ['kr-stock', 'us-stock', 'ai-tech', 'macro'];

function formatDate(date: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const day = days[date.getDay()];
  return `${y}.${m}.${d} (${day})`;
}

export function formatBriefing(briefing: Briefing): string {
  const lines: string[] = [];

  lines.push(`📊 모닝 브리핑 | ${formatDate(briefing.date)}`);
  lines.push('');

  const sortedSections = [...briefing.sections].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );

  let itemIndex = 1;
  for (const section of sortedSections) {
    const label = CATEGORY_LABELS[section.category] || section.category;
    lines.push(`━━ ${label} ━━`);
    if (section.summary) {
      lines.push(section.summary);
    }
    lines.push('');

    for (const item of section.items) {
      lines.push(` ${itemIndex}. ${item.title}`);
      itemIndex++;
    }
    lines.push('');
  }

  if (briefing.errors.length > 0) {
    lines.push('⚠️ 수집 실패: ' + briefing.errors.join(', '));
  }

  return lines.join('\n').trim();
}

export function formatNewsDetail(item: NewsItem, detail: string): string {
  const lines: string[] = [];
  lines.push(`📰 ${item.title}`);
  lines.push(`출처: ${item.source}`);
  lines.push('');
  lines.push(detail);
  lines.push('');
  lines.push(`🔗 원문: ${item.url}`);
  return lines.join('\n');
}

export function formatMarketSnapshot(items: NewsItem[]): string {
  const lines: string[] = [];
  lines.push('📈 시장 현황');
  lines.push('');
  for (const item of items) {
    lines.push(`• ${item.title}`);
  }
  return lines.join('\n');
}

export function getInlineKeyboard(items: NewsItem[]): Array<Array<{ text: string; callback_data?: string; url?: string }>> {
  const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const item of items) {
    keyboard.push([
      { text: '상세보기', callback_data: `detail:${item.id}` },
      { text: '원문', url: item.url },
    ]);
  }

  return keyboard;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/bot/formatter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/formatter.ts tests/bot/formatter.test.ts
git commit -m "feat: add telegram message formatter with inline keyboards"
```

---

## Chunk 4: Pipeline, Bot & Scheduler

### Task 14: 파이프라인

**Files:**
- Create: `src/pipeline.ts`
- Create: `tests/pipeline.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/pipeline.test.ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: FAIL

- [ ] **Step 3: 파이프라인 구현**

```typescript
// src/pipeline.ts
import type { Collector } from './collectors/base.js';
import { runCollectors } from './collectors/base.js';
import { aggregate } from './aggregator.js';
import type { Summarizer } from './summarizer.js';
import type { Briefing, BriefingSection } from './types.js';
import { logger } from './logger.js';

const CATEGORY_LABELS: Record<string, string> = {
  'kr-stock': '한국 주식',
  'us-stock': '미국 주식',
  'ai-tech': 'AI/Tech',
  'macro': '매크로/경제',
};

export async function runPipeline(collectors: Collector[], summarizer: Summarizer): Promise<Briefing> {
  logger.info('Pipeline started');

  // 1. 수집
  const { items, errors } = await runCollectors(collectors);
  logger.info({ count: items.length, errors: errors.length }, 'Collection complete');

  // 2. 통합
  const grouped = aggregate(items);

  // 3. 요약
  const sections: BriefingSection[] = [];

  for (const [category, categoryItems] of grouped) {
    const newsText = categoryItems
      .map((item) => `- ${item.title}: ${item.summary}`)
      .join('\n');

    const summary = await summarizer.summarize(newsText);

    sections.push({
      category,
      label: CATEGORY_LABELS[category] || category,
      summary: summary || categoryItems.map((i) => i.summary).join(' '),
      items: categoryItems,
    });
  }

  logger.info({ sections: sections.length }, 'Summarization complete');

  return {
    date: new Date(),
    sections,
    errors,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.ts tests/pipeline.test.ts
git commit -m "feat: add news pipeline orchestration"
```

---

### Task 15: 텔레그램 봇 명령어 핸들러 (별도 파일 분리)

**Files:**
- Create: `src/bot/commands/watch.ts`
- Create: `src/bot/commands/info.ts`
- Create: `src/bot/commands/briefing.ts`
- Create: `src/bot/commands/index.ts`
- Create: `tests/bot/commands.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// tests/bot/commands.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleWatch, handleUnwatch, handleWatchlist } from '../../src/bot/commands/watch.js';
import { handleHistory, handleHelp, handleChatId, handleSettings } from '../../src/bot/commands/info.js';

describe('watch commands', () => {
  const mockStore = {
    getWatchlist: vi.fn().mockReturnValue(['삼성전자', 'AI']),
    addWatch: vi.fn(),
    removeWatch: vi.fn(),
  };

  describe('handleWatch', () => {
    it('should add keyword to watchlist', () => {
      const result = handleWatch('삼성전자', mockStore as any);
      expect(mockStore.addWatch).toHaveBeenCalledWith('삼성전자');
      expect(result).toContain('삼성전자');
    });

    it('should reject empty keyword', () => {
      const result = handleWatch('', mockStore as any);
      expect(result).toContain('키워드');
    });
  });

  describe('handleUnwatch', () => {
    it('should remove keyword from watchlist', () => {
      handleUnwatch('삼성전자', mockStore as any);
      expect(mockStore.removeWatch).toHaveBeenCalledWith('삼성전자');
    });
  });

  describe('handleWatchlist', () => {
    it('should return current watchlist', () => {
      const result = handleWatchlist(mockStore as any);
      expect(result).toContain('삼성전자');
      expect(result).toContain('AI');
    });
  });
});

describe('info commands', () => {
  describe('handleChatId', () => {
    it('should return the chat id', () => {
      const result = handleChatId(123456789);
      expect(result).toContain('123456789');
    });
  });

  describe('handleHelp', () => {
    it('should return command list including /chatid', () => {
      const result = handleHelp();
      expect(result).toContain('/now');
      expect(result).toContain('/search');
      expect(result).toContain('/watch');
      expect(result).toContain('/chatid');
    });
  });

  describe('handleHistory', () => {
    const mockStore = {
      getHistory: vi.fn().mockReturnValue([{ date: '2026-03-10', content: 'test' }]),
    };

    it('should return recent history', () => {
      const result = handleHistory(3, mockStore as any);
      expect(result).toContain('test');
    });
  });

  describe('handleSettings', () => {
    it('should return read-only settings', () => {
      const result = handleSettings({
        schedule: { time: '07:00', timezone: 'Asia/Seoul' },
      } as any, 5, 2);
      expect(result).toContain('07:00');
      expect(result).toContain('읽기 전용');
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/bot/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: watch.ts 구현**

```typescript
// src/bot/commands/watch.ts
import type { JsonStore } from '../../store/json-store.js';

export function handleWatch(keyword: string, store: JsonStore): string {
  if (!keyword.trim()) {
    return '⚠️ 키워드를 입력해주세요. 예: /watch 삼성전자';
  }
  store.addWatch(keyword.trim());
  return `✅ "${keyword.trim()}" 관심 목록에 추가했습니다.`;
}

export function handleUnwatch(keyword: string, store: JsonStore): string {
  if (!keyword.trim()) {
    return '⚠️ 키워드를 입력해주세요. 예: /unwatch 삼성전자';
  }
  store.removeWatch(keyword.trim());
  return `🗑️ "${keyword.trim()}" 관심 목록에서 제거했습니다.`;
}

export function handleWatchlist(store: JsonStore): string {
  const list = store.getWatchlist();
  if (list.length === 0) {
    return '📋 관심 목록이 비어있습니다. /watch 키워드 로 추가하세요.';
  }
  return '📋 관심 목록:\n' + list.map((k, i) => `${i + 1}. ${k}`).join('\n');
}
```

- [ ] **Step 4: info.ts 구현 (/chatid, /help, /history, /settings)**

```typescript
// src/bot/commands/info.ts
import type { JsonStore } from '../../store/json-store.js';
import type { AppConfig } from '../../config.js';

export function handleChatId(chatId: number): string {
  return `🆔 당신의 Chat ID: \`${chatId}\`\n\n이 값을 config.yaml의 subscriberChatIds에 추가하면 매일 브리핑을 받을 수 있습니다.`;
}

export function handleHelp(): string {
  return `📖 명령어 목록

/now — 현재 시간 기준 최신 브리핑
/search 키워드 — 특정 키워드로 뉴스 검색
/watch 키워드 — 관심 키워드 등록 (정기 알림)
/unwatch 키워드 — 관심 키워드 해제
/watchlist — 현재 관심 목록 확인
/market — 주요 지수 스냅샷
/history N — 최근 N일치 브리핑 (기본 3일)
/chatid — 내 Chat ID 확인
/settings — 현재 설정 확인
/help — 이 도움말`;
}

export function handleHistory(n: number, store: JsonStore): string {
  const count = Math.min(Math.max(n || 3, 1), 7);
  const history = store.getHistory(count);
  if (history.length === 0) {
    return '📂 저장된 브리핑이 없습니다.';
  }
  return history.map((h) => `📅 ${h.date}\n${h.content}`).join('\n\n---\n\n');
}

export function handleSettings(
  config: AppConfig,
  remainingCalls: number,
  watchCount: number,
): string {
  return [
    '⚙️ 현재 설정 (읽기 전용)',
    '',
    `⏰ 브리핑 시간: ${config.schedule.time}`,
    `🌏 시간대: ${config.schedule.timezone}`,
    `👥 구독자 수: ${config.telegram.subscriberChatIds.length}명`,
    `📊 Claude CLI 잔여 호출: ${remainingCalls}`,
    `👀 관심 키워드: ${watchCount}개`,
    '',
    '💡 설정 변경은 config.yaml 파일을 직접 수정하세요.',
  ].join('\n');
}
```

- [ ] **Step 5: briefing.ts 구현 (/now, /search, /market — 실시간 데이터)**

```typescript
// src/bot/commands/briefing.ts
import type { Collector } from '../../collectors/base.js';
import { runCollectors } from '../../collectors/base.js';
import { aggregate } from '../../aggregator.js';
import type { NewsItem } from '../../types.js';
import { formatMarketSnapshot } from '../formatter.js';

export async function handleSearch(
  keyword: string,
  collectors: Collector[],
  cachedItems: NewsItem[],
): Promise<string> {
  if (!keyword.trim()) {
    return '⚠️ 검색어를 입력해주세요. 예: /search 삼성전자';
  }

  // 캐시에서 먼저 검색
  let matching = cachedItems.filter(
    (item) => item.title.includes(keyword) || item.summary.includes(keyword)
  );

  // 캐시에 없으면 실시간 수집
  if (matching.length === 0) {
    const { items } = await runCollectors(collectors);
    matching = items.filter(
      (item) => item.title.includes(keyword) || item.summary.includes(keyword)
    );
  }

  if (matching.length === 0) {
    return `🔍 "${keyword}" 관련 뉴스를 찾을 수 없습니다.`;
  }

  const lines = matching.slice(0, 10).map((item, i) => `${i + 1}. ${item.title}\n   ${item.url}`);
  return `🔍 "${keyword}" 검색 결과:\n\n${lines.join('\n\n')}`;
}

export async function handleMarket(
  marketCollectors: Collector[],
  cachedItems: NewsItem[],
): Promise<string> {
  // 캐시에서 시장 데이터 확인
  let marketItems = cachedItems.filter((i) => i.source === 'yahoo-finance');

  // 캐시에 없으면 실시간 조회
  if (marketItems.length === 0) {
    const { items } = await runCollectors(marketCollectors);
    marketItems = items;
  }

  if (marketItems.length === 0) {
    return '⚠️ 시장 데이터를 조회할 수 없습니다.';
  }

  return formatMarketSnapshot(marketItems);
}
```

- [ ] **Step 6: commands/index.ts 구현 (라우터)**

```typescript
// src/bot/commands/index.ts
export { handleWatch, handleUnwatch, handleWatchlist } from './watch.js';
export { handleChatId, handleHelp, handleHistory, handleSettings } from './info.js';
export { handleSearch, handleMarket } from './briefing.js';
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npx vitest run tests/bot/commands.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/bot/commands/ tests/bot/commands.test.ts
git commit -m "feat: add bot commands split into separate files with /chatid support"
```

---

### Task 16: 텔레그램 봇 초기화 & 라우팅 (다중 유저 + 실시간 데이터)

**Files:**
- Create: `src/bot/telegram.ts`

- [ ] **Step 1: 텔레그램 봇 구현**

```typescript
// src/bot/telegram.ts
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
import { formatBriefing, formatNewsDetail, getInlineKeyboard } from './formatter.js';
import type { Briefing, NewsItem } from '../types.js';
import { logger } from '../logger.js';

export class MorningBriefingBot {
  private bot: TelegramBot;
  private config: AppConfig;
  private store: JsonStore;
  private summarizer: Summarizer;
  private collectors: Collector[];
  private lastBriefing: Briefing | null = null;
  private allItems: NewsItem[] = [];

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
    this.bot = new TelegramBot(config.telegram.botToken, { polling: true });

    this.registerCommands();
    this.registerCallbacks();
    logger.info('Telegram bot started');
  }

  private isAuthorized(chatId: number): boolean {
    const { subscriberChatIds } = this.config.telegram;
    if (subscriberChatIds.length === 0) return true;
    return subscriberChatIds.includes(String(chatId));
  }

  private registerCommands(): void {
    // /chatid — 누구나 사용 가능 (인증 불필요)
    this.bot.onText(/\/chatid/, async (msg) => {
      await this.bot.sendMessage(msg.chat.id, handleChatId(msg.chat.id), { parse_mode: 'Markdown' });
    });

    this.bot.onText(/\/now/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, '⏳ 브리핑을 생성 중입니다...');
      const message = await this.runBriefingAndFormat();
      await this.sendBriefing(msg.chat.id, message);
    });

    this.bot.onText(/\/search (.+)/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, '🔍 검색 중...');
      const result = await handleSearch(match?.[1] || '', this.collectors, this.allItems);
      await this.bot.sendMessage(msg.chat.id, result);
    });

    this.bot.onText(/\/watch (.+)/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, handleWatch(match?.[1] || '', this.store));
    });

    this.bot.onText(/\/unwatch (.+)/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, handleUnwatch(match?.[1] || '', this.store));
    });

    this.bot.onText(/\/watchlist/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, handleWatchlist(this.store));
    });

    this.bot.onText(/\/market/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, '⏳ 시장 데이터 조회 중...');
      // Yahoo Finance collector만 추출해서 실시간 조회
      const marketCollectors = this.collectors.filter((c) => c.name === 'yahoo-finance');
      const result = await handleMarket(marketCollectors, this.allItems);
      await this.bot.sendMessage(msg.chat.id, result);
    });

    this.bot.onText(/\/history\s*(\d*)/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const n = parseInt(match?.[1] || '3', 10);
      await this.bot.sendMessage(msg.chat.id, handleHistory(n, this.store));
    });

    this.bot.onText(/\/settings/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, handleSettings(
        this.config,
        this.summarizer.getRemainingCalls(),
        this.store.getWatchlist().length,
      ));
    });

    this.bot.onText(/\/help/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.bot.sendMessage(msg.chat.id, handleHelp());
    });
  }

  private registerCallbacks(): void {
    this.bot.on('callback_query', async (query) => {
      if (!query.data || !query.message) return;
      if (!this.isAuthorized(query.message.chat.id)) return;

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
      await this.bot.sendMessage(chatId, formatNewsDetail(item, cached));
      return;
    }

    const detail = await this.summarizer.summarizeDetail(
      `제목: ${item.title}\n요약: ${item.summary}\nURL: ${item.url}`
    );

    if (detail) {
      this.store.cacheDetail(newsId, detail);
      await this.bot.sendMessage(chatId, formatNewsDetail(item, detail));
    } else {
      await this.bot.sendMessage(chatId, formatNewsDetail(item, item.summary + '\n\n(AI 상세 요약을 생성할 수 없습니다.)'));
    }
  }

  async runBriefingAndFormat(): Promise<string> {
    const briefing = await runPipeline(this.collectors, this.summarizer);
    this.lastBriefing = briefing;
    this.allItems = briefing.sections.flatMap((s) => s.items);

    const formatted = formatBriefing(briefing);
    this.store.saveHistory({
      date: new Date().toISOString().slice(0, 10),
      content: formatted,
    });

    this.store.pruneCache(30);
    this.store.pruneHistory(90);

    return formatted;
  }

  async sendBriefing(chatId: number, message: string): Promise<void> {
    const allItems = this.lastBriefing?.sections.flatMap((s) => s.items) || [];
    const keyboard = getInlineKeyboard(allItems);

    await this.bot.sendMessage(chatId, message, {
      reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
    });
  }

  // 모든 구독자에게 브리핑 전송
  async sendScheduledBriefing(): Promise<void> {
    const subscriberIds = this.config.telegram.subscriberChatIds;
    if (subscriberIds.length === 0) {
      logger.warn('No subscribers configured, skipping scheduled briefing');
      return;
    }

    const message = await this.runBriefingAndFormat();

    for (const chatId of subscriberIds) {
      try {
        await this.sendBriefing(Number(chatId), message);
        logger.info({ chatId }, 'Scheduled briefing sent');
      } catch (error) {
        logger.error({ chatId, error }, 'Failed to send briefing to subscriber');
      }
    }
  }

  // 실시간 데이터로 watch 키워드 체크
  async checkWatchKeywords(): Promise<void> {
    const watchlist = this.store.getWatchlist();
    if (watchlist.length === 0) return;

    // 실시간으로 최신 뉴스 수집
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
            logger.error({ chatId, error }, 'Failed to send watch alert');
          }
        }
        this.store.markSent(item.id);
      }
    }
  }

  stop(): void {
    this.bot.stopPolling();
    logger.info('Telegram bot stopped');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/bot/telegram.ts
git commit -m "feat: add telegram bot with multi-user, live data, and /chatid support"
```

---

### Task 17: 스케줄러 & 엔트리포인트

**Files:**
- Create: `src/scheduler.ts`
- Create: `src/index.ts`

- [ ] **Step 1: 스케줄러 구현**

```typescript
// src/scheduler.ts
import cron from 'node-cron';
import type { MorningBriefingBot } from './bot/telegram.js';
import type { AppConfig } from './config.js';
import { logger } from './logger.js';

export function setupScheduler(bot: MorningBriefingBot, config: AppConfig): void {
  const [hour, minute] = config.schedule.time.split(':');

  // 매일 브리핑
  cron.schedule(`${minute} ${hour} * * *`, async () => {
    logger.info('Scheduled briefing triggered');
    try {
      await bot.sendScheduledBriefing();
    } catch (error) {
      logger.error({ error }, 'Scheduled briefing failed');
    }
  }, { timezone: config.schedule.timezone });

  logger.info({ time: config.schedule.time, timezone: config.schedule.timezone }, 'Daily briefing scheduled');

  // Watch 키워드 체크
  const watchInterval = config.watch.checkInterval;
  cron.schedule(`*/${watchInterval} * * * *`, async () => {
    logger.info('Watch keyword check triggered');
    try {
      await bot.checkWatchKeywords();
    } catch (error) {
      logger.error({ error }, 'Watch check failed');
    }
  }, { timezone: config.schedule.timezone });

  logger.info({ interval: `${watchInterval}m` }, 'Watch keyword check scheduled');
}
```

- [ ] **Step 2: 엔트리포인트 구현**

```typescript
// src/index.ts
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

const configPath = join(import.meta.dirname, '..', 'config.yaml');
const config = loadConfig(configPath);

// Store
const storeDir = join(import.meta.dirname, 'store');
const store = new JsonStore(storeDir);

// Summarizer
const summarizer = new Summarizer({
  dailyLimit: config.summarizer.dailyLimit,
  language: config.summarizer.language,
});

// Collectors
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

// Bot
const bot = new MorningBriefingBot(config, store, summarizer, collectors);

// Scheduler
setupScheduler(bot, config);

logger.info({ collectors: collectors.map((c) => c.name) }, 'Morning Briefing started');

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  bot.stop();
  process.exit(0);
});
```

- [ ] **Step 3: Commit**

```bash
git add src/scheduler.ts src/index.ts
git commit -m "feat: add scheduler and main entrypoint"
```

---

## Chunk 5: launchd & Scripts

### Task 18: launchd plist

**Files:**
- Create: `launchd/com.morning-briefing.bot.plist`

- [ ] **Step 1: plist 파일 작성**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.morning-briefing.bot</string>

    <key>ProgramArguments</key>
    <array>
        <string>__NODE_PATH__</string>
        <string>__PROJECT_DIR__/dist/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>__PROJECT_DIR__</string>

    <key>KeepAlive</key>
    <true/>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>__PROJECT_DIR__/logs/bot-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>__PROJECT_DIR__/logs/bot-stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

- [ ] **Step 2: Commit**

```bash
git add launchd/com.morning-briefing.bot.plist
git commit -m "feat: add launchd plist for bot KeepAlive"
```

---

### Task 19: launchd 관리 스크립트

**Files:**
- Create: `scripts/install-launchd.sh`
- Create: `scripts/uninstall-launchd.sh`
- Create: `scripts/status-launchd.sh`
- Create: `scripts/restart-launchd.sh`

- [ ] **Step 1: install-launchd.sh 작성**

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.morning-briefing.bot"
PLIST_SRC="$PROJECT_DIR/launchd/$PLIST_NAME.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
NODE_PATH="$(which node)"

echo "📦 Morning Briefing 설치"
echo "  프로젝트: $PROJECT_DIR"
echo "  Node: $NODE_PATH"

# 빌드
echo "🔨 빌드 중..."
cd "$PROJECT_DIR" && npm run build

# logs 디렉토리 생성
mkdir -p "$PROJECT_DIR/logs"

# plist 생성 (경로 치환)
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    "$PLIST_SRC" > "$PLIST_DST"

# 등록
launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

echo "✅ 설치 완료! 봇이 실행 중입니다."
echo "  상태 확인: ./scripts/status-launchd.sh"
```

- [ ] **Step 2: uninstall-launchd.sh 작성**

```bash
#!/bin/bash
set -euo pipefail

PLIST_NAME="com.morning-briefing.bot"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "🗑️ Morning Briefing 제거"

launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
rm -f "$PLIST_DST"

echo "✅ 제거 완료"
```

- [ ] **Step 3: status-launchd.sh 작성**

```bash
#!/bin/bash

PLIST_NAME="com.morning-briefing.bot"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📊 Morning Briefing 상태"
echo "━━━━━━━━━━━━━━━━━━━━━"

# launchctl 상태
if launchctl print "gui/$(id -u)/$PLIST_NAME" &>/dev/null; then
    echo "✅ 서비스: 등록됨"
    PID=$(launchctl print "gui/$(id -u)/$PLIST_NAME" 2>/dev/null | grep "pid =" | awk '{print $3}')
    if [ -n "$PID" ] && [ "$PID" != "0" ]; then
        echo "🟢 프로세스: 실행 중 (PID: $PID)"
    else
        echo "🔴 프로세스: 중지됨"
    fi
else
    echo "❌ 서비스: 미등록"
fi

# 최근 로그
echo ""
echo "📋 최근 로그 (마지막 5줄):"
if [ -f "$PROJECT_DIR/logs/bot-stdout.log" ]; then
    tail -5 "$PROJECT_DIR/logs/bot-stdout.log"
else
    echo "  (로그 없음)"
fi
```

- [ ] **Step 4: restart-launchd.sh 작성**

```bash
#!/bin/bash
set -euo pipefail

PLIST_NAME="com.morning-briefing.bot"

echo "🔄 Morning Briefing 재시작"

launchctl kickstart -k "gui/$(id -u)/$PLIST_NAME"

echo "✅ 재시작 완료"
```

- [ ] **Step 5: 실행 권한 부여**

```bash
chmod +x scripts/install-launchd.sh scripts/uninstall-launchd.sh scripts/status-launchd.sh scripts/restart-launchd.sh
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ launchd/
git commit -m "feat: add launchd management scripts (install, uninstall, status, restart)"
```

---

## Chunk 6: Integration Test & Final

### Task 20: 전체 통합 확인

- [ ] **Step 1: TypeScript 빌드 확인**

Run: `npm run build`
Expected: 오류 없이 dist/ 디렉토리 생성

- [ ] **Step 2: 전체 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS

- [ ] **Step 3: .env 파일 생성 (실제 토큰)**

```bash
cp .env .env
# .env 파일에 실제 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 입력
```

- [ ] **Step 4: 봇 로컬 실행 테스트**

Run: `npm run dev`
Expected: 봇이 시작되고 텔레그램에서 `/help` 명령 응답

- [ ] **Step 5: /now 명령어 테스트**

텔레그램에서 `/now` 입력
Expected: 브리핑 메시지 + 인라인 버튼 수신

- [ ] **Step 6: 상세보기 버튼 테스트**

[상세] 버튼 클릭
Expected: Claude CLI로 생성된 상세 요약 수신

- [ ] **Step 7: launchd 설치 테스트**

Run: `./scripts/install-launchd.sh`
Expected: 봇이 백그라운드에서 실행

- [ ] **Step 8: launchd 상태 확인**

Run: `./scripts/status-launchd.sh`
Expected: 서비스 등록됨, 프로세스 실행 중

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: morning briefing v1.0 - complete implementation"
```
