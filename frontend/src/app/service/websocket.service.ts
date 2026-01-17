import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, timer } from 'rxjs';
import { filter, map, takeUntil, share } from 'rxjs/operators';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: string;
}

export interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  clientId: string | null;
  reconnecting: boolean;
  error: string | null;
}

export interface SearchSuggestion {
  _id: string;
  hungarian: string;
  english: string;
  fieldOfExpertise: string;
  score?: number;
}

export interface RealTimeSearchResult {
  results: SearchSuggestion[];
  totalCount: number;
  searchTime: number;
}

@Injectable({
  providedIn: 'root',
})
export class WebSocketService implements OnDestroy {
  private socket$: WebSocketSubject<WebSocketMessage> | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly reconnectInterval = 5000;
  private readonly maxReconnectAttempts = 10;
  private reconnectAttempts = 0;

  private readonly connectionState$ = new BehaviorSubject<ConnectionState>({
    connected: false,
    authenticated: false,
    clientId: null,
    reconnecting: false,
    error: null,
  });

  private readonly messages$ = new Subject<WebSocketMessage>();
  private readonly searchResults$ = new Subject<RealTimeSearchResult>();
  private readonly notifications$ = new Subject<WebSocketMessage>();

  constructor(private readonly authService: AuthService) {
    this.authService.user$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user && !this.isConnected) {
        this.connect();
      } else if (!user && this.isConnected) {
        this.disconnect();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.disconnect();
  }

  get connectionState(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  get isConnected(): boolean {
    return this.connectionState$.value.connected;
  }

  get isAuthenticated(): boolean {
    return this.connectionState$.value.authenticated;
  }

  connect(): void {
    if (this.socket$) {
      return;
    }

    const wsUrl = this.getWebSocketUrl();

    this.socket$ = webSocket<WebSocketMessage>({
      url: wsUrl,
      openObserver: {
        next: () => {
          this.reconnectAttempts = 0;
          this.updateConnectionState({ connected: true, reconnecting: false, error: null });
          this.authenticate();
        },
      },
      closeObserver: {
        next: () => {
          this.updateConnectionState({ connected: false, authenticated: false, clientId: null });
          this.scheduleReconnect();
        },
      },
    });

    this.socket$.pipe(takeUntil(this.destroy$)).subscribe({
      next: message => this.handleMessage(message),
      error: error => this.handleError(error),
    });
  }

  disconnect(): void {
    if (this.socket$) {
      this.socket$.complete();
      this.socket$ = null;
    }
    this.updateConnectionState({
      connected: false,
      authenticated: false,
      clientId: null,
      reconnecting: false,
    });
  }

  send<T>(type: string, payload: T): void {
    if (!this.socket$ || !this.isConnected) {
      return;
    }

    this.socket$.next({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  on<T>(type: string): Observable<T> {
    return this.messages$.pipe(
      filter(msg => msg.type === type),
      map(msg => msg.payload as T),
      share()
    );
  }

  search(query: string, options?: { limit?: number; fieldOfExpertise?: string }): void {
    this.send('search', {
      query,
      options: {
        limit: options?.limit ?? 10,
        fieldOfExpertise: options?.fieldOfExpertise,
      },
    });
  }

  getSearchResults(): Observable<RealTimeSearchResult> {
    return this.searchResults$.asObservable();
  }

  subscribe(channels: string[]): void {
    this.send('subscribe', { channels });
  }

  unsubscribe(channels: string[]): void {
    this.send('unsubscribe', { channels });
  }

  joinRoom(roomId: string): void {
    this.send('join_room', { roomId });
  }

  leaveRoom(roomId: string): void {
    this.send('leave_room', { roomId });
  }

  sendTyping(roomId: string, isTyping: boolean): void {
    this.send('typing', { roomId, isTyping });
  }

  getNotifications(): Observable<WebSocketMessage> {
    return this.notifications$.asObservable();
  }

  private getWebSocketUrl(): string {
    const apiUrl = environment.apiUrl;
    const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws';
    const host = apiUrl.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${host}/ws`;
  }

  private authenticate(): void {
    const token = this.authService.token;
    if (token) {
      this.send('auth', { token });
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'connection':
        this.updateConnectionState({
          clientId: (message.payload as { clientId: string }).clientId,
        });
        break;

      case 'auth_success':
        this.updateConnectionState({ authenticated: true });
        this.subscribe(['entries:public', 'search:suggestions']);
        break;

      case 'auth_failed':
        this.updateConnectionState({ authenticated: false, error: 'Authentication failed' });
        break;

      case 'search_results':
      case 'search_suggestions':
        this.searchResults$.next(message.payload as RealTimeSearchResult);
        break;

      case 'notification':
      case 'entry_created':
      case 'entry_updated':
      case 'entry_deleted':
        this.notifications$.next(message);
        break;

      case 'error':
        this.updateConnectionState({ error: String(message.payload) });
        break;

      case 'heartbeat_ack':
        break;

      default:
        this.messages$.next(message);
    }
  }

  private handleError(error: Error): void {
    this.updateConnectionState({ error: error.message });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.updateConnectionState({
        reconnecting: false,
        error: 'Max reconnection attempts reached',
      });
      return;
    }

    this.reconnectAttempts++;
    this.updateConnectionState({ reconnecting: true });

    timer(this.reconnectInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.socket$ = null;
        this.connect();
      });
  }

  private updateConnectionState(partial: Partial<ConnectionState>): void {
    this.connectionState$.next({
      ...this.connectionState$.value,
      ...partial,
    });
  }
}
