export interface BookCover {
  thumbnail_url?: string
  normal_url?: string
}

export interface Story {
  id: string
  title: string
  description?: string
  cover?: BookCover
  createdAt: Date
  updatedAt: Date
  ownerId: string
}
