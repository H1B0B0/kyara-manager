export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'waiting' | 'installing' | 'updated' | 'no_update' | 'throttled' | 'error';
  currentVersion: string;
  availableVersion?: string;
  checkedAt?: number;
  error?: string;
}
