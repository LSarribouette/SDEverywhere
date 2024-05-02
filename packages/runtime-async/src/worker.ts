// Copyright (c) 2020-2022 Climate Interactive / New Venture Fund

import type { TransferDescriptor } from 'threads'
import { expose, Transfer } from 'threads/worker'

import type { RunnableModel, WasmModelInitResult } from '@sdeverywhere/runtime'
import { BufferedRunModelParams } from '@sdeverywhere/runtime'

// TODO: To avoid breaking existing code that returns `WasmModelInitResult`
// from this init function, we allow it to return either `WasmModelInitResult`
// or the newer `RunnableModel`.  We will remove the `WasmModelInitResult` part
// in a future set of changes.
/** @hidden */
let initRunnableModel: () => Promise<RunnableModel | WasmModelInitResult>

/** @hidden */
let runnableModel: RunnableModel

/**
 * Maintain a `BufferedRunModelParams` instance that wraps the transferable buffer
 * containing the I/O parameters.
 * @hidden
 */
const params = new BufferedRunModelParams()

interface InitResult {
  outputVarIds: string[]
  startTime: number
  endTime: number
  saveFreq: number
  outputRowLength: number
}

/** @hidden */
const modelWorker = {
  async initModel(): Promise<InitResult> {
    if (runnableModel) {
      throw new Error('RunnableModel was already initialized')
    }

    // Initialize the runnable model
    // TODO: To avoid breaking existing code that returns `WasmModelInitResult`
    // from this init function, we allow it to return either `WasmModelInitResult`
    // or the newer `RunnableModel`.  We will remove the `WasmModelInitResult` part
    // in a future set of changes.
    const initResult = await initRunnableModel()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((initResult as any).model !== undefined) {
      // The result is a `WasmModelInitResult`, so extract the `WasmModel` (which implements
      // the `RunnableModel` interface)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runnableModel = (initResult as any).model as RunnableModel
    } else {
      // Otherwise, we assume the result is a `RunnableModel`
      runnableModel = initResult as RunnableModel
    }

    // Transfer the model metadata to the runner
    return {
      outputVarIds: runnableModel.outputVarIds,
      startTime: runnableModel.startTime,
      endTime: runnableModel.endTime,
      saveFreq: runnableModel.saveFreq,
      outputRowLength: runnableModel.numSavePoints
    }
  },

  runModel(ioBuffer: ArrayBuffer): TransferDescriptor<ArrayBuffer> {
    if (!runnableModel) {
      throw new Error('RunnableModel must be initialized before running the model in worker')
    }

    // Update the `BufferedRunModelParams` to use the values in the buffer that was transferred
    // from the runner to the worker
    params.updateFromEncodedBuffer(ioBuffer)

    // Run the model synchronously on the worker thread using those I/O parameters
    runnableModel.runModel(params)

    // Transfer the buffer back to the runner
    return Transfer(ioBuffer)
  }
}

/**
 * Expose an object in the current worker thread that communicates with the
 * `ModelRunner` instance running in the main thread.  The exposed worker
 * object will take care of running the `RunnableModel` on the worker thread
 * and sending the outputs back to the main thread.
 *
 * @param init The function that initializes the `RunnableModel` instance that
 * is used in the worker thread.
 */
export function exposeModelWorker(init: () => Promise<RunnableModel | WasmModelInitResult>): void {
  // Save the initializer, which will be used when the runner calls `initModel`
  // on the worker
  initRunnableModel = init

  // Expose the worker implementation to `threads.js`
  expose(modelWorker)
}
