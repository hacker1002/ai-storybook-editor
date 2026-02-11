import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StoryCard } from '../components/story-card'
import type { Story } from '@/types/story'

const mockStories: Story[] = [
  {
    id: '1',
    title: 'Thỏ và Rùa',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    userId: '1',
  },
  {
    id: '2',
    title: 'Cô bé quàng khăn đỏ',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    userId: '1',
  },
  {
    id: '3',
    title: 'Ba chú heo con',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    userId: '1',
  },
  {
    id: '4',
    title: 'Chú mèo đi hia',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    userId: '1',
  },
  {
    id: '5',
    title: 'Công chúa ngủ trong rừng',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    userId: '1',
  },
  {
    id: '6',
    title: 'Bạch Tuyết',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    userId: '1',
  },
]

export function HomePage() {
  const [storyIdea, setStoryIdea] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!storyIdea.trim()) return
    // TODO: Handle story creation
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {mockStories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="yours" className="mt-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {mockStories.slice(0, 3).map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
