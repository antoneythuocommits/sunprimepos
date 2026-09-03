'use client';

import { AppShell } from '@/components/AppShell';
import { PosTerminal } from '@/components/PosTerminal';

export default function PosPage() {
  return (
    <AppShell>
      <PosTerminal />
    </AppShell>
  );
}
