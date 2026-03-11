/**
 * JSON 파일 기반 저장소
 *
 * 별도 DB 없이 JSON 파일로 데이터를 관리합니다:
 * - watchlist.json: 관심 키워드 목록 (예: ["삼성전자", "AI"])
 * - sent-cache.json: 이미 전송한 뉴스 ID (중복 알림 방지)
 * - history.json: 과거 브리핑 기록 (/history 명령어용)
 * - detail-cache.json: Claude CLI로 생성한 상세 요약 캐시
 *
 * pruneCache/pruneHistory로 오래된 데이터를 자동 정리합니다.
 */
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
