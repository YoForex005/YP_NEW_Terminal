export type WebSocketStreamKey = string;
export type WebSocketStreamWildcard = '*';

export interface WebSocketStreamMessage<TPayload = unknown> {
  stream: WebSocketStreamKey;
  payload: TPayload;
  streamId?: string;
  priority?: number | string;
  coalesceKey?: string;
  publishedAt: number;
}

export type WebSocketStreamListener<TPayload = unknown> = (
  message: WebSocketStreamMessage<TPayload>,
) => void;

export interface WebSocketStreamDiagnostics {
  streams: Array<{
    stream: WebSocketStreamKey;
    listenerCount: number;
    publishedCount: number;
    lastPublishedAt?: number;
  }>;
  wildcardListenerCount: number;
  totalListenerCount: number;
  totalPublishedCount: number;
}

interface StreamStats {
  publishedCount: number;
  lastPublishedAt?: number;
}

export class WebSocketStreamRouter {
  private listeners = new Map<WebSocketStreamKey, Set<WebSocketStreamListener>>();
  private wildcardListeners = new Set<WebSocketStreamListener>();
  private stats = new Map<WebSocketStreamKey, StreamStats>();
  private totalPublishedCount = 0;

  subscribe<TPayload = unknown>(
    stream: WebSocketStreamKey | WebSocketStreamWildcard,
    listener: WebSocketStreamListener<TPayload>,
  ): () => void {
    const typedListener = listener as WebSocketStreamListener;

    if (stream === '*') {
      this.wildcardListeners.add(typedListener);
      return () => {
        this.wildcardListeners.delete(typedListener);
      };
    }

    const streamListeners = this.listeners.get(stream) ?? new Set();
    streamListeners.add(typedListener);
    this.listeners.set(stream, streamListeners);

    return () => {
      streamListeners.delete(typedListener);
      if (streamListeners.size === 0) {
        this.listeners.delete(stream);
      }
    };
  }

  publish<TPayload = unknown>(
    stream: WebSocketStreamKey,
    payload: TPayload,
    metadata: Omit<
      Partial<WebSocketStreamMessage<TPayload>>,
      'stream' | 'payload' | 'publishedAt'
    > = {},
  ): void {
    const publishedAt = Date.now();
    const message: WebSocketStreamMessage<TPayload> = {
      ...metadata,
      stream,
      payload,
      publishedAt,
    };
    const streamStats = this.stats.get(stream) ?? { publishedCount: 0 };
    streamStats.publishedCount += 1;
    streamStats.lastPublishedAt = publishedAt;
    this.stats.set(stream, streamStats);
    this.totalPublishedCount += 1;

    this.listeners.get(stream)?.forEach((listener) => listener(message));
    this.wildcardListeners.forEach((listener) => listener(message));
  }

  clear(stream?: WebSocketStreamKey | WebSocketStreamWildcard): void {
    if (stream === undefined) {
      this.listeners.clear();
      this.wildcardListeners.clear();
      this.stats.clear();
      this.totalPublishedCount = 0;
      return;
    }

    if (stream === '*') {
      this.wildcardListeners.clear();
      return;
    }

    this.listeners.delete(stream);
    this.stats.delete(stream);
  }

  diagnostics(): WebSocketStreamDiagnostics {
    const streams = new Set<WebSocketStreamKey>([
      ...this.listeners.keys(),
      ...this.stats.keys(),
    ]);
    const streamDiagnostics = [...streams]
      .sort()
      .map((stream) => {
        const stats = this.stats.get(stream);
        return {
          stream,
          listenerCount: this.listeners.get(stream)?.size ?? 0,
          publishedCount: stats?.publishedCount ?? 0,
          ...(stats?.lastPublishedAt ? { lastPublishedAt: stats.lastPublishedAt } : {}),
        };
      });

    return {
      streams: streamDiagnostics,
      wildcardListenerCount: this.wildcardListeners.size,
      totalListenerCount:
        this.wildcardListeners.size +
        streamDiagnostics.reduce((total, entry) => total + entry.listenerCount, 0),
      totalPublishedCount: this.totalPublishedCount,
    };
  }
}
