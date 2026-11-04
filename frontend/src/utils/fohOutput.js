const COLOR_NAMES = {
  white: '#ffffff',
  yellow: '#ffd700',
  gold: '#ffd700',
  cyan: '#00ffff',
  lime: '#00ff00',
  red: '#ff3b30',
  orange: '#ff9500',
  pink: '#ff69b4',
}

export function parseSubtitleColor(value) {
  const color = String(value || '').trim().toLowerCase()
  if (Object.hasOwn(COLOR_NAMES, color)) return COLOR_NAMES[color]
  return /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(color) ? color : '#ffffff'
}

export function buildLanguageOutputUrl(base, outputPath, language, color = 'white', history) {
  const params = new URLSearchParams({ bg: 'transparent', lang: language, size: 'xl', align: 'bottom', color })
  if ([1, 2, 3].includes(Number(history))) params.set('history', String(Number(history)))
  return `${base}${outputPath}?${params.toString()}`
}
