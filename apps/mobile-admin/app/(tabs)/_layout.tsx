import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { getSupabase } from '../../src/lib/supabase';

export default function TabsLayout() {
  const router = useRouter();

  async function logout() {
    await getSupabase().auth.signOut();
    router.replace('/login');
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#fffcf5' },
        headerTitleStyle: { color: '#1e3a2b' },
        tabBarActiveTintColor: '#2f5540',
        headerRight: () => (
          <Pressable onPress={logout} style={{ marginRight: 12 }}>
            <Text style={{ color: '#2f5540' }}>Logout</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="credit" options={{ title: 'Credit' }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Tabs.Screen name="valuation" options={{ title: 'Valuation' }} />
    </Tabs>
  );
}
