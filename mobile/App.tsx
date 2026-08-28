import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { getSession } from './src/utils/auth';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ChatScreen from './src/screens/ChatScreen';
import { View, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'Dashboard' | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await getSession();
      if (token) {
        setInitialRoute('Dashboard');
      } else {
        setInitialRoute('Login');
      }
    } catch (e) {
      setInitialRoute('Login');
    }
  };

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator 
        initialRouteName={initialRoute}
        screenOptions={{ 
          headerShown: false,
          contentStyle: { backgroundColor: '#ffffff' } 
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
