import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Shadows } from './src/utils/theme';
import DashboardScreen from './src/screens/DashboardScreen';
import MapScreen from './src/screens/MapScreen';
import IntakeScreen from './src/screens/IntakeScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ReportScreen from './src/screens/ReportScreen';

const Tab = createBottomTabNavigator();

function CenterTabButton({ children, onPress }) {
  return (
    <TouchableOpacity style={styles.centerBtn} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.centerBtnInner}>
        {children}
      </View>
    </TouchableOpacity>
  );
}

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
            if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'Map') iconName = focused ? 'map' : 'map-outline';
            else if (route.name === 'Intake') iconName = 'add';
            else if (route.name === 'Alerts') iconName = focused ? 'warning' : 'warning-outline';
            else if (route.name === 'Reports') iconName = focused ? 'document-text' : 'document-text-outline';

            if (route.name === 'Intake') {
              return <Ionicons name="add" size={28} color="#fff" />;
            }
            return <Ionicons name={iconName} size={22} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home" component={DashboardScreen} />
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen
          name="Intake"
          component={IntakeScreen}
          options={{
            tabBarLabel: () => null,
            tabBarButton: (props) => <CenterTabButton {...props} />,
          }}
        />
        <Tab.Screen name="Alerts" component={AlertsScreen} />
        <Tab.Screen name="Reports" component={ReportScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centerBtn: {
    top: -18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.lg,
  },
});
