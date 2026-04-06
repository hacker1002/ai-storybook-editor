import { useState, useEffect, useCallback } from 'react';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { ShareLink, ShareLinkUpdatePayload } from '../share-link-types';
import { DEFAULT_SHARE_LINK } from '../share-link-types';

const log = createLogger('Editor', 'useShareLinks');

const BCRYPT_SALT_ROUNDS = 10;

interface UseShareLinksReturn {
  shareLinks: ShareLink[];
  isLoading: boolean;
  isSaving: boolean;
  createShareLink: () => Promise<void>;
  updateShareLink: (id: string, changes: ShareLinkUpdatePayload) => Promise<void>;
  deleteShareLink: (id: string) => Promise<void>;
}

export function useShareLinks(bookId: string): UseShareLinksReturn {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchShareLinks = useCallback(async () => {
    log.info('fetchShareLinks', 'fetching share links', { bookId });
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('share_links')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true });

      if (error) {
        log.error('fetchShareLinks', 'fetch failed', { error: error.message, bookId });
        toast.error('Failed to load share links');
        return;
      }

      log.debug('fetchShareLinks', 'fetched', { count: data?.length ?? 0 });
      // Ensure languages array is always valid even if DB returns null
      const links = (data as ShareLink[]) ?? [];
      setShareLinks(links.map((l) => ({ ...l, languages: l.languages ?? [] })));
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  // Fetch on mount and when bookId changes
  useEffect(() => {
    if (!bookId) return;
    fetchShareLinks();
  }, [bookId, fetchShareLinks]);

  const createShareLink = useCallback(async () => {
    if (!bookId) {
      log.warn('createShareLink', 'no bookId, skipping');
      return;
    }
    log.info('createShareLink', 'creating share link', { bookId });
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        log.error('createShareLink', 'no authenticated user');
        toast.error('Not authenticated');
        return;
      }

      const slug = nanoid(8);
      const newLink = {
        user_id: user.id,
        book_id: bookId,
        name: DEFAULT_SHARE_LINK.name,
        url: slug,
        privacy: DEFAULT_SHARE_LINK.privacy,
        passcode: DEFAULT_SHARE_LINK.passcode,
        editions: DEFAULT_SHARE_LINK.editions,
        languages: DEFAULT_SHARE_LINK.languages,
      };

      const { data, error } = await supabase
        .from('share_links')
        .insert(newLink)
        .select()
        .single();

      if (error) {
        log.error('createShareLink', 'insert failed', { error: error.message });
        toast.error('Failed to create share link');
        return;
      }

      log.debug('createShareLink', 'created', { id: data.id });
      setShareLinks((prev) => [...prev, data as ShareLink]);
    } finally {
      setIsSaving(false);
    }
  }, [bookId]);

  const updateShareLink = useCallback(
    async (id: string, changes: ShareLinkUpdatePayload) => {
      log.info('updateShareLink', 'updating share link', { id, fields: Object.keys(changes) });
      setIsSaving(true);
      try {
        // Hash passcode if provided — never store plaintext
        const dbChanges: Record<string, unknown> = { ...changes };
        if (changes.passcode) {
          dbChanges.passcode = await bcrypt.hash(changes.passcode, BCRYPT_SALT_ROUNDS);
          log.debug('updateShareLink', 'passcode hashed');
        }

        const { data, error } = await supabase
          .from('share_links')
          .update(dbChanges)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          log.error('updateShareLink', 'update failed', { error: error.message, id });
          toast.error('Failed to save changes');
          return;
        }

        log.debug('updateShareLink', 'updated', { id });
        setShareLinks((prev) =>
          prev.map((link) => (link.id === id ? (data as ShareLink) : link))
        );
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const deleteShareLink = useCallback(async (id: string) => {
    log.info('deleteShareLink', 'deleting share link', { id });
    setIsSaving(true);
    try {
      const { error } = await supabase.from('share_links').delete().eq('id', id);

      if (error) {
        log.error('deleteShareLink', 'delete failed', { error: error.message, id });
        toast.error('Failed to delete share link');
        return;
      }

      log.debug('deleteShareLink', 'deleted', { id });
      setShareLinks((prev) => prev.filter((link) => link.id !== id));
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    shareLinks,
    isLoading,
    isSaving,
    createShareLink,
    updateShareLink,
    deleteShareLink,
  };
}
