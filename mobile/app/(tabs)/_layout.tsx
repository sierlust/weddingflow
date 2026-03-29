import { Tabs } from 'expo-router';
import { LayoutDashboard, User, Bell } from 'lucide-react-native';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: '#8B6E6E',
      tabBarInactiveTintColor: '#aaa',
      headerStyle: { backgroundColor: '#8B6E6E' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="invitations"
        options={{
          title: 'Uitnodigingen',
          tabBarIcon: ({ color, size }) => <Bell size={size} color={color} strokeWidth={1.75} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profiel',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={1.75} />,
        }}
      />
    </Tabs>
  );
}
