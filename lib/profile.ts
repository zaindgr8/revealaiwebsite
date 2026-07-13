'use client';
import { supabase } from './supabase';

export type Profile = {
  full_name: string;
  avatar_url: string | null;
  // Subscription / billing fields
  trial_ends_at: string | null;
  subscription_status: 'trial' | 'active' | 'expired' | null;
  subscription_minutes_remaining: number | null;
  total_minutes_used: number | null;
  pending_payment_intent_id: string | null;
};

export async function getProfile(userId: string): Promise<Profile> {
  // Try full query with subscription fields
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'full_name, avatar_url, trial_ends_at, subscription_status, subscription_minutes_remaining, total_minutes_used, pending_payment_intent_id'
    )
    .eq('id', userId)
    .single();

  // If subscription columns don't exist yet (DB migration not run), fall back to basic fields
  if (error?.code === '42703') {
    const { data: basic, error: basicErr } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', userId)
      .single();
    if (basicErr) throw basicErr;
    return {
      ...(basic as { full_name: string; avatar_url: string | null }),
      trial_ends_at: null,
      subscription_status: null,
      subscription_minutes_remaining: null,
      total_minutes_used: null,
      pending_payment_intent_id: null,
    };
  }

  if (error) throw error;
  return data as Profile;
}


export async function updateProfileName(userId: string, fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Name cannot be empty');
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  await supabase.auth.updateUser({ data: { full_name: trimmed } });
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!userId || !file) throw new Error('userId and file required');

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const path = `${userId}/avatar.${safeExt}`;

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, {
      contentType: file.type || `image/${safeExt}`,
      upsert: true,
    });
  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) throw new Error('Could not resolve public URL');

  const urlWithCacheBust = `${url}?t=${Date.now()}`;
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: urlWithCacheBust, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (updateErr) throw updateErr;

  return urlWithCacheBust;
}

export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_user');
  if (error) throw error;
}

export async function cancelSubscription(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({
      subscription_status: 'expired',
      subscription_minutes_remaining: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
}

