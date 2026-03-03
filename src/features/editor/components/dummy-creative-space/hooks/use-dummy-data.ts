// Re-export store selectors for DummyCreativeSpace feature
export {
  useDummies,
  useDummyIds,
  useDummyById,
  useDocs,
} from '@/stores/snapshot-store';

/**
 * Hook to get current language
 * TODO: Replace with actual store/context when implemented
 */
export function useCurrentLanguage(): string {
  return 'en_US';
}
