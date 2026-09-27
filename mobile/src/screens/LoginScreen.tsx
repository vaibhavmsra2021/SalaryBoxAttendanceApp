import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth';
import { colors } from '../theme';
import { Banner, Button, Field } from '../ui';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.wrap}>
          <Text style={styles.kicker}>Workplace</Text>
          <Text style={styles.title}>Attendance</Text>
          <Text style={styles.lead}>
            Admins enroll staff faces. Staff mark attendance with a selfie.
          </Text>
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
            placeholder="admin or employee ID"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Password"
          />
          {error ? <Banner message={error} /> : null}
          <Button label={busy ? 'Signing in...' : 'Sign in'} onPress={submit} disabled={busy} />
          <Text style={styles.hint}>
            Admin: admin / admin123{'\n'}
            Staff: your employee ID / staff123
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  flex: {
    flex: 1,
  },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  kicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 40,
    fontWeight: '700',
  },
  lead: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 8,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
});
