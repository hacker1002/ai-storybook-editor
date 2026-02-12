import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { Story } from '@/types/story'

interface StoryCardProps {
  story: Story
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

export function StoryCard({ story }: StoryCardProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate(`/editor/${story.id}`)
  }

  const coverUrl = story.cover?.thumbnail_url ?? story.cover?.normal_url

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
      onClick={handleClick}
    >
      <div className="aspect-[4/3] bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={story.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            <span className="text-lg">📖 {story.title}</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-medium text-foreground line-clamp-1">{story.title}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatRelativeTime(story.updatedAt)}</span>
        </div>
      </div>
    </Card>
  )
}
