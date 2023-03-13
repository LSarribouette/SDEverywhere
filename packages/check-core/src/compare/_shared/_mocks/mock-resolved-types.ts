// Copyright (c) 2021-2022 Climate Interactive / New Venture Fund

import type { InputPosition } from '../../../_shared/scenario'
import type { VarId } from '../../../_shared/types'
import type { InputId, InputVar } from '../../../bundle/var-types'

import type {
  CompareResolverError,
  CompareScenario,
  CompareScenarioGroup,
  CompareScenarioInput,
  CompareScenarioInputState,
  CompareScenarioWithAllInputs,
  CompareScenarioWithInputs,
  CompareUnresolvedScenarioRef
} from '../compare-resolved-types'

//
// SCENARIOS
//

export function inputVar(varName: string, inputId?: InputId, maxValue = 100): [VarId, InputVar] {
  const varId = `_${varName.toLowerCase()}`
  const v: InputVar = {
    inputId,
    varId,
    varName,
    defaultValue: 50,
    minValue: 0,
    maxValue
  }
  return [varId, v]
}

export function nameForPos(position: InputPosition): string {
  switch (position) {
    case 'at-default':
      return 'default'
    case 'at-minimum':
      return 'minimum'
    case 'at-maximum':
      return 'maximum'
    default:
      return ''
  }
}

export function valueForPos(inputVar: InputVar, position: InputPosition): number | undefined {
  switch (position) {
    case 'at-default':
      return inputVar.defaultValue
    case 'at-minimum':
      return inputVar.minValue
    case 'at-maximum':
      return inputVar.maxValue
    default:
      return undefined
  }
}

export function allAtPos(
  position: InputPosition,
  opts?: { id?: string; title?: string; subtitle?: string }
): CompareScenarioWithAllInputs {
  // TODO: Generate title/subtitle
  return {
    kind: 'scenario-with-all-inputs',
    id: opts?.id,
    title: opts?.title,
    subtitle: opts?.subtitle,
    position
  }
}

export function scenarioWithInput(
  requestedInputName: string,
  at: InputPosition | number,
  inputVarL: InputVar | CompareResolverError | undefined,
  inputVarR: InputVar | CompareResolverError | undefined,
  opts?: { id?: string; title?: string; subtitle?: string }
): CompareScenarioWithInputs {
  const resolvedInput: CompareScenarioInput = {
    requestedName: requestedInputName,
    stateL: stateForInputVar(inputVarL, at),
    stateR: stateForInputVar(inputVarR, at)
  }
  // TODO: Generate title/subtitle
  return {
    kind: 'scenario-with-inputs',
    id: opts?.id,
    title: opts?.title,
    subtitle: opts?.subtitle,
    resolvedInputs: [resolvedInput]
  }
}

export function stateForInputVar(
  inputVar: InputVar | CompareResolverError | undefined,
  at: InputPosition | number
): CompareScenarioInputState {
  if (inputVar === undefined) {
    return {
      error: {
        kind: 'unknown-input'
      }
    }
  }

  if ('kind' in inputVar) {
    return {
      error: inputVar
    }
  }

  let position: InputPosition
  let value: number
  if (typeof at === 'string') {
    position = at as InputPosition
    value = valueForPos(inputVar, position)
  } else {
    value = at as number
  }

  return {
    inputVar,
    position,
    value
  }
}

//
// SCENARIO GROUPS
//

export function scenarioGroup(
  name: string,
  scenarios: (CompareScenario | CompareUnresolvedScenarioRef)[]
): CompareScenarioGroup {
  return {
    kind: 'scenario-group',
    name,
    scenarios
  }
}
