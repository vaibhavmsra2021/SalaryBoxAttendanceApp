import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { enrollFace } from '../api';
import { useAuth } from '../auth';
import type { AdminStackParamList } from '../types';
import { CaptureScreen } from './CaptureScreen';

type Props = NativeStackScreenProps<AdminStackParamList, 'Enroll'>;

export function EnrollScreen({ navigation, route }: Props) {
  const { session } = useAuth();
  const { staffId, name } = route.params;

  return (
    <CaptureScreen
      hint={`Photograph ${name}. Keep one face in the frame, looking at the camera.`}
      submitLabel="Save face"
      onSubmit={async (photoUri) => {
        if (!session) return;
        await enrollFace(session.token, staffId, photoUri);
        navigation.goBack();
      }}
    />
  );
}
