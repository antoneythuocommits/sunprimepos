import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { api, money } from '../../../src/lib/api';
import { useProgress } from '../../../src/components/ProgressDialog';

export default function ProductScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { withProgress } = useProgress();
  const [product, setProduct] = useState<Product | null>(null);
  const [delta, setDelta] = useState('');
  const [buying, setBuying] = useState('');
  const [selling, setSelling] = useState('');

  const load = useCallback(async () => {
    const p = await api<Product>(`/products/${id}`);
    setProduct(p);
    setBuying(String(p.buying_price));
    setSelling(String(p.selling_price));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void withProgress(load(), 'Loading product…').catch((e) =>
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed'),
      );
    }, [load, withProgress]),
  );

  async function adjust() {
    if (!product) return;
    const change = Number(delta);
    if (!Number.isFinite(change) || change === 0) {
      Alert.alert('Enter a quantity change other than 0');
      return;
    }
    try {
      const updated = await withProgress(
        api<Product>(`/products/${product.id}/stock`, {
          method: 'POST',
          body: JSON.stringify({ delta: change }),
        }),
        'Updating stock…',
      );
      setProduct(updated);
      setDelta('');
      Alert.alert('Stock updated');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Error');
    }
  }

  async function savePrices() {
    if (!product) return;
    const buyingPrice = Number(buying);
    const sellingPrice = Number(selling);
    if (!Number.isFinite(buyingPrice) || buyingPrice < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
      Alert.alert('Enter buying and selling prices of 0 or more');
      return;
    }
    try {
      const updated = await withProgress(
        api<Product>(`/products/${product.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ buying_price: buyingPrice, selling_price: sellingPrice }),
        }),
        'Saving prices…',
      );
      setProduct(updated);
      setBuying(String(updated.buying_price));
      setSelling(String(updated.selling_price));
      Alert.alert('Prices saved');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Error');
    }
  }

  if (!product) {
    return <View style={styles.container} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← Products</Text>
      </Pressable>
      <Text style={styles.title}>{product.name}</Text>
      {product.sku ? <Text style={styles.muted}>{product.sku}</Text> : null}
      <Text style={styles.muted}>
        Stock: {product.stock_quantity} {product.unit} · {product.category || 'general'}
      </Text>
      {product.buying_price <= 0 && <Text style={styles.warn}>No buying price</Text>}

      <Text style={styles.section}>Quantity</Text>
      <Text style={styles.muted}>Current: {product.stock_quantity} {product.unit}</Text>
      <TextInput
        style={styles.input}
        placeholder="Change (+/−)"
        keyboardType="numbers-and-punctuation"
        value={delta}
        onChangeText={setDelta}
      />
      <Pressable style={styles.btn} onPress={adjust}>
        <Text style={styles.btnText}>Apply quantity change</Text>
      </Pressable>

      <Text style={styles.section}>Prices</Text>
      <Text style={styles.label}>Buying price · now {money(product.buying_price)}</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={buying}
        onChangeText={setBuying}
      />
      <Text style={styles.label}>Selling price · now {money(product.selling_price)}</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={selling}
        onChangeText={setSelling}
      />
      <Pressable style={styles.btn} onPress={savePrices}>
        <Text style={styles.btnText}>Save prices</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f3f0e8', flexGrow: 1, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1e3a2b' },
  section: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#1e3a2b' },
  label: { fontSize: 12, color: '#5c675f' },
  muted: { color: '#5c675f' },
  warn: { color: '#c47a1a', fontWeight: '600' },
  link: { color: '#2f5540', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d4ccba',
    backgroundColor: '#fffcf5',
    borderRadius: 10,
    padding: 12,
  },
  btn: {
    backgroundColor: '#2f5540',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
});
