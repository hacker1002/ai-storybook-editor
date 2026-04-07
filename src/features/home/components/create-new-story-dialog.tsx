import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/apis/supabase'
import { useBookStore } from '@/stores/book-store'
import {
  DIMENSION_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
} from '@/constants/book-enums'
import { SUPPORTED_LANGUAGES } from '@/constants/config-constants'
import { createLogger } from '@/utils/logger'

const log = createLogger('Home', 'CreateNewStoryDialog')

interface LookupOption {
  id: string
  name: string
}

interface CreateNewStoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateNewStoryDialog({ open, onOpenChange }: CreateNewStoryDialogProps) {
  const navigate = useNavigate()
  const createBook = useBookStore((s) => s.createBook)

  const [title, setTitle] = useState('')
  const [formatId, setFormatId] = useState<string>('')
  const [dimension, setDimension] = useState<string>('')
  const [targetAudience, setTargetAudience] = useState<string>('')
  const [artstyleId, setArtstyleId] = useState<string>('')
  const [originalLanguage, setOriginalLanguage] = useState<string>('en_US')

  const [formats, setFormats] = useState<LookupOption[]>([])
  const [artStyles, setArtStyles] = useState<LookupOption[]>([])
  const [isLoadingLookups, setIsLoadingLookups] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLookups = useCallback(async () => {
    setIsLoadingLookups(true)
    const [formatsRes, artStylesRes] = await Promise.all([
      supabase.from('formats').select('id, name').order('name'),
      supabase.from('art_styles').select('id, name').order('name'),
    ])

    if (formatsRes.error) {
      log.error('fetchLookups', 'formats failed', { error: formatsRes.error })
    } else {
      setFormats(formatsRes.data ?? [])
    }

    if (artStylesRes.error) {
      log.error('fetchLookups', 'art_styles failed', { error: artStylesRes.error })
    } else {
      setArtStyles(artStylesRes.data ?? [])
    }

    log.debug('fetchLookups', 'done', { formats: formatsRes.data?.length ?? 0, artStyles: artStylesRes.data?.length ?? 0 })
    setIsLoadingLookups(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on dialog open
  useEffect(() => {
    if (open) fetchLookups()
  }, [open, fetchLookups])

  const isValid = title.trim() && formatId && dimension && targetAudience && artstyleId && originalLanguage

  const handleSubmit = async () => {
    if (!isValid) return

    setIsSubmitting(true)
    setError(null)
    log.info('handleSubmit', 'creating story', { title })

    const book = await createBook({
      title: title.trim(),
      format_id: formatId,
      dimension: Number(dimension),
      target_audience: Number(targetAudience),
      artstyle_id: artstyleId,
      original_language: originalLanguage,
    })

    if (book) {
      log.info('handleSubmit', 'created, navigating', { bookId: book.id })
      onOpenChange(false)
      navigate(`/editor/${book.id}`)
    } else {
      setError('Không thể tạo truyện. Vui lòng thử lại.')
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (isSubmitting) return
    if (!newOpen) {
      setTitle('')
      setFormatId('')
      setDimension('')
      setTargetAudience('')
      setArtstyleId('')
      setOriginalLanguage('en_US')
      setError(null)
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Story</DialogTitle>
          <DialogDescription>
            Set up the basic settings for your new story.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="story-title">Story Title</Label>
            <Input
              id="story-title"
              placeholder="Enter your story title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Format</Label>
            <Select
              value={formatId}
              onValueChange={setFormatId}
              disabled={isSubmitting || isLoadingLookups}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingLookups ? 'Loading...' : 'Select format'} />
              </SelectTrigger>
              <SelectContent>
                {formats.map((fmt) => (
                  <SelectItem key={fmt.id} value={fmt.id}>
                    {fmt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Dimension</Label>
            <Select value={dimension} onValueChange={setDimension} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue placeholder="Select dimension" />
              </SelectTrigger>
              <SelectContent>
                {DIMENSION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Target Audience</Label>
            <Select value={targetAudience} onValueChange={setTargetAudience} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue placeholder="Select target audience" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_AUDIENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Art Style</Label>
            <Select
              value={artstyleId}
              onValueChange={setArtstyleId}
              disabled={isSubmitting || isLoadingLookups}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingLookups ? 'Loading...' : 'Select art style'} />
              </SelectTrigger>
              <SelectContent>
                {artStyles.map((style) => (
                  <SelectItem key={style.id} value={style.id}>
                    {style.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Original Language</Label>
            <Select value={originalLanguage} onValueChange={setOriginalLanguage} disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Story
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
