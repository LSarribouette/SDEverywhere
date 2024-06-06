// Copyright (c) 2024 Climate Interactive / New Venture Fund

import { describe, expect, it } from 'vitest'

import { Outputs, createLookupDef, type LookupDef } from '../_shared'

import { ReferencedRunModelParams } from './referenced-run-model-params'
import { ModelListing } from '../model-listing'

const json = `
{
  "dimensions": [
  ],
  "variables": [
    {
      "refId": "_a",
      "varName": "_a",
      "varIndex": 1
    },
    {
      "refId": "_b",
      "varName": "_b",
      "varIndex": 2
    },
    {
      "refId": "_x",
      "varName": "_x",
      "varIndex": 3
    },
    {
      "refId": "_y",
      "varName": "_y",
      "varIndex": 4
    }
  ]
}
`

const p = (x: number, y: number) => {
  return {
    x,
    y
  }
}

describe('ReferencedRunModelParams', () => {
  it('should return correct values from accessors', () => {
    const inputs = [1, 2, 3]
    const outputs = new Outputs(['_x', '_y'], 2000, 2002, 1)

    const params = new ReferencedRunModelParams()
    params.updateFromParams(inputs, outputs)

    expect(params.getInputs()).toBeUndefined()

    expect(params.getOutputIndices()).toBeUndefined()

    expect(params.getOutputs()).toBeUndefined()
    expect(params.getOutputsObject()).toBeDefined()
    expect(params.getOutputsObject().varIds).toEqual(['_x', '_y'])
    expect(params.getOutputsLength()).toBe(6)
  })

  it('should copy inputs', () => {
    const inputs = [1, 2, 3]
    const outputs = new Outputs(['_x', '_y'], 2000, 2002, 1)

    const params = new ReferencedRunModelParams()
    params.updateFromParams(inputs, outputs)

    let array: Float64Array
    const create = (numElements: number) => {
      array = new Float64Array(numElements)
      return array
    }

    // Verify case where existing array is undefined
    params.copyInputs(undefined, create)
    expect(array).toEqual(new Float64Array([1, 2, 3]))

    // Verify case where existing array is too small
    array = new Float64Array(2)
    params.copyInputs(array, create)
    expect(array).toEqual(new Float64Array([1, 2, 3]))

    // Verify case where existing array is large enough
    array = new Float64Array([6, 6, 6, 6])
    params.copyInputs(array, create)
    expect(array).toEqual(new Float64Array([1, 2, 3, 6]))

    // Verify case where params are updated with an empty inputs array.  Note that
    // it is expected that the existing data is retained in the destination array;
    // it is up to the calling code to clear or ignore that existing data.
    params.updateFromParams([], outputs)
    params.copyInputs(array, create)
    expect(array).toEqual(new Float64Array([1, 2, 3, 6]))
  })

  it('should copy output indices', () => {
    const listing = new ModelListing(json)
    const inputs = [1, 2, 3]
    const normalOutputs = new Outputs(['_x', '_y'], 2000, 2002, 1)
    const implOutputs = listing.deriveOutputs(normalOutputs, ['_x', '_a', '_b'])

    const params = new ReferencedRunModelParams()
    params.updateFromParams(inputs, implOutputs)

    const expectedIndices = new Int32Array([
      // _x
      3, 0, 0, 0,
      // _a
      1, 0, 0, 0,
      // _b
      2, 0, 0, 0,
      // (zero terminator)
      0, 0, 0, 0
    ])

    let array: Int32Array
    const create = (numElements: number) => {
      array = new Int32Array(numElements)
      return array
    }

    // Verify case where existing array is undefined
    params.copyOutputIndices(undefined, create)
    expect(array).toEqual(expectedIndices)

    // Verify case where existing array is too small
    array = new Int32Array(2)
    params.copyOutputIndices(array, create)
    expect(array).toEqual(expectedIndices)

    // Verify case where existing array is large enough
    array = new Int32Array(20).fill(6)
    params.copyOutputIndices(array, create)
    expect(array).toEqual(
      new Int32Array([
        // _x
        3, 0, 0, 0,
        // _a
        1, 0, 0, 0,
        // _b
        2, 0, 0, 0,
        // (zero terminators)
        0, 0, 0, 0, 0, 0, 0, 0
      ])
    )
  })

  it('should store output values from the model run', () => {
    const inputs = [1, 2, 3]
    const outputs = new Outputs(['_x', '_y'], 2000, 2002, 1)

    const params = new ReferencedRunModelParams()
    params.updateFromParams(inputs, outputs)

    // Pretend that the model writes the following values to its buffer then
    // calls the `store` methods
    const outputsArray = new Float64Array([1, 2, 3, 4, 5, 6])
    params.storeElapsedTime(42)
    params.storeOutputs(outputsArray)

    // Verify that the elapsed time can be accessed
    expect(params.getElapsedTime()).toBe(42)

    // Verify that the `Outputs` instance is updated with the correct values
    expect(outputs.varIds).toEqual(['_x', '_y'])
    expect(outputs.getSeriesForVar('_x').points).toEqual([p(2000, 1), p(2001, 2), p(2002, 3)])
    expect(outputs.getSeriesForVar('_y').points).toEqual([p(2000, 4), p(2001, 5), p(2002, 6)])
  })

  it('should copy lookups', () => {
    const listing = new ModelListing(json)

    const inputs = [1, 2, 3]
    const outputs = new Outputs(['_x', '_y'], 2000, 2002, 1)

    const lookups: LookupDef[] = [
      createLookupDef(listing.varSpecs.get('_a'), [p(2000, 0), p(2001, 1), p(2002, 2)]),
      createLookupDef(listing.varSpecs.get('_b'), [p(2000, 5), p(2001, 6), p(2002, 7)])
    ]

    const params = new ReferencedRunModelParams()

    // Run once without providing lookups
    params.updateFromParams(inputs, outputs)

    // Verify that lookups array is undefined
    expect(params.getLookups()).toBeUndefined()

    // Run again with lookups
    params.updateFromParams(inputs, outputs, { lookups })

    // Verify that lookups array contains the expected values
    expect(params.getLookups()).toEqual(lookups)

    // Run again without lookups
    params.updateFromParams(inputs, outputs)

    // Verify that lookups array is undefined
    expect(params.getLookups()).toBeUndefined()

    // Run again with an empty lookup
    const emptyLookup = createLookupDef(listing.varSpecs.get('_a'), [])
    params.updateFromParams(inputs, outputs, {
      lookups: [emptyLookup]
    })

    // Verify that lookups array contains the expected values
    expect(params.getLookups()).toEqual([emptyLookup])
  })
})
