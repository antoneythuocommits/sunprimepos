import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatQuantityDisplay, type SalesReport } from '@sunprime/shared';
import { api, money } from '../../src/lib/api';
import { useProgress } from '../../src/components/ProgressDialog';

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function displayDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function shiftDate(value: string, days: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export default function ReportsScreen() {
  const { withProgress } = useProgress();
  const today = localDateString();
  const [from, setFrom] = useState(() => shiftDate(today, -6));
  const [to, setTo] = useState(today);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fromRef = useRef(from);
  const toRef = useRef(to);
  fromRef.current = from;
  toRef.current = to;

  function onPick(event: DateTimePickerEvent, date?: Date) {
    const which = picker;
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'dismissed' || !date || !which) return;
    const next = localDateString(date);
    if (which === 'from') setFrom(next);
    else setTo(next);
  }

  async function run() {
    setError(null);
    try {
      await withProgress(
        (async () => {
          const r = await api<SalesReport>(
            `/reports/sales?from=${fromRef.current}&to=${toRef.current}&group=range`,
          );
          setReport(r);
          // #region agent log
          fetch('http://127.0.0.1:7689/ingest/4773018b-d033-46d7-8403-a56ad49fb9ca',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf4697'},body:JSON.stringify({sessionId:'bf4697',runId:'pre-fix',hypothesisId:'C',location:'reports.tsx:run',message:'mobile report response',data:{from:fromRef.current,to:toRef.current,saleCount:r.totals?.sale_count??null,productsType:r.products==null?'missing':Array.isArray(r.products)?'array':typeof r.products,productsLength:Array.isArray(r.products)?r.products.length:null,salesLength:Array.isArray(r.sales)?r.sales.length:null},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        })(),
        'Loading report…',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  useFocusEffect(
    useCallback(() => {
      void run();
    }, [withProgress]),
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>From</Text>
      <Pressable style={styles.input} onPress={() => setPicker('from')}>
        <Text style={styles.dateText}>{displayDate(from)}</Text>
      </Pressable>
      <Text style={styles.label}>To</Text>
      <Pressable style={styles.input} onPress={() => setPicker('to')}>
        <Text style={styles.dateText}>{displayDate(to)}</Text>
      </Pressable>
      {picker && (
        <DateTimePicker
          value={parseLocalDate(picker === 'from' ? from : to)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPick}
        />
      )}
      {Platform.OS === 'ios' && picker && (
        <Pressable style={styles.btn} onPress={() => setPicker(null)}>
          <Text style={styles.btnText}>Done</Text>
        </Pressable>
      )}
      <Pressable style={styles.btn} onPress={run}>
        <Text style={styles.btnText}>Run report</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {report && (
        <>
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
          <Text style={styles.section}>Products sold</Text>
          {(report.products ?? []).length === 0 && <Text style={styles.muted}>No products sold in this period.</Text>}
          {(report.products ?? []).map((p) => (
            <View key={p.product_name} style={styles.card}>
              <Text style={styles.name}>{p.product_name}</Text>
              {p.missing_buying_price && <Text style={styles.warn}>No buying price</Text>}
              <Text style={styles.muted}>
                Qty {formatQuantityDisplay(p.quantity)} · {money(p.revenue)}
              </Text>
              <Text style={styles.value}>Profit {money(p.profit)}</Text>
            </View>
          ))}
          <Text style={styles.section}>Sales</Text>
          {(report.sales ?? []).length === 0 && <Text style={styles.muted}>No sales in this period.</Text>}
          {(report.sales ?? []).map((sale) => (
            <View key={sale.id} style={styles.card}>
              <Text style={styles.name}>
                {sale.receipt_number} · {sale.sale_type}
              </Text>
              <Text style={styles.muted}>
                {new Date(sale.created_at).toLocaleString()} · {money(sale.total_amount)} · profit{' '}
                {money(sale.profit)}
              </Text>
              {sale.items.map((item, index) => (
                <Text key={`${sale.id}-${index}`} style={styles.muted}>
                  {item.product_name} × {formatQuantityDisplay(item.quantity)} · {money(item.line_total)} ·
                  profit {money(item.profit)}
                  {item.missing_buying_price ? ' · no buying price' : ''}
                </Text>
              ))}
            </View>
          ))}
        </>
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
  dateText: { color: '#1a211c', fontSize: 16 },
  btn: {
    backgroundColor: '#2f5540',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b91c1c', marginBottom: 8 },
  section: { marginTop: 8, fontSize: 16, fontWeight: '700', color: '#1e3a2b' },
  name: { fontWeight: '600', color: '#1a211c' },
  warn: { color: '#c47a1a', fontWeight: '600' },
  card: { backgroundColor: '#fffcf5', borderRadius: 12, padding: 16, gap: 6, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: '#5c675f' },
  value: { fontWeight: '600', color: '#1a211c' },
});
