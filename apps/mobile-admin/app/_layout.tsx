import 'react-native-gesture-handler';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { getSupabase, supabaseConfigured } from '../src/lib/supabase';
import { api } from '../src/lib/api';
import { OfflineOverlay } from '../src/components/OfflineOverlay';
import { ProgressProvider, useProgress } from '../src/components/ProgressDialog';

function BootProgress({ open }: { open: boolean }) {
  const { show, hide } = useProgress();

  useEffect(() => {
    if (!open) return;
    const id = show('Starting…');
    return () => hide(id);
  }, [open, show, hide]);

  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const navState = useRootNavigationState();
  const [booting, setBooting] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!navState?.key) return;

    let mounted = true;

    (async () => {
      if (!supabaseConfigured) {
        if (mounted) {
          setConfigError(
            'App was built without valid Supabase settings. Update eas.json env values and rebuild the APK.',
          );
          setBooting(false);
        }
        return;
      }

      try {
        const { data } = await getSupabase().auth.getSession();
        if (!mounted) return;
        if (!data.session) {
          router.replace('/login');
          return;
        }
        try {
          const me = await api<{ user: { role: string } }>('/me');
          if (me.user.role !== 'admin') {
            await getSupabase().auth.signOut();
            router.replace('/login');
          } else {
            router.replace('/(tabs)/reports');
          }
        } catch {
          router.replace('/login');
        }
      } catch (err) {
        if (mounted) {
          setConfigError(err instanceof Error ? err.message : 'Failed to start');
        }
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navState?.key, router]);

  if (configError) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f3f0e8' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e3a2b', marginBottom: 8 }}>
            Configuration error
          </Text>
          <Text style={{ color: '#5c675f', lineHeight: 20 }}>{configError}</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProgressProvider>
        <StatusBar style="dark" />
        <BootProgress open={booting} />
        <Stack screenOptions={{ headerShown: false }} />
        <OfflineOverlay />
      </ProgressProvider>
    </GestureHandlerRootView>
  );
}
