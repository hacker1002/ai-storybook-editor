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

const IS_DEV = import.meta.env.DEV

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
