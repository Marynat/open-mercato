"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { PROJECT_COLOR_MAP } from '@open-mercato/core/modules/staff/lib/timesheetUtils'

const COLOR_KEYS = ['green', 'blue', 'purple', 'red', 'orange', 'yellow', 'pink', 'teal', 'indigo', 'cyan', 'emerald', 'slate'] as const

type Props = {
  value: string | null
  onChange: (color: string | null) => void
  disabled?: boolean
}

export function ColorPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_KEYS.map((key) => {
        const hex = PROJECT_COLOR_MAP[key]
        const isSelected = value === key
        return (
          <Button
            key={key}
            type="button"
            variant="ghost"
            disabled={disabled}
            title={key.charAt(0).toUpperCase() + key.slice(1)}
            onClick={() => onChange(isSelected ? null : key)}
            className={`h-7 w-7 rounded-full p-0 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected ? 'ring-2 ring-offset-2 ring-foreground/60' : ''
            }`}
            style={{ backgroundColor: hex }}
            aria-pressed={isSelected}
            aria-label={key}
          />
        )
      })}
    </div>
  )
}
