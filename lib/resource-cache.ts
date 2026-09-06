export type ResourceSnapshot<T> = { data: T | undefined; loading: boolean; error: string | null };

/** In-memory, account-scoped data. No tokens or session content are persisted. */
export class Resource<T> {
  private snapshot: ResourceSnapshot<T> = { data: undefined, loading: true, error: null };
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private loader: (() => Promise<T>) | null = null;
  private revision = 0;
  private stale = true;

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: ResourceSnapshot<T>) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  load = (loader: () => Promise<T>): Promise<void> => {
    this.loader = loader;
    if (this.pending) return this.pending;
    if (!this.stale) return Promise.resolve();
    const revision = this.revision;
    this.publish({ ...this.snapshot, loading: this.snapshot.data === undefined, error: null });
    this.pending = Promise.resolve().then(loader).then((data) => {
      if (revision !== this.revision) return;
      this.stale = false;
      this.publish({ data, loading: false, error: null });
    }).catch((error: unknown) => {
      if (revision !== this.revision) return;
      this.publish({ ...this.snapshot, loading: false, error: error instanceof Error ? error.message : 'Unable to load saved sessions.' });
    }).finally(() => {
      if (revision === this.revision) this.pending = null;
    });
    return this.pending;
  };
  setData = (update: T | ((previous: T | undefined) => T)) => {
    this.revision++;
    this.pending = null;
    this.stale = false;
    const data = typeof update === 'function'
      ? (update as (previous: T | undefined) => T)(this.snapshot.data) : update;
    this.publish({ data, loading: false, error: null });
  };
  invalidate = () => {
    this.revision++;
    this.pending = null;
    this.stale = true;
    // Keep cached content visible. Inactive pages reload when next mounted.
    if (this.listeners.size && this.loader) void this.load(this.loader);
  };
}

export class ResourceCache {
  private resources = new Map<string, Resource<unknown>>();
  get<T>(key: string): Resource<T> {
    if (!this.resources.has(key)) this.resources.set(key, new Resource());
    return this.resources.get(key) as Resource<T>;
  }
  invalidate = () => this.resources.forEach((resource) => resource.invalidate());
}
