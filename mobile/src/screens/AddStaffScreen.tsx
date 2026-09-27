import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { addStaff } from '../api';
import { useAuth } from '../auth';
import type { AdminStackParamList } from '../types';
import { Banner, Button, Field } from '../ui';

type Props = NativeStackScreenProps<AdminStackParamList, 'AddStaff'>;

export function AddStaffScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!session) return;
    setError(null);
    setBusy(true);
    try {
      const created = await addStaff(session.token, name.trim(), employeeId.trim());
      navigation.replace('StaffProfile', { staffId: created.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add staff.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.wrap}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" />
        <Field
          label="Employee ID"
          value={employeeId}
          onChangeText={setEmployeeId}
          autoCapitalize="characters"
          placeholder="E100"
        />
        {error ? <Banner message={error} /> : null}
        <Button
          label={busy ? 'Saving...' : 'Save staff member'}
          onPress={submit}
          disabled={busy || name.trim().length === 0 || employeeId.trim().length === 0}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { padding: 20, gap: 16 },
});
