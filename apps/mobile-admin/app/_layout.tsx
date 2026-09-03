import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../src/lib/supabase';
import { api } from '../src/lib/api';

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        router.replace('/login');
        setReady(true);
        return;
      }
      try {
        const me = await api<{ user: { role: string } }>('/me');
        if (me.user.role !== 'admin') {
          await supabase.auth.signOut();
          router.replace('/login');
        } else {
          router.replace('/(tabs)/reports');
        }
      } catch {
        router.replace('/login');
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
