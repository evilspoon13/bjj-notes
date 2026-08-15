import { Button, Card, Section } from '@/components/ui';
import { clearKey, getKey } from '@/lib/key';
import { useSessions, useTechniques } from '@/lib/queries';

export function Settings() {
  const sessions = useSessions();
  const techniques = useTechniques({});

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <Section title="Your data">
        <Card>
          <div className="flex justify-between">
            <span className="text-fg-muted">Sessions</span>
            <span className="font-bold">{sessions.data?.length ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Techniques</span>
            <span className="font-bold">{techniques.data?.length ?? '—'}</span>
          </div>
        </Card>
      </Section>

      <Section title="Backup">
        <p className="text-sm text-fg-muted">
          Your journal lives on a single server volume. Downloading a backup now and
          then is the only thing standing between you and losing it.
        </p>
        {/* A plain link would drop the passphrase header, so fetch and save. */}
        <Button variant="subtle" onClick={() => void downloadExport()}>
          Download backup (JSON)
        </Button>
      </Section>

      <Section title="Access">
        <Button variant="danger" onClick={clearKey}>
          Forget passphrase on this device
        </Button>
      </Section>
    </div>
  );
}

async function downloadExport(): Promise<void> {
  const key = getKey();

  const response = await fetch('/api/export', {
    headers: key ? { 'X-BJJ-Key': key } : {},
  });
  if (!response.ok) {
    window.alert('Could not download the backup.');
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bjj-notes-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
