/**
 * Centralized logger utility for frontend debugging.
 *
 * Usage:
 *   const log = createLogger('Editor', 'CanvasToolbar')
 *   log.info('handleSave', 'saving spread', { spreadId })
 *   log.debug('handleSave', 'skip: element not visible', { elementId })
 *
 * info, debug: active in DEV mode only (tree-shaken in production).
 * warn, error: always active (including production).
 *
 * Convention doc: docs/logging-convention.md
 */

type LogData = Record<string, unknown> | undefined

interface Logger {
  info: (fn: string, message: string, data?: LogData) => void
  debug: (fn: string, message: string, data?: LogData) => void
  warn: (fn: string, message: string, data?: LogData) => void
  error: (fn: string, message: string, data?: LogData) => void
}

// `import.meta.env` is injected by Vite in the browser bundle. This shared logger
// also runs under plain Node (the video-worker imports it via tsx), where
// `import.meta.env` is undefined — reading `.DEV` off it throws. Guard the access so
// the same module is safe in both runtimes (worker → IS_DEV false → info/debug off;
// warn/error stay active). Cast keeps it type-safe where vite/client types are absent.
const IS_DEV = Boolean(
  (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV
)

function formatPrefix(feature: string, module: string, fn: string): string {
  return `[${feature}][${module}][${fn}]`
}

/**
 * Create a scoped logger instance.
 *
 * @param feature  Top-level namespace: 'Editor', 'Auth', 'Store', 'API', 'Util', 'Home'
 * @param module   Component/Hook/Store name: 'CanvasToolbar', 'useAuth', 'BookStore'
 */
export function createLogger(feature: string, module: string): Logger {
  return {
    info(fn, message, data) {
      if (!IS_DEV) return
      const prefix = formatPrefix(feature, module, fn)
      if (data !== undefined) {
        console.info(prefix, message, data)
      } else {
        console.info(prefix, message)
      }
    },

    debug(fn, message, data) {
      if (!IS_DEV) return
      const prefix = formatPrefix(feature, module, fn)
      if (data !== undefined) {
        console.debug(prefix, message, data)
      } else {
        console.debug(prefix, message)
      }
    },

    warn(fn, message, data) {
      const prefix = formatPrefix(feature, module, fn)
      if (data !== undefined) {
        console.warn(prefix, message, data)
      } else {
        console.warn(prefix, message)
      }
    },

    error(fn, message, data) {
      const prefix = formatPrefix(feature, module, fn)
      if (data !== undefined) {
        console.error(prefix, message, data)
      } else {
        console.error(prefix, message)
      }
    },
  }
}
