import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StoryCard } from '../components/story-card'
import { fetchBooks, fetchUserBooks } from '@/api'
import { useAuthStore } from '@/stores/auth-store'
import type { Story } from '@/types/story'

export function HomePage() {
  const [storyIdea, setStoryIdea] = useState('')
  const [recentStories, setRecentStories] = useState<Story[]>([])
  const [userStories, setUserStories] = useState<Story[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()

  useEffect(() => {
    async function loadBooks() {
      setIsLoading(true)
      setError(null)
      try {
        const recent = await fetchBooks(12)
        setRecentStories(recent)

        if (user?.id) {
          const owned = await fetchUserBooks(user.id, 12)
          setUserStories(owned)
        }
      } catch (err) {
        console.error('[HomePage] Failed to load books:', err)
        setError('Failed to load books')
      } finally {
        setIsLoading(false)
      }
    }

    loadBooks()
  }, [user?.id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!storyIdea.trim()) return
    console.log('Creating story:', storyIdea)
    setStoryIdea('')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Card className="p-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            What story would you like to create today?
          </h2>
          <p className="mt-2 text-muted-foreground">
            Describe your story idea and let AI help you bring it to life
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="relative">
            <input
              type="text"
              value={storyIdea}
              onChange={(e) => setStoryIdea(e.target.value)}
              placeholder="E.g., A magical adventure about a brave little rabbit..."
              className="h-12 w-full rounded-full border border-input bg-background px-5 pr-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full"
              disabled={!storyIdea.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Card>

      <div>
        <Tabs defaultValue="recent">
          <div className="flex items-center justify-between">
            <TabsList className="bg-transparent p-0">
              <TabsTrigger
                value="recent"
                className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Recent Stories
              </TabsTrigger>
              <TabsTrigger
                value="yours"
                className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Your Stories
              </TabsTrigger>
            </TabsList>
            <Button variant="link" className="text-primary">
              View all
            </Button>
          </div>

          <TabsContent value="recent" className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="py-12 text-center text-muted-foreground">{error}</div>
            ) : recentStories.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No stories yet. Create your first story above!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {recentStories.map((story) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="yours" className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !user ? (
              <div className="py-12 text-center text-muted-foreground">
                Sign in to see your stories
              </div>
            ) : userStories.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                You haven't created any stories yet
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {userStories.map((story) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="border-t pt-6">
        <p className="mb-3 text-sm text-muted-foreground">Demo Pages</p>
        <Link to="/demo/canvas-spread-view">
          <Button variant="outline" size="sm">
            Canvas Spread View
          </Button>
        </Link>
      </div>
    </div>
  )
}
