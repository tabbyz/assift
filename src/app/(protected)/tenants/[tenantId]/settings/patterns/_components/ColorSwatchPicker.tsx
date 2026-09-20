'use client'

import { CheckIcon, ColorSwatch, Group, Input } from '@mantine/core'
import { PATTERN_COLORS } from '@/lib/patterns/colors'
import styles from './ColorSwatchPicker.module.css'

type Props = {
  value: string
  onChange: (hex: string) => void
}

/** v1 の color-picker（Material 20 色）。選択中はチェックを重ねる */
export function ColorSwatchPicker({ value, onChange }: Props) {
  return (
    <Input.Wrapper label="カラー">
      <Group gap={6} mt={4}>
        {PATTERN_COLORS.map((color) => (
          <ColorSwatch
            key={color.hex}
            className={styles.swatch}
            component="button"
            type="button"
            color={color.hex}
            onClick={() => onChange(color.hex)}
            aria-label={color.name}
            aria-pressed={value === color.hex}
            title={color.name}
            withShadow
            style={{ color: '#fff', cursor: 'pointer' }}
          >
            {value === color.hex && <CheckIcon size={12} color={contrastCheckColor(color.hex)} />}
          </ColorSwatch>
        ))}
      </Group>
    </Input.Wrapper>
  )
}

/** 白などの明るい色の上では白いチェックが見えないので、輝度で色を変える */
function contrastCheckColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}
