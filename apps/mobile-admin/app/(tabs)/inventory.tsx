import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Product } from '@sunprime/shared';
import { api, money } from '../../src/lib/api';

export default function InventoryScreen() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');

  async function load(q: string) {
    const r = await api<{ products: Product[] }>(
      `/products?search=${encodeURIComponent(q)}&limit=50`,
    );
    setProducts(r.products);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      load(search).catch((e) => Alert.alert('Error', e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  async function adjust() {
    if (!selected) return;
    try {
      await api(`/products/${selected.id}/stock`, {
        method: 'POST',
        body: JSON.stringify({ delta: Number(delta), reason }),
      });
      Alert.alert('Stock updated');
      setSelected(null);
      setDelta('');
      setReason('');
      await load(search);
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search products…"
        value={search}
        onChangeText={setSearch}
      />
      {products.map((p) => (
        <Pressable key={p.id} style={styles.card} onPress={() => setSelected(p)}>
          <Text style={styles.name}>{p.name}</Text>
          <Text style={styles.muted}>
            Stock: {p.stock_quantity} {p.unit} · Sell {money(p.selling_price)}
          </Text>
        </Pressable>
      ))}

      {selected && (
        <View style={styles.panel}>
          <Text style={styles.name}>Adjust — {selected.name}</Text>
          <Text style={styles.muted}>
            Current: {selected.stock_quantity} {selected.unit}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Delta (+/−)"
            keyboardType="numbers-and-punctuation"
            value={delta}
            onChangeText={setDelta}
          />
          <TextInput
            style={styles.input}
            placeholder="Reason"
            value={reason}
            onChangeText={setReason}
          />
          <Pressable style={styles.btn} onPress={adjust}>
            <Text style={styles.btnText}>Apply adjustment</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f3f0e8', flexGrow: 1, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#d4ccba',
    backgroundColor: '#fffcf5',
    borderRadius: 10,
    padding: 12,
  },
  card: {
    backgroundColor: '#fffcf5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d4ccba',
  },
  panel: {
    backgroundColor: '#fffcf5',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2f5540',
  },
  name: { fontWeight: '600' },
  muted: { color: '#5c675f', marginTop: 2 },
  btn: {
    backgroundColor: '#2f5540',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  link: { color: '#2f5540', textAlign: 'center' },
});
