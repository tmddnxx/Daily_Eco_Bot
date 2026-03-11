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
