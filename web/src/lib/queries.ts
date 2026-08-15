/**
 * TanStack Query hooks.
 *
 * `refetchOnWindowFocus` (the library default) keeps the two devices in sync:
 * come back to the tab, see fresh data.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api';
import type { SessionUpdate, TechniqueSort, TechniqueUpdate } from '@/types';

export const keys = {
  sessions: ['sessions'] as const,
  session: (id: number) => ['sessions', id] as const,
  techniques: (params: { search?: string; sort?: TechniqueSort }) =>
    ['techniques', params] as const,
  technique: (id: number) => ['techniques', id] as const,
};

export function useSessions() {
  return useQuery({ queryKey: keys.sessions, queryFn: api.listSessions });
}

export function useSession(id: number) {
  return useQuery({
    queryKey: keys.session(id),
    queryFn: () => api.getSession(id),
    enabled: Number.isFinite(id),
  });
}

export function useTechniques(params: { search?: string; sort?: TechniqueSort }) {
  return useQuery({
    queryKey: keys.techniques(params),
    queryFn: () => api.listTechniques(params),
  });
}

export function useTechnique(id: number) {
  return useQuery({
    queryKey: keys.technique(id),
    queryFn: () => api.getTechnique(id),
    enabled: Number.isFinite(id),
  });
}

/** Invalidate everything a write could have touched. */
function useInvalidateAll() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['sessions'] });
    client.invalidateQueries({ queryKey: ['techniques'] });
  };
}

export function useCreateSession() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (transcript: string) => api.createSession(transcript),
    onSuccess: invalidate,
  });
}

export function useRecordSession() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ audio, filename }: { audio: Blob; filename: string }) =>
      api.recordSession(audio, filename),
    onSuccess: invalidate,
  });
}

export function useUpdateSession(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: SessionUpdate) => api.updateSession(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteSession() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api.deleteSession(id),
    onSuccess: invalidate,
  });
}

export function useUpdateTechnique(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: TechniqueUpdate) => api.updateTechnique(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTechnique() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => api.deleteTechnique(id),
    onSuccess: invalidate,
  });
}
