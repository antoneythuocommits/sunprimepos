'use client';

import { AuthProvider } from '@/components/AuthProvider';
import { OfflineOverlay } from '@/components/OfflineOverlay';
import { ProgressProvider } from '@/components/ProgressDialog';
import { ThemeProvider } from '@/components/ThemeProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProgressProvider>
          {children}
          <OfflineOverlay />
        </ProgressProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
