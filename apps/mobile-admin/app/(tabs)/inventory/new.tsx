import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Product } from '@sunprime/shared';
import { api } from '../../../src/lib/api';
import { useProgress } from '../../../src/components/ProgressDialog';

const CATEGORIES = ['general', 'fegi'] as const;

export default function NewProductScreen() {
  const router = useRouter();
  const { withProgress } = useProgress();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [buying, setBuying] = useState('');
  const [selling, setSelling] = useState('');
  const [stock, setStock] = useState('0');
  const [unit, setUnit] = useState('pcs');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('general');

  async function save() {
    const buyingPrice = Number(buying);
    const sellingPrice = Number(selling);
    const stockQty = Number(stock || '0');
    if (!name.trim()) {
      Alert.alert('Enter a product name');
      return;
    }
    if (
      buying.trim() === '' ||
      selling.trim() === '' ||
      !Number.isFinite(buyingPrice) ||
      buyingPrice < 0 ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0
    ) {
      Alert.alert('Enter buying and selling prices of 0 or more');
      return;
    }
    if (!Number.isFinite(stockQty) || stockQty < 0) {
      Alert.alert('Enter a stock quantity of 0 or more');
      return;
    }
    if (category === 'fegi' && !Number.isInteger(stockQty)) {
      Alert.alert('Fegi stock must be a whole number');
      return;
    }
    try {
      const created = await withProgress(
        api<Product>('/products', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            sku: sku.trim() || null,
            buying_price: buyingPrice,
            selling_price: sellingPrice,
            stock_quantity: stockQty,
            unit: unit.trim() || 'pcs',
            category,
          }),
        }),
        'Creating product…',
      );
      router.replace(`/(tabs)/inventory/${created.id}`);
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← Products</Text>
      </Pressable>
      <Text style={styles.title}>New product</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>SKU / barcode (optional)</Text>
      <TextInput style={styles.input} value={sku} onChangeText={setSku} autoCapitalize="none" />

      <Text style={styles.label}>Buying price</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={buying} onChangeText={setBuying} />

      <Text style={styles.label}>Selling price</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={selling} onChangeText={setSelling} />

      <Text style={styles.label}>Opening stock</Text>
      <TextInput
        style={styles.input}
        keyboardType={category === 'fegi' ? 'number-pad' : 'decimal-pad'}
        value={stock}
        onChangeText={setStock}
      />

      <Text style={styles.label}>Unit</Text>
      <TextInput style={styles.input} value={unit} onChangeText={setUnit} autoCapitalize="none" />

      <Text style={styles.label}>Category</Text>
      <View style={styles.row}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            style={[styles.chip, category === c && styles.chipActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
              {c === 'fegi' ? 'Fegi' : 'General'}
            </Text>
          </Pressable>
        ))}
      </View>
      {category === 'fegi' && (
        <Text style={styles.muted}>Fegi stock is counted in whole pieces.</Text>
      )}

      <Pressable style={styles.btn} onPress={save}>
        <Text style={styles.btnText}>Create product</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f3f0e8', flexGrow: 1, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1e3a2b' },
  label: { fontSize: 12, color: '#5c675f', marginTop: 4 },
  muted: { color: '#5c675f' },
  link: { color: '#2f5540', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d4ccba',
    backgroundColor: '#fffcf5',
    borderRadius: 10,
    padding: 12,
  },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d4ccba',
    backgroundColor: '#fffcf5',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#2f5540', borderColor: '#2f5540' },
  chipText: { color: '#1a211c', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  btn: {
    backgroundColor: '#2f5540',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '600' },
});
