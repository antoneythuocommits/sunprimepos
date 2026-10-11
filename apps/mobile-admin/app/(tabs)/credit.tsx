import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
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
import { formatQuantityDisplay } from '@sunprime/shared';
import { api, money } from '../../src/lib/api';
import { useProgress } from '../../src/components/ProgressDialog';

export default function CreditScreen() {
  const { withProgress } = useProgress();
  const [customers, setCustomers] = useState<(Customer & { outstanding?: number })[]>([]);
  const [summary, setSummary] = useState<CustomerCreditSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [settlement, setSettlement] = useState<CreditSettlementReceipt | null>(null);
  const [query, setQuery] = useState('');
  const [totalDebt, setTotalDebt] = useState(0);
  const skipSearch = useRef(true);
  const queryRef = useRef(query);
  queryRef.current = query;

  async function loadCustomers(search = query) {
    const q = search.trim();
    const path = q ? `/customers?search=${encodeURIComponent(q)}` : '/customers';
    const r = await api<{
      customers: (Customer & { outstanding?: number })[];
      total_outstanding: number;
    }>(path);
    setCustomers(r.customers.filter((c) => (c.outstanding ?? 0) > 0));
    setTotalDebt(r.total_outstanding ?? 0);
  }

  useFocusEffect(
    useCallback(() => {
      void withProgress(loadCustomers(queryRef.current), 'Loading customers…').catch((e) =>
        Alert.alert('Error', e.message),
      );
    }, [withProgress]),
  );

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      loadCustomers(query).catch((e) =>
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed'),
      );
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function openCustomer(id: string) {
    await withProgress(
      (async () => {
        const s = await api<CustomerCreditSummary>(`/customers/${id}/credit`);
        setSummary(s);
        setSettlement(null);
      })(),
      'Loading credit orders…',
    );
  }

  async function pay() {
    if (!summary) return;
    try {
      await withProgress(
        (async () => {
          const receipt = await api<CreditSettlementReceipt>(
            `/customers/${summary.customer.id}/credit-payments`,
            { method: 'POST', body: JSON.stringify({ amount: Number(amount) }) },
          );
          setSettlement(receipt);
          setAmount('');
          const s = await api<CustomerCreditSummary>(`/customers/${summary.customer.id}/credit`);
          setSummary(s);
          await loadCustomers();
        })(),
        'Recording payment…',
      );
    } catch (e) {
      Alert.alert('Payment failed', e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!summary ? (
        <>
          <Text style={styles.title}>Customers with outstanding credit</Text>
          <Text style={styles.total}>Total debt {money(totalDebt)}</Text>
          <TextInput
            style={styles.input}
            placeholder="Search customer name"
            value={query}
            onChangeText={setQuery}
          />
          {customers.map((c) => (
            <Pressable
              key={c.id}
              style={styles.card}
              onPress={() =>
                openCustomer(c.id).catch((e) =>
                  Alert.alert('Error', e instanceof Error ? e.message : 'Failed'),
                )
              }
            >
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.muted}>Outstanding: {money(c.outstanding ?? 0)}</Text>
            </Pressable>
          ))}
          {!customers.length && (
            <Text style={styles.muted}>
              {query.trim() ? 'No customers match that name.' : 'No outstanding credit.'}
            </Text>
          )}
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
                {o.sale.receipt_number} · total {money(o.sale.total_amount)} · paid{' '}
                {money(o.allocated_total)} · bal {money(o.outstanding_balance)}
              </Text>
              {o.items.map((it) => (
                <Text key={it.id} style={styles.muted}>
                  {it.product_name} × {formatQuantityDisplay(it.quantity)} = {money(it.line_total)}
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
  total: { fontSize: 16, fontWeight: '700', color: '#1a211c' },
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
