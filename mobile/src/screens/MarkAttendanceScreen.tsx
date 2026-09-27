import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { markAttendance } from '../api';
import { useAuth } from '../auth';
import type { StaffStackParamList } from '../types';
import { CaptureScreen } from './CaptureScreen';

type Props = NativeStackScreenProps<StaffStackParamList, 'MarkAttendance'>;

export function MarkAttendanceScreen({ navigation }: Props) {
  const { session } = useAuth();
  const staffId = session?.staff?.id;

  return (
    <CaptureScreen
      hint="Take a selfie. Attendance is saved only when this face matches the enrolled face."
      submitLabel="Submit attendance"
      needsLocation
      onSubmit={async (photoUri, location) => {
        if (!session || !staffId || !location) return;
        await markAttendance(session.token, staffId, photoUri, location.latitude, location.longitude);
        navigation.goBack();
      }}
    />
  );
}
