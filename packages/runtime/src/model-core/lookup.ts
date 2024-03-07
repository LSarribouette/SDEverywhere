// Copyright (c) 2024 Climate Interactive / New Venture Fund

export type LookupMode = 'interpolate' | 'forward' | 'backward'

export class Lookup {
  private invertedData?: number[]
  private lastInput: number
  private lastHitIndex: number

  constructor(private readonly n: number, private readonly data: number[]) {
    if (data.length < n * 2) {
      throw new Error(`Lookup data array length must be >= 2*size (length=${data.length} size=${n}`)
    }
    this.lastInput = Number.MAX_VALUE
    this.lastHitIndex = 0
  }

  public getValueForX(x: number, mode: LookupMode): number {
    return this.get(x, false, mode)
  }

  public getValueForY(y: number): number {
    if (this.invertedData === undefined) {
      // Invert the matrix and cache it
      const numValues = this.n * 2
      const normalData = this.data
      const invertedData = Array(numValues)
      for (let i = 0; i < numValues; i += 2) {
        invertedData[i] = normalData[i + 1]
        invertedData[i + 1] = normalData[i]
      }
      this.invertedData = invertedData
    }
    return this.get(y, true, 'interpolate')
  }

  /**
   * Interpolate the y value from the array of (x,y) pairs.
   * NOTE: The x values are assumed to be monotonically increasing.
   */
  private get(input: number, useInvertedData: boolean, mode: LookupMode): number {
    const data = useInvertedData ? this.invertedData : this.data
    const max = this.n * 2

    // Use the cached values for improved lookup performance, except in the case
    // of `LOOKUP INVERT` (since it may not be accurate if calls flip back and forth
    // between inverted and non-inverted data)
    const useCachedValues = !useInvertedData
    let startIndex: number
    if (useCachedValues && input >= this.lastInput) {
      startIndex = this.lastHitIndex
    } else {
      startIndex = 0
    }

    for (let xi = startIndex; xi < max; xi += 2) {
      const x = data[xi]
      if (x >= input) {
        // We went past the input, or hit it exactly
        if (useCachedValues) {
          this.lastInput = input
          this.lastHitIndex = xi
        }

        if (xi === 0 || x === input) {
          // The input is less than the first x, or this x equals the input; return the
          // associated y without interpolation
          return data[xi + 1]
        }

        // Calculate the y value depending on the lookup mode
        switch (mode) {
          default:
          case 'interpolate': {
            // Interpolate along the line from the last (x,y)
            const last_x = data[xi - 2]
            const last_y = data[xi - 1]
            const y = data[xi + 1]
            const dx = x - last_x
            const dy = y - last_y
            return last_y + (dy / dx) * (input - last_x)
          }
          case 'forward':
            // Return the next y value without interpolating
            return data[xi + 1]
          case 'backward':
            // Return the previous y value without interpolating
            return data[xi - 1]
        }
      }
    }

    // The input is greater than all the x values, so return the high end of the range
    if (useCachedValues) {
      this.lastInput = input
      this.lastHitIndex = max
    }
    return data[max - 1]
  }
}
