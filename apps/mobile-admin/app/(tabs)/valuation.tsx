import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { InventoryValuation } from '@sunprime/shared';
import { api, money } from '../../src/lib/api';

export default function ValuationScreen() {
  const [data, setData] = useState<InventoryValuation | null>(null);

  useEffect(() => {
    api<InventoryValuation>('/inventory/valuation')
      .then(setData)
      .catch((e) => Alert.alert('Error', e.message));
  }, []);

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Loading valuation…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.totals}>
        <Text style={styles.label}>Total at buying price</Text>
        <Text style={styles.big}>{money(data.total_at_buying)}</Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Total at selling price</Text>
        <Text style={styles.big}>{money(data.total_at_selling)}</Text>
      </View>
      {data.products.map((p) => (
        <View key={p.product_id} style={styles.card}>
          <Text style={styles.name}>{p.name}</Text>
          <Text style={styles.muted}>
            {p.stock_quantity} {p.unit}
          </Text>
          <Text style={styles.muted}>
            Buy value {money(p.value_at_buying)} · Sell value {money(p.value_at_selling)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f3f0e8', flexGrow: 1, gap: 10 },
  totals: {
    backgroundColor: '#1e3a2b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  label: { color: '#c8d5cc', fontSize: 12, textTransform: 'uppercase' },
  big: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 4 },
  card: {
    backgroundColor: '#fffcf5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d4ccba',
  },
  name: { fontWeight: '600' },
  muted: { color: '#5c675f', marginTop: 2 },
});
