type CachedTitle = {
  title: string;
  timestamp: number;
  version: number;
};

export class TitleCache {
  private static instance: TitleCache | null = null;
  private cache = new Map<string, CachedTitle>();
  private static readonly CACHE_TTL = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): TitleCache {
    if (!TitleCache.instance) {
      TitleCache.instance = new TitleCache();
    }
    return TitleCache.instance;
  }

  set(id: string, title: string, version: number) {
    this.cache.set(id, {
      title,
      timestamp: Date.now(),
      version
    });
  }

  get(id: string): string | undefined {
    const cached = this.cache.get(id);
    if (!cached) return undefined;

    const now = Date.now();
    if (now - cached.timestamp > TitleCache.CACHE_TTL) {
      this.cache.delete(id);
      return undefined;
    }

    return cached.title;
  }

  cleanup() {
    const now = Date.now();
    const threshold = now - TitleCache.CACHE_TTL;
    let cleaned = 0;

    this.cache.forEach((info, id) => {
      if (info.timestamp < threshold) {
        this.cache.delete(id);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log('🧹 Title cache cleaned:', {
        cleaned,
        remaining: this.cache.size
      });
    }
  }
}