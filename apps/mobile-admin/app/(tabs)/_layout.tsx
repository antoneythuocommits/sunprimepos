import { Tabs, usePathname, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { getSupabase } from '../../src/lib/supabase';
import { useProgress } from '../../src/components/ProgressDialog';

const tabs = [
  { name: 'reports', title: 'Reports' },
  { name: 'credit', title: 'Credit' },
  { name: 'inventory', title: 'Inventory' },
  { name: 'valuation', title: 'Valuation' },
] as const;

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { withProgress, beginNavigation } = useProgress();

  async function logout() {
    await withProgress(getSupabase().auth.signOut(), 'Signing out…');
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
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.title }}
          listeners={{
            tabPress: () => {
              if (pathname?.includes(tab.name)) return;
              beginNavigation(`Opening ${tab.title.toLowerCase()}…`);
            },
          }}
        />
      ))}
    </Tabs>
  );
}
