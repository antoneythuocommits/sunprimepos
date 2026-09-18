import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import {
  getOffline,
  pingInternet,
  reportNetworkFailure,
  reportNetworkSuccess,
  subscribeOffline,
} from '../lib/connectivity';

export function OfflineOverlay() {
  const [offline, setOffline] = useState(false);

  useEffect(() => subscribeOffline(setOffline), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = 0;

    function schedule() {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void check();
      }, getOffline() ? 3000 : 15000);
    }

    async function check() {
      if (cancelled) return;
      const ok = await pingInternet();
      if (cancelled) return;
      if (ok) {
        fails = 0;
        reportNetworkSuccess();
      } else {
        fails += 1;
        if (fails >= 2) reportNetworkFailure();
      }
      schedule();
    }

    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  if (!offline) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityRole="alert">
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#2f5540" />
        <Text style={styles.title}>No internet connection</Text>
        <Text style={styles.copy}>
          Check your internet connection. This page will resume automatically when you are back
          online.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 400,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fffcf5',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  title: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#1e3a2b',
    textAlign: 'center',
  },
  copy: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#5c675f',
    textAlign: 'center',
  },
});
