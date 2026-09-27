import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getStaff, listAttendance } from '../api';
import { useAuth } from '../auth';
import { colors } from '../theme';
import type { AdminStackParamList, AttendanceRecord, Staff } from '../types';
import { Banner, Button } from '../ui';

type Props = NativeStackScreenProps<AdminStackParamList, 'StaffProfile'>;

export function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatPlace(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function AttendanceList({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <Text style={styles.empty}>No attendance yet.</Text>;
  }
  return (
    <View style={styles.history}>
      {records.map((record) => (
        <View key={record.id} style={styles.card}>
          {record.selfie_url ? (
            <Image source={{ uri: record.selfie_url }} style={styles.thumb} />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={styles.cardText}>
            <Text style={styles.when}>{formatWhen(record.marked_at)}</Text>
            <Text style={styles.place}>{formatPlace(record.latitude, record.longitude)}</Text>
            <Text style={styles.score}>Match score {Number(record.similarity).toFixed(3)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function StaffProfileScreen({ navigation, route }: Props) {
  const { session } = useAuth();
  const { staffId } = route.params;
  const [person, setPerson] = useState<Staff | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [nextPerson, nextRecords] = await Promise.all([
        getStaff(session.token, staffId),
        listAttendance(session.token, staffId),
      ]);
      setPerson(nextPerson);
      setRecords(nextRecords);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this profile.');
    }
  }, [session, staffId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  useLayoutEffect(() => {
    if (person) navigation.setOptions({ title: person.name });
  }, [navigation, person]);

  if (loading && !person) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {error ? <Banner message={error} /> : null}
      {person ? (
        <>
          <View style={styles.profile}>
            {person.enrollment_image_url ? (
              <Image source={{ uri: person.enrollment_image_url }} style={styles.portrait} />
            ) : (
              <View style={styles.portraitEmpty}>
                <Text style={styles.portraitText}>No photo</Text>
              </View>
            )}
            <Text style={styles.name}>{person.name}</Text>
            <Text style={styles.id}>Employee ID {person.employee_id}</Text>
            <Text style={styles.status}>
              {person.enrolled ? 'Face enrolled' : 'Face not enrolled'}
            </Text>
          </View>
          <Button
            label={person.enrolled ? 'Replace enrolled face' : 'Enroll face'}
            onPress={() => navigation.navigate('Enroll', { staffId: person.id, name: person.name })}
          />
          <Text style={styles.heading}>Attendance</Text>
          <AttendanceList records={records} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { padding: 20, gap: 16 },
  profile: { alignItems: 'center', gap: 6, marginBottom: 8 },
  portrait: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.line },
  portraitEmpty: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitText: { color: colors.muted, fontSize: 13 },
  name: { color: colors.ink, fontSize: 24, fontWeight: '700', marginTop: 8 },
  id: { color: colors.muted, fontSize: 15 },
  status: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 8 },
  empty: { color: colors.muted, fontSize: 15 },
  history: { gap: 10 },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.line },
  cardText: { flex: 1, gap: 4 },
  when: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  place: { color: colors.muted, fontSize: 13 },
  score: { color: colors.muted, fontSize: 13 },
});
