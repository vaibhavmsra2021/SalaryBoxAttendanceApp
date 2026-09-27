import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getStaff, listAttendance } from '../api';
import { useAuth } from '../auth';
import { colors } from '../theme';
import type { AttendanceRecord, Staff, StaffStackParamList } from '../types';
import { Banner, Button } from '../ui';
import { AttendanceList } from './StaffProfileScreen';

type Props = NativeStackScreenProps<StaffStackParamList, 'StaffHome'>;

export function StaffHomeScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const staffId = session?.staff?.id;
  const [person, setPerson] = useState<Staff | null>(session?.staff ?? null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session || !staffId) return;
    try {
      const [nextPerson, nextRecords] = await Promise.all([
        getStaff(session.token, staffId),
        listAttendance(session.token, staffId),
      ]);
      setPerson(nextPerson);
      setRecords(nextRecords);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load attendance.');
    }
  }, [session, staffId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      ),
    });
  }, [navigation, signOut]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Text style={styles.hello}>{person?.name ?? 'Staff'}</Text>
        <Text style={styles.id}>Employee ID {person?.employee_id}</Text>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {error ? <Banner message={error} /> : null}
        {person && !person.enrolled ? (
          <Banner message="Ask an admin to enroll your face before you mark attendance." />
        ) : null}
        <Text style={styles.heading}>Your attendance</Text>
        <AttendanceList records={records} />
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label="Mark attendance"
          disabled={!person?.enrolled}
          onPress={() => navigation.navigate('MarkAttendance')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { padding: 20, gap: 12 },
  hello: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  id: { color: colors.muted, fontSize: 15, marginBottom: 8 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 8 },
  footer: { padding: 20 },
  signOut: { color: colors.accent, fontSize: 16, fontWeight: '600' },
});
