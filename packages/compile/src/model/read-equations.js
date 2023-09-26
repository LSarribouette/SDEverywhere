import * as R from 'ramda'

import { parseVensimModel } from '@sdeverywhere/parse'

import { canonicalName, cartesianProductOf, newDepreciationVarName, newFixedDelayVarName } from '../_shared/helpers.js'

import {
  extractMarkedDims,
  indexNamesForSubscript,
  isDimension,
  normalizeSubscripts,
  separatedVariableIndex
} from '../_shared/subscript.js'

import Model from './model.js'
import { generateDelayVariables } from './read-equation-fn-delay.js'
import { generateNpvVariables } from './read-equation-fn-npv.js'
import { generateSmoothVariables } from './read-equation-fn-smooth.js'
import { readVariables } from './read-variables.js'

class Context {
  constructor(eqnLHS, refId) {
    // The LHS of the equation being processed
    this.eqnLHS = eqnLHS

    // The refId of the variable being processed
    this.refId = refId

    // The array of refIds for variables referenced by this variable (needed at `init` time)
    this.referencedInitVars = []

    // The array of refIds for variables referenced by this variable (needed at `eval` time)
    this.referencedEvalVars = []

    // The call stack "frames" that are pushed when traversing into function call nodes
    this.callStack = []

    // Whether the RHS has something other than a constant
    this.rhsNonConst = false
  }

  addVarReference(varRefId) {
    // Determine whether this is an "init" or "eval" reference
    let mode
    if (this.callStack.length > 0) {
      // We are in a function call.  The top-level function (the one at the bottom of the call
      // stack) determines the mode.
      mode = this.callStack[0].argMode
    } else {
      // We are not in a function call, so use the normal "eval" mode
      mode = 'eval'
    }

    // In Vensim a variable can refer to its current value in the state.
    // Do not add self-references to the lists of references.
    // Do not duplicate references.
    if (mode !== 'none') {
      const vars = mode === 'init' ? this.referencedInitVars : this.referencedEvalVars
      if (varRefId !== this.refId && !vars.includes(varRefId)) {
        vars.push(varRefId)
      }
    }
  }

  enterFunctionCall(fnId) {
    const callFrame = {
      fnId: fnId
    }
    this.callStack.push(callFrame)
  }

  exitFunctionCall() {
    this.callStack.pop()
  }

  /**
   * Return the function ID for the parent call.  For example, for the following:
   *   SMOOTH(x, MAX(y, z))
   * If this is called while evaluating `x`, then this function will return `_SMOOTH`.
   * If this is called while evaluating `y`, then this function will return `_MAX`.
   */
  getParentFnId() {
    if (this.callStack.length > 1) {
      return this.callStack[this.callStack.length - 2].fnId
    } else {
      return undefined
    }
  }

  /**
   * Set the index of the arg being evaluated in this call stack frame.
   *
   * @param {number} index The zero-based arg index.
   * @param {'none' | 'init' | 'eval'} mode Whether this is a normal ('eval') arg position,
   * or an 'init' position (like the second "initial" argument in an INTEG call), or 'none'
   * (meaning that the references will not be captured at this position, as is the case when
   * level vars are generated).
   */
  setArgIndex(index, mode = 'eval') {
    const frame = this.callStack[this.callStack.length - 1]
    frame.argIndex = index
    frame.argMode = mode
  }

  /**
   * Define a new variable with the given equation.  This will add the variable to the `Model`
   * and then perform the same `readEquation` step that is applied to all other regular variables.
   *
   * @param {*} eqnText The equation in Vensim format.
   */
  defineVariable(eqnText) {
    // Parse the equation text
    const parsedModel = { kind: 'vensim', root: parseVensimModel(eqnText) }

    // Create one or more `Variable` instances from the equation
    const vars = readVariables(parsedModel)

    // Add the variables to the `Model`
    vars.forEach(v => Model.addVariable(v))

    vars.forEach(v => {
      // Define the refId for the variable
      v.refId = Model.refIdForVar(v)

      // Process each variable using the same process as above
      readEquation(v)

      // Inhibit output for generated variables
      v.includeInOutput = false
    })
  }
}

/**
 * TODO: Docs
 *
 * @param v The `Variable` instance to process.
 */
export function readEquation(v) {
  const eqn = v.parsedEqn
  const context = new Context(eqn?.lhs, v.refId)

  // Visit the RHS of the equation.  If the equation is undefined, it is a synthesized
  // variable (e.g., `Time`), in which case we skip this step.
  if (eqn) {
    const rhs = eqn.rhs
    switch (rhs.kind) {
      case 'expr':
        visitExpr(v, rhs.expr, context)
        break
      case 'lookup':
        visitLookupDef(v, rhs.lookupDef)
        break
      case 'const-list':
        // TODO
        break
      case 'data':
        // TODO: For reasons of compatibility with the legacy reader, the new `readVariables`
        // will set `varType='data'` only when the variable is not expanded.  Once we remove
        // the legacy reader, we can fix `readVariables` to unconditionally set `varType='data'`
        // for all variables with 'data' on the RHS.  In the meantime, set it here.
        v.varType = 'data'
        break
      default:
        throw new Error(`Unhandled equation kind '${rhs.kind}'`)
    }
  }

  // Update the variable state
  if (context.referencedInitVars.length > 0) {
    v.initReferences = context.referencedInitVars
  }
  if (context.referencedEvalVars.length > 0) {
    v.references = context.referencedEvalVars
  }

  // Refine the variable type based on the contents of the equation
  if (v.points.length > 0) {
    v.varType = 'lookup'
  } else if (v.isAux() && !context.rhsNonConst) {
    v.varType = 'const'
  }
}

/**
 * TODO: Docs
 *
 * @param {*} v
 * @param {*} expr
 * @param {*} context
 */
function visitExpr(v, expr, context) {
  switch (expr.kind) {
    case 'number':
    case 'keyword':
      break

    case 'variable-ref':
      visitVariableRef(v, expr, context)
      break

    case 'unary-op':
      visitExpr(v, expr.expr, context)
      break

    case 'binary-op':
      visitExpr(v, expr.lhs, context)
      visitExpr(v, expr.rhs, context)
      break

    case 'parens':
      visitExpr(v, expr.expr, context)
      break

    case 'lookup-def':
      visitLookupDef(v, expr)
      break

    case 'lookup-call':
      visitLookupCall(v, expr, context)
      break

    case 'function-call':
      visitFunctionCall(v, expr, context)
      break

    default:
      throw new Error(`Unhandled expression kind '${expr.kind}' when reading ${v.modelLHS}`)
  }
}

/**
 * TODO: Docs
 *
 * @param {*} v
 * @param {*} varRefExpr
 * @param {*} context
 */
function visitVariableRef(v, varRefExpr, context) {
  // Mark the RHS as non-constant, since it has a variable reference
  context.rhsNonConst = true

  if (isDimension(varRefExpr.varId)) {
    // It is possible for a dimension name to be used where a variable would normally
    // be.  Here is an example taken from the "extdata" sample model:
    //   Chosen C = 1 ~~|
    //   C Selection[DimC] = IF THEN ELSE ( DimC = Chosen C , 1 , 0 ) ~~|
    // If we detect a dimension, don't add it as a normal variable reference.
    return
  }

  // Determine whether to add references to specific refIds (in the case of separated
  // non-apply-to-all variables) or just a single base refId (in the case of non-subscripted
  // or apply-to-all variables)
  const baseRefId = varRefExpr.varId
  const subIds = varRefExpr.subscriptRefs?.map(subRef => subRef.subId) || []
  const expandedRefIds = expandedRefIdsForVar(v, baseRefId, subIds)
  if (expandedRefIds.length > 0) {
    // Add a reference to each instance of the non-apply-to-all variable
    expandedRefIds.forEach(refId => context.addVarReference(refId))
  } else {
    // Add the single variable refId to the list of referenced variables
    context.addVarReference(baseRefId)
  }
}

/**
 * TODO: Docs
 *
 * @param {*} v
 * @param {*} def
 * @param {*} context
 */
function visitLookupDef(v, def) {
  // Save the lookup range and points to the variable
  if (def.range) {
    v.range = [def.range.min, def.range.max]
  }
  v.points = def.points
}

/**
 * TODO: Docs
 *
 * @param {*} v
 * @param {*} callExpr
 * @param {*} context
 */
function visitLookupCall(v, callExpr, context) {
  // Mark the RHS as non-constant, since it has a lookup call
  context.rhsNonConst = true
}

/**
 * TODO: Docs
 *
 * @param {*} v
 * @param {*} callExpr
 * @param {*} context
 */
function visitFunctionCall(v, callExpr, context) {
  // Mark the RHS as non-constant, since it has a function call
  context.rhsNonConst = true

  // Enter this function call
  context.enterFunctionCall(callExpr.fnId)

  // By default, all arguments are assumed to be used at eval time, but certain functions
  // will override this and mark specific argument positions as being used at init time
  let argModes = Array(callExpr.args.length).fill('eval')

  switch (callExpr.fnId) {
    case '_ACTIVE_INITIAL':
      validateCallDepth(callExpr, context)
      validateCallArgs(callExpr, 2)
      v.hasInitValue = true
      // The 2nd argument is used at init time
      argModes[1] = 'init'
      break

    case '_INITIAL':
      validateCallDepth(callExpr, context)
      validateCallArgs(callExpr, 1)
      v.varType = 'initial'
      v.hasInitValue = true
      // The single argument is used at init time
      argModes[0] = 'init'
      break

    case '_DELAY1':
    case '_DELAY1I':
    case '_DELAY3':
    case '_DELAY3I':
      validateCallArgs(callExpr, callExpr.fnId.endsWith('I') ? 3 : 2)
      // Don't set references inside the call, since the arguments will be referenced by new
      // generated vars
      for (let i = 0; i < argModes.length; i++) {
        argModes[i] = 'none'
      }
      generateDelayVariables(v, callExpr, context)
      break

    case '_DELAY_FIXED':
      validateCallDepth(callExpr, context)
      validateCallArgs(callExpr, 3)
      v.varType = 'level'
      v.varSubtype = 'fixedDelay'
      v.hasInitValue = true
      v.fixedDelayVarName = canonicalName(newFixedDelayVarName())
      // The 2nd and 3rd arguments are used at init time
      argModes[1] = 'init'
      argModes[2] = 'init'
      break

    case '_DEPRECIATE_STRAIGHTLINE':
      validateCallDepth(callExpr, context)
      validateCallArgs(callExpr, 4)
      v.varSubtype = 'depreciation'
      v.hasInitValue = true
      v.depreciationVarName = canonicalName(newDepreciationVarName())
      // The 2nd and 3rd arguments are used at init time
      // TODO: The 3rd (fisc) argument is not currently supported
      // TODO: Shouldn't the last (init) argument be marked as 'init' here?  (It's
      // not treated as 'init' in the legacy reader.)
      argModes[1] = 'init'
      argModes[2] = 'init'
      break

    case '_INTEG':
      validateCallDepth(callExpr, context)
      validateCallArgs(callExpr, 2)
      v.varType = 'level'
      v.hasInitValue = true
      // The 2nd argument is used at init time
      argModes[1] = 'init'
      break

    case '_NPV':
      validateCallArgs(callExpr, 4)
      // Don't set references inside the call, since the arguments will be referenced by new
      // generated vars
      for (let i = 0; i < argModes.length; i++) {
        argModes[i] = 'none'
      }
      generateNpvVariables(v, callExpr, context)
      break

    case '_SAMPLE_IF_TRUE':
      validateCallDepth(callExpr, context)
      validateCallArgs(callExpr, 3)
      v.hasInitValue = true
      // The 3rd argument is used at init time
      argModes[2] = 'init'
      break

    case '_SMOOTH':
    case '_SMOOTHI':
    case '_SMOOTH3':
    case '_SMOOTH3I':
      validateCallArgs(callExpr, callExpr.fnId.endsWith('I') ? 3 : 2)
      // Don't set references inside the call, since the arguments will be referenced by new
      // generated vars
      for (let i = 0; i < argModes.length; i++) {
        argModes[i] = 'none'
      }
      generateSmoothVariables(v, callExpr, context)
      break

    default:
      // TODO: Show a warning if the function is not yet implemented in SDE (and is not explicitly
      // declared as a user-implemented macro)
      break
  }

  // XXX: The legacy reader does not add a reference to a function in certain cases (for example,
  // because the call is replaced by generated variables), so we will do the same
  let addFnReference = true
  switch (callExpr.fnId) {
    case '_IF_THEN_ELSE':
    case '_DELAY1':
    case '_DELAY1I':
    case '_DELAY3':
    case '_DELAY3I':
    case '_SMOOTH':
    case '_SMOOTHI':
    case '_SMOOTH3':
    case '_SMOOTH3I':
    case '_NPV':
      addFnReference = false
      break
    default:
      break
  }
  if (addFnReference) {
    const parentFnId = context.getParentFnId()
    switch (parentFnId) {
      case '_DELAY1':
      case '_DELAY1I':
      case '_DELAY3':
      case '_DELAY3I':
      case '_SMOOTH':
      case '_SMOOTHI':
      case '_SMOOTH3':
      case '_SMOOTH3I':
        addFnReference = false
        break
      default:
        break
    }
  }
  if (addFnReference) {
    // Keep track of all function names referenced in this expression.  Note that lookup
    // variables are sometimes function-like, so they will be included here.  This will be
    // used later to decide whether a lookup variable needs to be included in generated code.
    // TODO: The legacy `EquationReader` used `canonicalName` redundantly, which caused an
    // extra leading underscore.  We will do the same here for compatibility but this should
    // be fixed after the legacy reader is removed.
    const fnId = `_${callExpr.fnId.toLowerCase()}`
    if (v.referencedFunctionNames) {
      if (!v.referencedFunctionNames.includes(fnId)) {
        v.referencedFunctionNames.push(fnId)
      }
    } else {
      v.referencedFunctionNames = [fnId]
    }
  }

  // Visit each argument
  for (const [index, argExpr] of callExpr.args.entries()) {
    context.setArgIndex(index, argModes[index])
    visitExpr(v, argExpr, context)
  }

  // Exit this function call
  context.exitFunctionCall()
}

/**
 * Throw an error if the given function call does not appear at the top level of an equation RHS
 * (i.e., right after the equals sign).
 */
function validateCallDepth(callExpr, context) {
  if (context.callStack.length !== 1) {
    throw new Error(
      `Function '${callExpr.fnName}' cannot be used inside other function calls (it must appear directly after the '=' sign in an equation)`
    )
  }
}

/**
 * Throw an error if the given function call does not have the expected number of arguments.
 */
function validateCallArgs(callExpr, expectedArgCount) {
  if (callExpr.args.length !== expectedArgCount) {
    throw new Error(
      `Expected '${callExpr.fnName}' function call to have ${expectedArgCount} arguments but got ${callExpr.args.length} `
    )
  }
}

/**
 * When an equation references a non-apply-to-all array, add its subscripts to the array
 * var's refId.
 *
 * XXX: This is largely copied from the legacy `equation-reader.js` and modified to work
 * with the AST instead of directly depending on antlr4-vensim constructs.  This is pretty
 * complex so we should try to refactor or at least add some more fine-grained unit tests
 * for it.
 */
function expandedRefIdsForVar(lhsVariable, baseRefId, subscripts) {
  // Remove dimension subscripts marked with ! and save them for later.
  let markedDims = extractMarkedDims(subscripts)
  subscripts = normalizeSubscripts(subscripts)
  // console.error(`${this.var.refId} → ${this.refId} [ ${subscripts} ]`);

  if (subscripts.length === 0) {
    return []
  }

  // See if this variable is non-apply-to-all. At this point, the refId is just the var name.
  // References to apply-to-all variables do not need subscripts since they refer to the whole array.
  let expansionFlags = Model.expansionFlags(baseRefId)
  if (!expansionFlags) {
    // The reference is to a non-subscripted or apply-to-all variable
    return []
  }

  // The reference is to a non-apply-to-all variable.
  // Find the refIds of the vars that include the indices in the reference.
  // Get the vars with the var name of the reference. We will choose from these vars.
  let varsWithRefName = Model.varsWithName(baseRefId)

  // The refIds of actual vars containing the indices will accumulate with possible duplicates.
  let expandedRefIds = []
  let iSub

  // Accumulate an array of lists of the separated index names at each position.
  let indexNames = []
  for (iSub = 0; iSub < expansionFlags.length; iSub++) {
    if (expansionFlags[iSub]) {
      // For each index name at the subscript position, find refIds for vars that include the index.
      // This process ensures that we generate references to vars that are in the var table.
      let indexNamesAtPos
      // Use the single index name for a separated variable if it exists.
      // But don't do this if the subscript is a marked dimension in a vector function.
      let separatedIndexName = separatedVariableIndex(subscripts[iSub], lhsVariable, subscripts)
      if (!markedDims.includes(subscripts[iSub]) && separatedIndexName) {
        indexNamesAtPos = [separatedIndexName]
      } else {
        // Generate references to all the indices for the subscript.
        indexNamesAtPos = indexNamesForSubscript(subscripts[iSub])
      }
      indexNames.push(indexNamesAtPos)
    }
  }

  // Flatten the arrays of index names at each position into an array of index name combinations.
  let separatedIndices = cartesianProductOf(indexNames)
  // Find a separated variable for each combination of indices.
  for (let separatedIndex of separatedIndices) {
    // Consider each var with the same name as the reference in the equation.
    for (let refVar of varsWithRefName) {
      let iSeparatedIndex = 0
      for (iSub = 0; iSub < expansionFlags.length; iSub++) {
        if (expansionFlags[iSub]) {
          let refVarIndexNames = indexNamesForSubscript(refVar.subscripts[iSub])
          if (refVarIndexNames.length === 0) {
            console.error(
              `ERROR: no subscript at subscript position ${iSub} for var ${refVar.refId} with subscripts ${refVar.subscripts}`
            )
          }
          if (!refVarIndexNames.includes(separatedIndex[iSeparatedIndex++])) {
            break
          }
        }
      }
      if (iSub >= expansionFlags.length) {
        // All separated index names matched index names in the var, so add it as a reference.
        expandedRefIds.push(refVar.refId)
        break
      }
    }
  }

  // Sort the expandedRefIds and eliminate duplicates.
  return R.uniq(expandedRefIds.sort())
}