import type { SupabaseClient } from '@supabase/supabase-js';

/** Sticky notes on a project's board. */
export const NOTE_COLORS = {
 yellow: { fill: '#fff4c2', edge: '#f1dc85', ink: '#4a3b07' },
 green: { fill: '#dff1e4', edge: '#b9dcc3', ink: '#1d4a2c' },
 blue: { fill: '#e1ecfb', edge: '#bcd2f2', ink: '#1d3a63' },
 pink: { fill: '#fbe3ea', edge: '#f1c0cf', ink: '#5e1f33' },
 gray: { fill: '#eef0f1', edge: '#d6dadd', ink: '#2b3338' },
} as const;
export type NoteColor = keyof typeof NOTE_COLORS;
/** `key` is client-only: it keeps a note mounted (and its text focused) when its temporary id becomes the saved one. */
export type BoardNote = { id: string; body: string; color: NoteColor; x: number; y: number; width: number; created_at: string; updated_at: string; key?: string };
/** The board's notes, through the caller's (RLS-scoped) client; an unmigrated database has none. */
export async function loadBoardNotes(client: SupabaseClient, projectId: string): Promise<BoardNote[]> {
 const { data, error } = await client.from('studio_board_notes').select('id,body,color,x,y,width,created_at,updated_at').eq('project_id', projectId).is('deleted_at', null).order('created_at', { ascending: true });
 return error ? [] : (data || []) as BoardNote[];
}
export const isNoteColor = (value: unknown): value is NoteColor => typeof value === 'string' && Object.hasOwn(NOTE_COLORS, value);
