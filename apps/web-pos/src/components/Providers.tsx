'use client';

import { ProgressProvider } from '@/components/ProgressDialog';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ProgressProvider>{children}</ProgressProvider>;
}
