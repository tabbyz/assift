'use client'

import { useRouter, useSelectedLayoutSegment } from 'next/navigation'
import { Stepper, StepperStep } from '@mantine/core'

const STEPS = [
  { segment: 'intro', label: 'はじめに' },
  { segment: 'pattern', label: '勤務パターン' },
  { segment: 'staff', label: 'スタッフ' },
  { segment: 'complete', label: '完了' },
] as const

/** チュートリアルの進行表示（v1 の tutorial/_steps）。「完了」以外はクリックで移動できる */
export function TutorialSteps({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const segment = useSelectedLayoutSegment()
  const active = Math.max(
    STEPS.findIndex((step) => step.segment === segment),
    0
  )

  return (
    <Stepper
      active={active}
      onStepClick={(index) => router.push(`/tenants/${tenantId}/tutorial/${STEPS[index].segment}`)}
      size="sm"
      iconSize={32}
    >
      {STEPS.map((step, index) => (
        <StepperStep
          key={step.segment}
          label={step.label}
          // 完了ステップは条件を満たさないと開けないのでクリックさせない
          allowStepClick={index < STEPS.length - 1}
          allowStepSelect={index < STEPS.length - 1}
        />
      ))}
    </Stepper>
  )
}
