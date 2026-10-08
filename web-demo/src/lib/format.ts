/** Sizes for storage screens: 4.3 GB, 340 MB, 12 KB. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  if (bytes <= 0) return '0 MB'
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
