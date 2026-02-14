import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from './src/utils/theme';
import DashboardScreen from './src/screens/DashboardScreen';
import IntakeScreen from './src/screens/IntakeScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ReportScreen from './src/screens/ReportScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        dark: false,
        colors: {
          ...DefaultTheme.colors,
          primary: Colors.accent.primary,
          background: Colors.bg.primary,
          card: Colors.bg.primary,
          text: Colors.text.primary,
          border: Colors.border,
          notification: Colors.severity.emergency,
        },
      }}
    >
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.bg.primary,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            height: 84,
            paddingBottom: 26,
            paddingTop: 8,
          },
          tabBarActiveTintColor: Colors.accent.primaryDark,
          tabBarInactiveTintColor: Colors.text.tertiary,
          tabBarLabelStyle: {
            fontSize: Typography.size.xs,
            fontWeight: Typography.weight.medium,
          },
          tabBarIcon: ({ focused, color }) => {
            let iconName;
            if (route.name === 'Dashboard') iconName = focused ? 'pulse' : 'pulse-outline';
            else if (route.name === 'Intake') iconName = focused ? 'add-circle' : 'add-circle-outline';
            else if (route.name === 'Alerts') iconName = focused ? 'warning' : 'warning-outline';
            else if (route.name === 'Reports') iconName = focused ? 'document-text' : 'document-text-outline';
            return <Ionicons name={iconName} size={22} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Intake" component={IntakeScreen} />
        <Tab.Screen name="Alerts" component={AlertsScreen} />
        <Tab.Screen name="Reports" component={ReportScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
