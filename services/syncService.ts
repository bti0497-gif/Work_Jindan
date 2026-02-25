/**
 * DEOJON TECH STUDIO - CLOUD SYNC PROTOCOL (v2.1)
 * [PROTECTED] JSON-based Event Sourcing Sync Service
 */

export type SyncCategory = 'PROJECT' | 'PROCESS' | 'TASK' | 'BOARD' | 'CHAT' | 'HEARTBEAT';
export type SyncAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'PING';

export interface SyncMessage {
  id: string;          
  category: SyncCategory;
  action: SyncAction;
  targetId: string;    
  payload: any;        
  meta: {
    timestamp: number;
    userId: string;
    userName: string;
  };
}

export const SyncService = {
  STORAGE_URL: 'http://localhost:5000/api',
  lastFetchedTimestamp: 0,

  /**
   * 변경 사항을 JSON으로 서버에 전송
   */
  async broadcastChange(category: SyncCategory, action: SyncAction, targetId: string, data: any, userId: string, userName: string) {
    const message: SyncMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      category,
      action,
      targetId,
      payload: data,
      meta: {
        timestamp: Date.now(),
        userId,
        userName
      }
    };

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${this.STORAGE_URL}/sync/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error('Sync broadcast failed');
    }

    return message;
  },

  /**
   * 서버에서 신규 업데이트 수신
   */
  async fetchNewUpdates(category: SyncCategory) {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${this.STORAGE_URL}/sync/updates?since=${this.lastFetchedTimestamp}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      throw new Error('Sync polling failed');
    }

    const updates = (await response.json()) as SyncMessage[];
    if (updates.length > 0) {
      const latest = Math.max(...updates.map(u => u.meta.timestamp));
      this.lastFetchedTimestamp = Math.max(this.lastFetchedTimestamp, latest);
    }

    return updates.filter(u => u.category === category);
  },

  /**
   * 접속 유지 신호 (Heartbeat) 발송
   */
  async sendHeartbeat(userId: string, userName: string) {
    return this.broadcastChange('HEARTBEAT', 'PING', userId, { status: 'online' }, userId, userName);
  },

  /**
   * Google Drive 최신 스냅샷을 로컬 DB로 가져오기
   */
  async importLatestSnapshot() {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${this.STORAGE_URL}/sync/import-latest`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      throw new Error('Drive snapshot import failed');
    }
    return response.json();
  }
};
