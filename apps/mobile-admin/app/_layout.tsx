import 'react-native-gesture-handler';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { getSupabase, supabaseConfigured } from '../src/lib/supabase';
import { api } from '../src/lib/api';

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
      <StatusBar style="dark" />
      {booting && (
        <View
          style={{
            ...StyleSheetAbsolute,
          }}
        >
          <ActivityIndicator size="large" color="#2f5540" />
        </View>
      )}
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}

const StyleSheetAbsolute = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  zIndex: 10,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  backgroundColor: '#f3f0e8',
};
