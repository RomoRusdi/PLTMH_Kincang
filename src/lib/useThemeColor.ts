import { useMemo } from 'react'
import { useTheme } from './theme'

/**
 * Atribut SVG (fill/stroke) tidak selalu menerjemahkan var() CSS, sehingga
 * warna tema dibaca sebagai nilai konkret dan dihitung ulang saat tema berganti.
 */
export function useThemeColor(token: string) {
  const { theme } = useTheme()
  return useMemo(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    return value ? `hsl(${value})` : '#3b82f6'
    // theme sengaja menjadi dependensi: nilai token berubah ketika kelas .dark berganti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, theme])
}
