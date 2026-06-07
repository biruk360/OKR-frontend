type CacheEntry = {
  value: boolean;
  expiresAt: number;
};

const MAX_ENTRIES = 10_000;
const TTL_MS = 30_000;

class PermissionCache {
  private store: Map<string, CacheEntry> = new Map();

  get(key: string): boolean | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: boolean): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }

  invalidateUser(userId: string): void {
    const prefix = `perm:${userId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  invalidateAll(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const permissionCache = new PermissionCache();
