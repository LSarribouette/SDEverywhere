// Copyright (c) 2023 Climate Interactive / New Venture Fund

import type { CompareDataset, CompareScenario } from '../_shared/compare-resolved-types'
import type { ComparisonTestSummary } from './comparison-report-types'

export type ComparisonGroupKind = 'by-dataset' | 'by-scenario'
export type ComparisonGroupKey = string // DatasetKey | CompareScenarioKey

/**
 * A group of comparison test summaries associated with a particular scenario or dataset.
 */
export interface ComparisonGroup {
  /** The kind of group, either 'by-dataset' or 'by-scenario'. */
  kind: ComparisonGroupKind
  /**
   * The unique key for this group (a `DatasetKey` if grouped by dataset, or a
   * `CompareScenarioKey` if grouped by scenario).
   */
  key: ComparisonGroupKey
  /** The comparison test summaries for this group. */
  testSummaries: ComparisonTestSummary[]
}

/** Metadata for the dataset that is associated with the comparisons in this group. */
export interface ComparisonGroupDatasetRoot {
  kind: 'dataset-root'
  /** The resolved `CompareDataset` associated with the comparisons in this group. */
  dataset: CompareDataset
}

/** Metadata for the scenario that is associated with the comparisons in this group. */
export interface ComparisonGroupScenarioRoot {
  kind: 'scenario-root'
  /** The resolved `CompareScenario` associated with the comparisons in this group. */
  scenario: CompareScenario
}

/** Describes the "root" or primary item for a group of comparisons. */
export type ComparisonGroupRoot = ComparisonGroupDatasetRoot | ComparisonGroupScenarioRoot

/** A summary of scores for a group of comparisons. */
export interface ComparisonGroupScores {
  /** The total number of comparisons (sample size) for this group. */
  totalDiffCount: number
  /** The sum of the `maxDiff` values for each threshold bucket. */
  totalMaxDiffByBucket: number[]
  /** The number of comparisons that fall into each threshold bucket. */
  diffCountByBucket: number[]
  /** The percentage of comparisons that fall into each threshold bucket. */
  diffPercentByBucket: number[]
}

/**
 * A summary of a group of comparisons that includes the resolved scenario/dataset metadata
 * and score information for the group.
 */
export interface ComparisonGroupSummary {
  /** The metadata for the "root" or primary item for this group of comparisons. */
  root: ComparisonGroupRoot
  /** The group containing the comparison summaries. */
  group: ComparisonGroup
  /** The scores for this group, or undefined if comparisons were not performed for this group. */
  scores?: ComparisonGroupScores
}

/**
 * Breaks down a set of by-scenario or by-dataset groupings into distinct categories.
 */
export interface ComparisonGroupSummariesByCategory {
  /**
   * Groups with items that are only valid for the "left" model (for example, datasets that
   * were removed and no longer available in the "right" model).
   */
  onlyInLeft: ComparisonGroupSummary[]
  /**
   * Groups with items that are only valid for the "right" model (for example, scenarios
   * for inputs that were added in the "right" model).
   */
  onlyInRight: ComparisonGroupSummary[]
  /**
   * Groups with one or more comparisons that have non-zero `maxDiff` scores; the groups
   * will be sorted by `maxDiff`, with higher scores at the front of the array.
   */
  withDiffs: ComparisonGroupSummary[]
  /**
   * Groups where all comparisons have `maxDiff` scores of zero (no differences between
   * "left" and "right").
   */
  withoutDiffs: ComparisonGroupSummary[]
}

/**
 * Rolls up all by-scenario and by-dataset groupings.
 */
export interface ComparisonCategorizedResults {
  /** The full set of by-scenario groupings. */
  byScenario: ComparisonGroupSummariesByCategory
  /** The full set of by-dataset groupings. */
  byDataset: ComparisonGroupSummariesByCategory
}
