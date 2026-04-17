// HTTP client for the MLFactory AlphaZero service.
//
// The AZ service is a separate process (FastAPI) that loads a saved
// checkpoint and exposes POST /move. See MLFactory repo:
//   src/mlfactory/service/app.py
//
// This module is a thin wrapper: no retries on 4xx (those mean we sent
// a bad request — surface immediately), single retry on network errors
// or 5xx with short backoff. A total timeout guards against a hung
// service ruining a game.

import { GameState, PlayerColor } from '../game/types';

const DEFAULT_TIMEOUT_MS = 15_000;
const SINGLE_RETRY_DELAY_MS = 300;

export type AzWireMove =
  | { kind: 'place'; row: number; col: number; pieceType: 'kitten' | 'cat' }
  | { kind: 'graduation'; optionIndex: number };

export interface AzMoveResponse {
  kind: 'place' | 'graduation';
  row?: number;
  col?: number;
  pieceType?: 'kitten' | 'cat';
  optionIndex?: number;
  root_value?: number | null;
  sims: number;
  latency_ms: number;
}

export class AzServiceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzServiceUnavailable';
  }
}

export class AzServiceBadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzServiceBadRequest';
  }
}

export class AzClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    // Strip trailing slash so we can freely concatenate "/move".
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  // Probe the service. Throws if unreachable or the checkpoint failed to load.
  async health(): Promise<{ status: string; checkpoint: string | null; params: number | null }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/health`, { method: 'GET' });
    if (!res.ok) {
      throw new AzServiceUnavailable(`AZ /health returned ${res.status}`);
    }
    return res.json() as Promise<{ status: string; checkpoint: string | null; params: number | null }>;
  }

  // Ask the service for a move. `color` is which side the bot plays.
  async requestMove(state: GameState, color: PlayerColor): Promise<AzMoveResponse> {
    const body = JSON.stringify({ state, color });
    const url = `${this.baseUrl}/move`;

    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.status >= 400 && res.status < 500) {
          const text = await res.text();
          throw new AzServiceBadRequest(`AZ /move ${res.status}: ${text}`);
        }
        if (!res.ok) {
          const text = await res.text();
          throw new AzServiceUnavailable(`AZ /move ${res.status}: ${text}`);
        }
        const json = (await res.json()) as AzMoveResponse;
        this.validateMoveResponse(json);
        return json;
      } catch (err) {
        // Don't retry on 4xx — those are caller bugs.
        if (err instanceof AzServiceBadRequest) throw err;
        lastErr = err;
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, SINGLE_RETRY_DELAY_MS));
          continue;
        }
      }
    }
    throw new AzServiceUnavailable(
      `AZ /move failed after retry: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private validateMoveResponse(json: AzMoveResponse): void {
    if (json.kind === 'place') {
      if (
        typeof json.row !== 'number' ||
        typeof json.col !== 'number' ||
        (json.pieceType !== 'kitten' && json.pieceType !== 'cat')
      ) {
        throw new AzServiceBadRequest('AZ returned malformed place move');
      }
      return;
    }
    if (json.kind === 'graduation') {
      if (typeof json.optionIndex !== 'number' || json.optionIndex < 0) {
        throw new AzServiceBadRequest('AZ returned malformed graduation move');
      }
      return;
    }
    throw new AzServiceBadRequest(`AZ returned unknown kind: ${(json as { kind: string }).kind}`);
  }
}

// Singleton, configured from env. Null if AZ_SERVICE_URL is not set.
let _singleton: AzClient | null = null;

export function getAzClient(): AzClient | null {
  if (_singleton) return _singleton;
  const url = process.env.AZ_SERVICE_URL;
  if (!url) return null;
  _singleton = new AzClient(url);
  return _singleton;
}
