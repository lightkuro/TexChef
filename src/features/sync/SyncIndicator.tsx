import { Cloud, CloudOff, HardDrive, RefreshCw, AlertTriangle, LogOut, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useSync, connectDrive, disconnectDrive, syncNow } from './controller';
import { googleConfigured } from '@/features/auth/google';
import { Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Spinner } from '@/components/ui';
import { timeAgo } from '@/lib/utils';

/** Icon plus a short status; on phones (below `sm`) only the icon shows, the text stays for screen readers. */
export function SyncIndicator({ compact }: { compact?: boolean }) {
  const s = useSync();
  const connect = () => connectDrive().catch((e) => toast.error(e instanceof Error ? e.message : String(e)));

  if (s.state === 'local') {
    return (
      <Button variant="ghost" size="sm" onClick={connect} title={googleConfigured ? 'Sync your documents to your Google Drive' : 'Google sign-in is not configured'} data-testid="sync-indicator" data-sync>
        <HardDrive className="size-3.5 text-muted" />
        {!compact && <span className="text-muted max-sm:sr-only">Local only</span>}
        {googleConfigured && !compact && <span className="text-accent max-sm:sr-only">· Connect Drive</span>}
      </Button>
    );
  }
  if (s.state === 'needs-signin') {
    return (
      <Button variant="outline" size="sm" onClick={connect} className="border-warn text-warn" data-testid="sync-indicator" data-sync>
        <CloudOff className="size-3.5" /> <span className="max-sm:sr-only">Reconnect Drive</span>
      </Button>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="sync-indicator" data-sync>
          {s.state === 'syncing' ? (
            <Spinner className="text-accent" />
          ) : s.state === 'error' ? (
            <AlertTriangle className="size-3.5 text-danger" />
          ) : (
            <Cloud className="size-3.5 text-ok" />
          )}
          {!compact && (
            <span className="text-muted max-sm:sr-only">
              {s.state === 'syncing' ? 'Syncing…' : s.state === 'error' ? 'Sync error' : s.lastSync ? `Synced ${timeAgo(s.lastSync)}` : 'Drive'}
            </span>
          )}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Google Drive</MenuLabel>
        {s.user?.email && <div className="px-2 pb-1 text-xs text-muted">{s.user.email}</div>}
        {s.error && <div className="max-w-64 px-2 pb-1 text-xs break-words text-danger">{s.error}</div>}
        <MenuItem onSelect={() => void syncNow()}>
          <RefreshCw className="size-4" /> Sync now
        </MenuItem>
        <MenuItem onSelect={() => window.open('https://drive.google.com/drive/search?q=TexChef', '_blank', 'noopener')}>
          <FolderOpen className="size-4" /> Open TexChef folder in Drive
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={disconnectDrive}>
          <LogOut className="size-4" /> Disconnect (keep local copy)
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
