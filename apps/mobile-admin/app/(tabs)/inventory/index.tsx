import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import type { Product } from '@sunprime/shared';
import { api, money } from '../../../src/lib/api';
import { useProgress } from '../../../src/components/ProgressDialog';

export default function InventoryScreen() {
  const router = useRouter();
  const { withProgress } = useProgress();
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const skipSearchEffect = useRef(true);
  const searchRef = useRef(search);
  searchRef.current = search;

  async function load(q: string) {
    const r = await api<{ products: Product[] }>(
      `/products?search=${encodeURIComponent(q)}&limit=2000`,
    );
    setProducts(r.products);
  }

  useFocusEffect(
    useCallback(() => {
      void withProgress(load(searchRef.current), 'Loading inventory…').catch((e) =>
        Alert.alert('Error', e.message),
      );
    }, [withProgress]),
  );

  useEffect(() => {
    if (skipSearchEffect.current) {
      skipSearchEffect.current = false;
      return;
    }
    const t = setTimeout(() => {
      load(search).catch((e) => Alert.alert('Error', e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  const missing = products.filter((p) => p.buying_price <= 0).length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search products…"
        value={search}
        onChangeText={setSearch}
      />
      {missing > 0 && (
        <Text style={styles.warn}>
          {missing} {missing === 1 ? 'product has' : 'products have'} no buying price.
        </Text>
      )}
      {products.map((p) => (
        <Pressable
          key={p.id}
          style={styles.card}
          onPress={() => router.push(`/(tabs)/inventory/${p.id}`)}
        >
          <Text style={styles.name}>{p.name}</Text>
          {p.buying_price <= 0 && <Text style={styles.warn}>No buying price</Text>}
          <Text style={styles.muted}>
            Stock: {p.stock_quantity} {p.unit} · {p.category || 'general'} · Buy {money(p.buying_price)} ·
            Sell {money(p.selling_price)}
          </Text>
        </Pressable>
      ))}
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
  name: { fontWeight: '600', color: '#1a211c' },
  muted: { color: '#5c675f', marginTop: 2 },
  warn: { color: '#c47a1a', fontWeight: '600', marginTop: 2 },
});
