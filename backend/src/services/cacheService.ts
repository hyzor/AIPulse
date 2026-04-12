import NodeCache from 'node-cache';

class CacheService {
  private cache: NodeCache;

  constructor(ttlSeconds: number = 60) {
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2,
      useClones: true,
    });

    // Listen for cache events
    this.cache.on('expired', (key) => {
      console.log(`[Cache] Key expired: ${key}`);
    });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    return this.cache.set(key, value, ttl as number | string);
  }

  del(key: string): number {
    return this.cache.del(key);
  }

  flush(): void {
    this.cache.flushAll();
    console.log('[Cache] Flushed all entries');
  }

  getStats(): NodeCache.Stats {
    return this.cache.getStats();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  keys(): string[] {
    return this.cache.keys();
  }
}

export const cacheService = new CacheService(
  parseInt(process.env.CACHE_TTL_SECONDS || '60', 10)
);
