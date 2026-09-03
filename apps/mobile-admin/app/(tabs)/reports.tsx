import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SalesReport } from '@sunprime/shared';
import { api, money } from '../../src/lib/api';

export default function ReportsScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const r = await api<SalesReport>(`/reports/sales?from=${from}&to=${to}&group=range`);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>From (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={from} onChangeText={setFrom} />
      <Text style={styles.label}>To (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={to} onChangeText={setTo} />
      <Pressable style={styles.btn} onPress={run}>
        <Text style={styles.btnText}>Run report</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {report && (
        <View style={styles.card}>
          <Row label="Revenue" value={money(report.totals.revenue)} />
          <Row label="Cost" value={money(report.totals.cost)} />
          <Row label="Profit" value={money(report.totals.profit)} />
          <Row label="Sales" value={String(report.totals.sale_count)} />
          <Row
            label="Cash"
            value={`${money(report.totals.cash_revenue)} (${report.totals.cash_count})`}
          />
          <Row
            label="Credit"
            value={`${money(report.totals.credit_revenue)} (${report.totals.credit_count})`}
          />
        </View>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f3f0e8', flexGrow: 1 },
  label: { fontSize: 12, color: '#5c675f', marginBottom: 4 },
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
    marginBottom: 16,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b91c1c', marginBottom: 8 },
  card: { backgroundColor: '#fffcf5', borderRadius: 12, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: '#5c675f' },
  value: { fontWeight: '600', color: '#1a211c' },
});
