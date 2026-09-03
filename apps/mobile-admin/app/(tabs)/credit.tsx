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
import type {
  CreditSettlementReceipt,
  Customer,
  CustomerCreditSummary,
} from '@sunprime/shared';
import { api, money } from '../../src/lib/api';

export default function CreditScreen() {
  const [customers, setCustomers] = useState<(Customer & { outstanding?: number })[]>([]);
  const [summary, setSummary] = useState<CustomerCreditSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [settlement, setSettlement] = useState<CreditSettlementReceipt | null>(null);

  async function loadCustomers() {
    const r = await api<{ customers: (Customer & { outstanding?: number })[] }>('/customers');
    setCustomers(r.customers.filter((c) => (c.outstanding ?? 0) > 0));
  }

  useEffect(() => {
    loadCustomers().catch((e) => Alert.alert('Error', e.message));
  }, []);

  async function openCustomer(id: string) {
    const s = await api<CustomerCreditSummary>(`/customers/${id}/credit`);
    setSummary(s);
    setSettlement(null);
  }

  async function pay() {
    if (!summary) return;
    try {
      const receipt = await api<CreditSettlementReceipt>(
        `/customers/${summary.customer.id}/credit-payments`,
        { method: 'POST', body: JSON.stringify({ amount: Number(amount) }) },
      );
      setSettlement(receipt);
      setAmount('');
      await openCustomer(summary.customer.id);
      await loadCustomers();
    } catch (e) {
      Alert.alert('Payment failed', e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!summary ? (
        <>
          <Text style={styles.title}>Customers with outstanding credit</Text>
          {customers.map((c) => (
            <Pressable key={c.id} style={styles.card} onPress={() => openCustomer(c.id)}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.muted}>Outstanding: {money(c.outstanding ?? 0)}</Text>
            </Pressable>
          ))}
          {!customers.length && <Text style={styles.muted}>No outstanding credit.</Text>}
        </>
      ) : (
        <>
          <Pressable onPress={() => setSummary(null)}>
            <Text style={styles.link}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>{summary.customer.name}</Text>
          <Text style={styles.muted}>Total: {money(summary.total_outstanding)}</Text>
          {summary.orders.map((o) => (
            <View key={o.sale.id} style={styles.card}>
              <Text style={styles.name}>
                {o.sale.receipt_number} · bal {money(o.outstanding_balance)}
              </Text>
              {o.items.map((it) => (
                <Text key={it.id} style={styles.muted}>
                  {it.product_name} × {it.quantity} = {money(it.line_total)}
                </Text>
              ))}
            </View>
          ))}
          <TextInput
            style={styles.input}
            placeholder="Payment amount"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Pressable style={styles.btn} onPress={pay}>
            <Text style={styles.btnText}>Take payment (FIFO)</Text>
          </Pressable>
          {settlement && (
            <View style={styles.card}>
              <Text style={styles.name}>Settlement {settlement.receipt_number}</Text>
              <Text>Paid: {money(settlement.paid_amount)}</Text>
              <Text>Remaining debt: {money(settlement.total_remaining_debt)}</Text>
              {settlement.orders.map((o) => (
                <Text key={o.sale_id} style={styles.muted}>
                  {o.receipt_number}: −{money(o.amount_allocated)} → bal{' '}
                  {money(o.remaining_balance)}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f3f0e8', flexGrow: 1, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e3a2b' },
  name: { fontWeight: '600', color: '#1a211c' },
  muted: { color: '#5c675f', marginTop: 2 },
  card: {
    backgroundColor: '#fffcf5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d4ccba',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d4ccba',
    backgroundColor: '#fffcf5',
    borderRadius: 10,
    padding: 12,
  },
  btn: {
    backgroundColor: '#c47a1a',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  link: { color: '#2f5540', marginBottom: 4 },
});
