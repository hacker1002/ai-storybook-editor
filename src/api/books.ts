import { supabase } from '@/lib/supabase'
import type { Story, BookCover } from '@/types/story'

interface BookRow {
  id: string
  title: string
  description: string | null
  cover: BookCover | null
  owner_id: string
  created_at: string
  updated_at: string
}

function mapBookToStory(book: BookRow): Story {
  return {
    id: book.id,
    title: book.title,
    description: book.description ?? undefined,
    cover: book.cover ?? undefined,
    ownerId: book.owner_id,
    createdAt: new Date(book.created_at),
    updatedAt: new Date(book.updated_at),
  }
}

export async function fetchBooks(limit = 20): Promise<Story[]> {
  const { data, error } = await supabase
    .from('books')
    .select('id, title, description, cover, owner_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchBooks] Error:', error.message)
    throw error
  }

  return (data ?? []).map(mapBookToStory)
}

export async function fetchUserBooks(userId: string, limit = 20): Promise<Story[]> {
  const { data, error } = await supabase
    .from('books')
    .select('id, title, description, cover, owner_id, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchUserBooks] Error:', error.message)
    throw error
  }

  return (data ?? []).map(mapBookToStory)
}
