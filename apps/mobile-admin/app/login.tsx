import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getSupabase } from '../src/lib/supabase';
import { api } from '../src/lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onLogin() {
    setBusy(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      Alert.alert('Login failed', error.message);
      return;
    }
    try {
      const me = await api<{ user: { role: string } }>('/me');
      if (me.user.role !== 'admin') {
        await getSupabase().auth.signOut();
        Alert.alert('Access denied', 'Admin role required');
        setBusy(false);
        return;
      }
      router.replace('/(tabs)/reports');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Auth failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Sunprime</Text>
      <Text style={styles.sub}>Mobile Admin</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.btn} onPress={onLogin} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
      <Link href="/(tabs)/reports" style={{ display: 'none' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f3f0e8' },
  brand: { fontSize: 32, fontWeight: '700', color: '#1e3a2b' },
  sub: { marginBottom: 24, color: '#5c675f' },
  input: {
    borderWidth: 1,
    borderColor: '#d4ccba',
    backgroundColor: '#fffcf5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: '#2f5540',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
});
