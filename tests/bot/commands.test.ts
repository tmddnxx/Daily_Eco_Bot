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
        telegram: { subscriberChatIds: [] },
      } as any, 5, 2);
      expect(result).toContain('07:00');
      expect(result).toContain('읽기 전용');
    });
  });
});
