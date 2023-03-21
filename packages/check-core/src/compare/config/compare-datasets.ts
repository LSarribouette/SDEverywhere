// Copyright (c) 2023 Climate Interactive / New Venture Fund

import type { ModelSpec } from '../../bundle/bundle-types'
import type { OutputVar } from '../../bundle/var-types'
import type { DatasetKey } from '../../_shared/types'
import type { CompareDataset, CompareScenario } from '../_shared/compare-resolved-types'

/**
 * Provides access to the set of dataset definitions (`CompareDataset` instances) that are used
 * when comparing the two models.
 */
export interface CompareDatasets {
  /**
   * Return all `CompareDataset` instances that are available for comparisons.
   */
  getAllDatasets(): IterableIterator<CompareDataset>

  /**
   * Return the dataset metadata for the given key.
   *
   * @param datasetKey The key for the dataset.
   */
  getDataset(datasetKey: DatasetKey): CompareDataset | undefined

  /**
   * Return the keys for the datasets that should be compared for the given scenario.
   *
   * @param scenario The scenario definition.
   */
  getDatasetKeysForScenario(scenario: CompareScenario): DatasetKey[]
}

/**
 * Create an implementation of the `CompareDatasets` interface that sources the output
 * variables from the given models.
 *
 * @param modelSpecL The model spec for the "left" bundle being compared.
 * @param modelSpecR The model spec for the "right" bundle being compared.
 * @param renamedDatasetKeys The mapping of renamed dataset keys.
 */
export function getCompareDatasets(
  modelSpecL: ModelSpec,
  modelSpecR: ModelSpec,
  renamedDatasetKeys?: Map<DatasetKey, DatasetKey>
): CompareDatasets {
  return new CompareDatasetsImpl(modelSpecL, modelSpecR, renamedDatasetKeys)
}

/**
 * Manages a set of dataset keys (corresponding to the available model outputs
 * in the given bundles) that can be used to compare two versions of the model.
 *
 * This class computes the union of the available dataset keys and handles
 * renames so that if any variables were renamed in the "right" bundle, the
 * old key will be used so that the variable can still be compared.
 *
 * This is intended to be a simple, general purpose way to create a set of
 * dataset keys, but every model is different, so you can replace this with
 * a different set of dataset keys that is better suited for the model you
 * are testing.
 */
class CompareDatasetsImpl implements CompareDatasets {
  private readonly allDatasets: Map<DatasetKey, CompareDataset>
  private readonly allOutputVarKeys: DatasetKey[]
  private readonly modelOutputVarKeys: DatasetKey[]

  /**
   * @param modelSpecL The model spec for the "left" bundle being compared.
   * @param modelSpecR The model spec for the "right" bundle being compared.
   * @param renamedDatasetKeys The mapping of renamed dataset keys.
   */
  constructor(modelSpecL: ModelSpec, modelSpecR: ModelSpec, renamedDatasetKeys?: Map<DatasetKey, DatasetKey>) {
    // Invert the map of renamed keys so that new names are on the left (map
    // keys) old names are on the right (map values)
    const invertedRenamedKeys: Map<DatasetKey, DatasetKey> = new Map()
    renamedDatasetKeys?.forEach((newKey, oldKey) => {
      invertedRenamedKeys.set(newKey, oldKey)
    })

    function leftKeyForRightKey(rightKey: DatasetKey): DatasetKey {
      return invertedRenamedKeys.get(rightKey) || rightKey
    }

    // Get the union of all output variables appearing in left and/or right
    const allOutputVarKeysSet: Set<DatasetKey> = new Set()
    const modelOutputVarKeysSet: Set<DatasetKey> = new Set()
    function addOutputVars(outputVars: Map<DatasetKey, OutputVar>, handleRenames: boolean): void {
      outputVars.forEach((outputVar, key) => {
        // When there are renamed output variables, only include the old dataset
        // key in the set of all keys
        const remappedKey = handleRenames ? leftKeyForRightKey(key) : key
        allOutputVarKeysSet.add(remappedKey)
        if (outputVar.sourceName === undefined) {
          modelOutputVarKeysSet.add(remappedKey)
        }
      })
    }
    addOutputVars(modelSpecL.outputVars, false)
    addOutputVars(modelSpecR.outputVars, true)
    this.allOutputVarKeys = Array.from(allOutputVarKeysSet)
    this.modelOutputVarKeys = Array.from(modelOutputVarKeysSet)

    // Create `CompareDataset` instances for all available keys
    this.allDatasets = new Map()
    for (const datasetKeyL of this.allOutputVarKeys) {
      const datasetKeyR = renamedDatasetKeys?.get(datasetKeyL) || datasetKeyL
      const outputVarL = modelSpecL.outputVars.get(datasetKeyL)
      const outputVarR = modelSpecR.outputVars.get(datasetKeyR)
      this.allDatasets.set(datasetKeyL, {
        key: datasetKeyL,
        outputVarL,
        outputVarR
      })
    }
  }

  // from CompareDatasets interface
  getAllDatasets(): IterableIterator<CompareDataset> {
    return this.allDatasets.values()
  }

  // from CompareDatasets interface
  getDataset(datasetKey: string): CompareDataset | undefined {
    return this.allDatasets.get(datasetKey)
  }

  // from CompareDatasets interface
  getDatasetKeysForScenario(scenario: CompareScenario): DatasetKey[] {
    if (scenario.settings.kind === 'all-inputs-settings' && scenario.settings.position === 'at-default') {
      // Include both model and static variables for the "all at default" scenario
      return this.allOutputVarKeys
    } else {
      // For all other scenarios, only include model variables (since only model
      // outputs are affected by different input scenarios)
      return this.modelOutputVarKeys
    }
  }
}
