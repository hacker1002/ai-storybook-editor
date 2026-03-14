// Re-export store selectors for DummyCreativeSpace feature
export {
  useDummies,
  useDummyIds,
  useDummyById,
  useDocs,
} from '@/stores/snapshot-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useDummyData');

/**
 * Hook to get current language
 * TODO: Replace with actual store/context when implemented
 */
export function useCurrentLanguage(): string {
  log.debug('useCurrentLanguage', 'returning default language');
  return 'en_US';
}
