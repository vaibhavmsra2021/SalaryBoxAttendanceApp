import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { listStaff } from '../api';
import { useAuth } from '../auth';
import { colors } from '../theme';
import type { AdminStackParamList, Staff } from '../types';
import { Banner, Button } from '../ui';

type Props = NativeStackScreenProps<AdminStackParamList, 'StaffList'>;

export function StaffListScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setStaff(await listStaff(session.token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load staff.');
    }
  }, [session]);

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
        contentContainerStyle={styles.list}
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
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {error ? <Banner message={error} /> : null}
        {!loading && staff.length === 0 ? (
          <Text style={styles.empty}>No staff yet. Add someone, then enroll their face.</Text>
        ) : null}
        {staff.map((person) => (
          <Pressable
            key={person.id}
            style={styles.row}
            onPress={() => navigation.navigate('StaffProfile', { staffId: person.id })}
          >
            <View style={styles.rowText}>
              <Text style={styles.name}>{person.name}</Text>
              <Text style={styles.id}>{person.employee_id}</Text>
            </View>
            <Text style={[styles.badge, person.enrolled ? styles.badgeOn : styles.badgeOff]}>
              {person.enrolled ? 'Enrolled' : 'No face'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Add staff" onPress={() => navigation.navigate('AddStaff')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 20, gap: 12 },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  row: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: { flex: 1, gap: 4 },
  name: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  id: { color: colors.muted, fontSize: 14 },
  badge: { fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  badgeOn: { color: colors.accent },
  badgeOff: { color: colors.muted },
  footer: { padding: 20 },
  signOut: { color: colors.accent, fontSize: 16, fontWeight: '600' },
});
