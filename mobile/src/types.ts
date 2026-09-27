export type Staff = {
  id: string;
  name: string;
  employee_id: string;
  created_at: string;
  enrolled: boolean;
  enrollment_image_url: string | null;
};

export type AttendanceRecord = {
  id: string;
  staff_id: string;
  marked_at: string;
  latitude: number;
  longitude: number;
  similarity: number;
  selfie_url: string | null;
};

export type Session = {
  token: string;
  role: 'admin' | 'staff';
  staff: Staff | null;
};

export type AdminStackParamList = {
  StaffList: undefined;
  AddStaff: undefined;
  StaffProfile: { staffId: string };
  Enroll: { staffId: string; name: string };
};

export type StaffStackParamList = {
  StaffHome: undefined;
  MarkAttendance: undefined;
};
