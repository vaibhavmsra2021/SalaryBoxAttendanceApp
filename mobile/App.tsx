import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth';
import { AddStaffScreen } from './src/screens/AddStaffScreen';
import { EnrollScreen } from './src/screens/EnrollScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MarkAttendanceScreen } from './src/screens/MarkAttendanceScreen';
import { StaffHomeScreen } from './src/screens/StaffHomeScreen';
import { StaffListScreen } from './src/screens/StaffListScreen';
import { StaffProfileScreen } from './src/screens/StaffProfileScreen';
import { colors } from './src/theme';
import type { AdminStackParamList, StaffStackParamList } from './src/types';

const AdminStack = createNativeStackNavigator<AdminStackParamList>();
const StaffStack = createNativeStackNavigator<StaffStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.paper },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '600' as const },
  contentStyle: { backgroundColor: colors.paper },
};

function Root() {
  const { session, ready } = useAuth();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <NavigationContainer>
      {session.role === 'admin' ? (
        <AdminStack.Navigator screenOptions={screenOptions}>
          <AdminStack.Screen name="StaffList" component={StaffListScreen} options={{ title: 'Staff' }} />
          <AdminStack.Screen name="AddStaff" component={AddStaffScreen} options={{ title: 'Add staff' }} />
          <AdminStack.Screen name="StaffProfile" component={StaffProfileScreen} options={{ title: 'Profile' }} />
          <AdminStack.Screen name="Enroll" component={EnrollScreen} options={{ title: 'Enroll face' }} />
        </AdminStack.Navigator>
      ) : (
        <StaffStack.Navigator screenOptions={screenOptions}>
          <StaffStack.Screen name="StaffHome" component={StaffHomeScreen} options={{ title: 'Attendance' }} />
          <StaffStack.Screen
            name="MarkAttendance"
            component={MarkAttendanceScreen}
            options={{ title: 'Mark attendance' }}
          />
        </StaffStack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
});
