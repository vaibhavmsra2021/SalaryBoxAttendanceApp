import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import type { AttendanceRecord, Session, Staff } from './types';

export function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (Platform.OS === 'web') return 'http://127.0.0.1:8000';

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return 'http://10.0.2.2:8000';
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function detailMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('detail' in payload)) {
    return 'Request failed.';
  }
  const detail = (payload as { detail: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const message = (detail as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Request failed.';
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    json?: unknown;
    form?: FormData | (() => FormData);
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const base = apiBaseUrl();
  const remote = base.startsWith('https://');
  const attempts = remote ? 8 : 3;
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let body: BodyInit | undefined;
    if (options.form) {
      body = typeof options.form === 'function' ? options.form() : options.form;
    } else if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }
    try {
      response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body,
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        const delay = remote ? 2000 * (attempt + 1) : 400 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  if (!response) {
    const reason = lastError instanceof Error ? lastError.message : 'Network request failed';
    const hint = remote
      ? 'If the server has been idle, the first request can take up to a minute while it wakes.'
      : 'Keep the phone on the same Wi-Fi as this computer.';
    throw new ApiError(`Cannot reach the server at ${base} (${reason}). ${hint}`, 0, null);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && options.token) onUnauthorized?.();
    throw new ApiError(detailMessage(payload), response.status, payload);
  }
  return payload as T;
}

function photoForm(photoUri: string, fields?: Record<string, string>) {
  const form = new FormData();
  form.append('image', new File(photoUri));
  if (fields) {
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
  }
  return form;
}

export function login(username: string, password: string) {
  return request<Session>('/login', { method: 'POST', json: { username, password } });
}

export function listStaff(token: string) {
  return request<Staff[]>('/staff', { token });
}

export function addStaff(token: string, name: string, employeeId: string) {
  return request<Staff>('/staff', {
    method: 'POST',
    token,
    json: { name, employee_id: employeeId },
  });
}

export function getStaff(token: string, staffId: string) {
  return request<Staff>(`/staff/${staffId}`, { token });
}

export function listAttendance(token: string, staffId: string) {
  return request<AttendanceRecord[]>(`/staff/${staffId}/attendance`, { token });
}

export function enrollFace(token: string, staffId: string, photoUri: string) {
  return request<Staff>(`/staff/${staffId}/enroll`, {
    method: 'POST',
    token,
    form: () => photoForm(photoUri),
  });
}

export function markAttendance(
  token: string,
  staffId: string,
  photoUri: string,
  latitude: number,
  longitude: number,
) {
  return request<{ matched: boolean; similarity: number; attendance: AttendanceRecord }>(
    `/staff/${staffId}/attendance`,
    {
      method: 'POST',
      token,
      form: () =>
        photoForm(photoUri, {
          latitude: String(latitude),
          longitude: String(longitude),
        }),
    },
  );
}
