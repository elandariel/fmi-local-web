'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export function useRealtimeTable<T extends { id: string | number }>(
  tableName: string,
  initialData: T[],
  events: ChangeEvent[] = ['*']
) {
  const [data, setData] = useState<T[]>(initialData);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const channel = supabase
      .channel(`realtime:${tableName}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload: RealtimePostgresChangesPayload<T>) => {
          if (!events.includes('*') && !events.includes(payload.eventType as ChangeEvent)) return;

          setData(prev => {
            if (payload.eventType === 'INSERT') {
              return [payload.new as T, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map(row =>
                row.id === (payload.new as T).id ? (payload.new as T) : row
              );
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter(row => row.id !== (payload.old as T).id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName]);

  return data;
}