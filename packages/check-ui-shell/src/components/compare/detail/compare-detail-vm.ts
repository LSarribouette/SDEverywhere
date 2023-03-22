// Copyright (c) 2021-2022 Climate Interactive / New Venture Fund

import assertNever from 'assert-never'

import type {
  ComparisonConfig,
  ComparisonDataCoordinator,
  ComparisonGroupDatasetRoot,
  ComparisonGroupScenarioRoot,
  ComparisonGroupSummary
} from '@sdeverywhere/check-core'
// import { diffGraphs } from '@sdeverywhere/check-core'

import type { CompareGraphsRowViewModel } from '../graphs/compare-graphs-row-vm'
// import { createCompareGraphsRowViewModel } from '../graphs/compare-graphs-row-vm'

import type { ComparisonDetailItem } from './compare-detail-item'
import { groupItemsByTitle } from './compare-detail-item'

import type { CompareDetailRowViewModel } from './compare-detail-row-vm'
import { createCompareDetailRowViewModel } from './compare-detail-row-vm'

export interface CompareDetailViewModel {
  /** The title (e.g., output variable name or scenario title). */
  title: string
  /** The subtitle (e.g., output variable source name or scenario position). */
  subtitle?: string
  /** The index of the row before this one. */
  previousRowIndex?: number
  /** The index of the row after this one. */
  nextRowIndex?: number
  /** The string displayed above the list of related items. */
  relatedListHeader: string
  /** The related items for the dataset or scenario. */
  relatedItems: string[]
  /** The compared graph rows in this group. */
  graphRows: CompareGraphsRowViewModel[]
  /** The detail box rows in this group. */
  detailRows: CompareDetailRowViewModel[]
}

export function createCompareDetailViewModel(
  comparisonConfig: ComparisonConfig,
  dataCoordinator: ComparisonDataCoordinator,
  groupSummary: ComparisonGroupSummary,
  previousRowIndex: number | undefined,
  nextRowIndex: number | undefined
): CompareDetailViewModel {
  switch (groupSummary.group.kind) {
    case 'by-dataset':
      return createCompareDetailViewModelForDataset(
        comparisonConfig,
        dataCoordinator,
        groupSummary,
        previousRowIndex,
        nextRowIndex
      )
    case 'by-scenario':
      return createCompareDetailViewModelForScenario(
        comparisonConfig,
        dataCoordinator,
        groupSummary,
        previousRowIndex,
        nextRowIndex
      )
    default:
      assertNever(groupSummary.group.kind)
  }
}

function createCompareDetailViewModelForDataset(
  comparisonConfig: ComparisonConfig,
  dataCoordinator: ComparisonDataCoordinator,
  groupSummary: ComparisonGroupSummary,
  previousRowIndex: number | undefined,
  nextRowIndex: number | undefined
): CompareDetailViewModel {
  // Get the primary dataset for the detail view
  const root = groupSummary.root as ComparisonGroupDatasetRoot
  // TODO: Show renamed variables in red+blue
  const outputVar = root.dataset.outputVarR || root.dataset.outputVarL
  const title = outputVar.varName
  const subtitle = outputVar.sourceName

  // Get the related graphs, etc; we only show the information relative to the "right" model
  const relatedItems: string[] = []
  function addRelatedItem(parts: string[]): void {
    const relatedItem = parts.join('&nbsp;<span class="related-sep">&gt;</span>&nbsp;')
    relatedItems.push(relatedItem)
  }
  for (const relatedItem of outputVar.relatedItems) {
    addRelatedItem(relatedItem.locationPath)
  }

  // Group the scenarios by title (input variable name, typically), then sort by score
  const groups = groupItemsByTitle(comparisonConfig, groupSummary.group.testSummaries, 'scenario')
  const detailRows: CompareDetailRowViewModel[] = []
  for (const group of groups) {
    // TODO: For now show up to two items
    // TODO: If more than two items in the row, add more rows
    const detailRow = createCompareDetailRowViewModel(
      comparisonConfig,
      dataCoordinator,
      'scenarios',
      group.title, // TODO
      undefined, // TODO
      [undefined, group.items[0], group.items[1]]
    )

    detailRows.push(detailRow)
  }
  // TODO: Put all-at-default row at top

  return {
    title,
    subtitle,
    previousRowIndex,
    nextRowIndex,
    relatedListHeader: 'Appears in:',
    relatedItems,
    graphRows: [],
    detailRows
  }
}

function createCompareDetailViewModelForScenario(
  comparisonConfig: ComparisonConfig,
  dataCoordinator: ComparisonDataCoordinator,
  groupSummary: ComparisonGroupSummary,
  previousRowIndex: number | undefined,
  nextRowIndex: number | undefined
): CompareDetailViewModel {
  // Get the primary scenario for the detail view
  const root = groupSummary.root as ComparisonGroupScenarioRoot
  const scenario = root.scenario
  const title = scenario.title
  const subtitle = scenario.subtitle

  // Include the related sliders
  const relatedItems: string[] = []
  function addRelatedItem(parts: string[]): void {
    const relatedItem = parts.join('&nbsp;<span class="related-sep">&gt;</span>&nbsp;')
    relatedItems.push(relatedItem)
  }
  if (scenario.settings.kind === 'input-settings') {
    // For now, show related sliders for the "right" model only
    for (const input of scenario.settings.inputs) {
      const inputVar = input.stateR.inputVar
      if (inputVar) {
        addRelatedItem(inputVar.relatedItem.locationPath)
      }
    }
  }

  // // Add the compared graphs at top (these are always shown in the specified order,
  // // without extra sorting)
  // const datasetSummaries = groupReport.datasetSummaries
  // const graphRows: CompareGraphsRowViewModel[] = []
  // if (groupInfo.featuredGraphs) {
  //   for (const graphId of groupInfo.featuredGraphs) {
  //     const graphL = compareConfig.bundleL.model.modelSpec.graphSpecs?.find(s => s.id === graphId)
  //     const graphR = compareConfig.bundleR.model.modelSpec.graphSpecs?.find(s => s.id === graphId)
  //     const graphReport = diffGraphs(graphL, graphR, scenario.key, datasetSummaries)
  //     graphRows.push(createCompareGraphsRowViewModel(compareConfig, dataCoordinator, scenario, graphId, graphReport))
  //   }
  // }

  // Create one box/row for each dataset in the group
  interface Row {
    viewModel: CompareDetailRowViewModel
    maxDiff: number
  }
  const rows: Row[] = []
  for (const testSummary of groupSummary.group.testSummaries) {
    const scenario = comparisonConfig.scenarios.getScenario(testSummary.s)
    if (scenario === undefined) {
      continue
    }

    const dataset = comparisonConfig.datasets.getDataset(testSummary.d)
    // TODO: Include both old and new names here, if applicable
    const outputVar = dataset.outputVarR || dataset.outputVarL

    const detailItem: ComparisonDetailItem = {
      title: outputVar.varName,
      subtitle: outputVar.sourceName,
      scenario,
      testSummary
    }

    const rowViewModel = createCompareDetailRowViewModel(
      comparisonConfig,
      dataCoordinator,
      'datasets',
      title,
      subtitle,
      [detailItem]
    )

    rows.push({
      viewModel: rowViewModel,
      maxDiff: testSummary.md
    })
  }

  // Sort rows by score (highest score at top), then alphabetically by dataset name
  const sortedRows = rows.sort((a, b) => {
    const aScore = a.maxDiff
    const bScore = b.maxDiff
    if (aScore !== bScore) {
      // Sort by score first
      return aScore > bScore ? -1 : 1
    } else {
      // Sort by dataset name alphabetically
      // TODO: Also sort by source name?
      const aDatasetName = a.viewModel.title.toLowerCase()
      const bDatasetName = b.viewModel.title.toLowerCase()
      return aDatasetName.localeCompare(bDatasetName)
    }
  })
  const detailRows = sortedRows.map(row => row.viewModel)

  return {
    title,
    subtitle,
    previousRowIndex,
    nextRowIndex,
    relatedListHeader: 'Related items:',
    relatedItems,
    graphRows: [],
    detailRows
  }
}
