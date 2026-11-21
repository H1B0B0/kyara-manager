export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'waiting' | 'installing' | 'updated' | 'no_update' | 'throttled' | 'error';
  currentVersion: string;
  availableVersion?: string;
  checkedAt?: number;
  remoteCheckedAt?: number;
  source?: 'cws' | 'github';
  releaseUrl?: string;
  cwsInstall?: boolean;
  cwsUrl?: string;
  cwsPending?: boolean;
  dismissedVersion?: string;
  notes?: string;
  error?: string;
}
