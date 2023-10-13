import { cdbl } from '../_shared/helpers.js'

// import Model from '../model/model.js'

/**
 * @typedef {Object} GenExprContext The context for a `generateExpr` call.
 * @param {*} variable The `Variable` instance to process.
 * @param {'decl' | 'init-constants' | 'init-lookups' | 'init-levels' | 'eval'} mode The code generation mode.
 * @param {string} varLhs The C code for the LHS variable reference.
 * @param {(varId: string) => string} varWithLhsSubscripts Function that returns a C variable reference that
 * takes into account the relevant LHS subscripts.
 */

/**
 * Generate the RHS code for the given expression.
 *
 * TODO: Types
 *
 * @param {*} expr The expression from the parsed model.
 * @param {GenExprContext} ctx The context used when generating code for the expression.
 * @return {string}
 */
export function generateExpr(expr, ctx) {
  switch (expr.kind) {
    case 'number':
      return cdbl(expr.value)

    case 'string':
      return `'${expr.text}'`

    case 'keyword':
      return expr.text

    case 'variable-ref':
      if (expr.subscriptRefs?.length > 0) {
        // TODO: Subscripts depend on loop states
        // return `${expr.varId}[${expr.subscriptRefs.map(ref => ref.subName).join(commaSep)}]`
        return 'VARIABLE WITH SUBS'
      } else {
        return expr.varId
      }

    case 'unary-op': {
      let op
      switch (expr.op) {
        case ':NOT:':
          op = '!'
          break
        case '+':
          // We can drop the explicit '+' prefix in this case
          op = ''
          break
        default:
          op = expr.op
          break
      }
      return `${op}${generateExpr(expr.expr, ctx)}`
    }

    case 'binary-op': {
      const lhs = generateExpr(expr.lhs, ctx)
      const rhs = generateExpr(expr.rhs, ctx)
      if (expr.op === '^') {
        return `pow(${lhs}, ${rhs})`
      } else {
        let op
        switch (expr.op) {
          case '=':
            op = '=='
            break
          case '<>':
            op = '!='
            break
          case ':AND:':
            op = '&&'
            break
          case ':OR:':
            op = '||'
            break
          default:
            op = expr.op
            break
        }
        return `${lhs} ${op} ${rhs}`
      }
    }

    case 'parens':
      return `(${generateExpr(expr.expr, ctx)})`

    case 'lookup-def':
      // Lookup defs in expression position should only occur in the case of `WITH LOOKUP`
      // function calls, and those are transformed into a generated lookup variable, so
      // we should never reach here and therefore throw an error to make that clear
      throw new Error(`Unexpected 'lookup-def' when reading ${ctx.variable.modelLHS}`)

    case 'lookup-call': {
      // const varRef = toPrettyString(expr.varRef, opts)
      // const arg = toPrettyString(expr.arg, opts)
      // return `${varRef}${lparen}${arg}${rparen}`
      return 'TODO'
    }

    case 'function-call':
      return generateFunctionCall(expr, ctx)

    default:
      throw new Error(`Unhandled expression kind '${expr.kind}' when reading ${ctx.variable.modelLHS}`)
  }
}

/**
 * Generate C code for the given function call.
 *
 * TODO: Types
 *
 * @param {*} callExpr The function call expression from the parsed model.
 * @param {GenExprContext} ctx The context used when generating code for the expression.
 */
function generateFunctionCall(callExpr, ctx) {
  const fnId = callExpr.fnId

  switch (fnId) {
    //
    //
    // Simple functions (no special handling required)
    //
    //

    case '_ABS':
    case '_COS':
    case '_EXP':
    case '_GAME':
    case '_GET_DATA_BETWEEN_TIMES':
    case '_IF_THEN_ELSE':
    case '_INTEGER':
    case '_LN':
    case '_LOOKUP_BACKWARD':
    case '_LOOKUP_FORWARD':
    case '_MAX':
    case '_MIN':
    case '_MODULO':
    case '_POW':
    case '_POWER':
    case '_PULSE':
    case '_PULSE_TRAIN':
    case '_QUANTUM':
    case '_RAMP':
    case '_SIN':
    case '_SQRT':
    case '_STEP':
    case '_SUM':
    case '_XIDZ':
    case '_ZIDZ': {
      // For simple functions, emit a C function call with a generated C expression for each argument
      const args = callExpr.args.map(argExpr => generateExpr(argExpr, ctx))
      return `${fnId}(${args.join(', ')})`
    }

    //
    // Level functions
    //

    case '_ACTIVE_INITIAL':
    case '_DELAY_FIXED':
    case '_DEPRECIATE_STRAIGHTLINE':
    case '_SAMPLE_IF_TRUE':
    case '_INTEG':
      // Split level functions into init and eval expressions
      if (ctx.mode.startsWith('init')) {
        return generateLevelInit(callExpr, ctx)
      } else if (ctx.mode === 'eval') {
        return generateLevelEval(callExpr, ctx)
      } else {
        throw new Error(`Invalid code gen mode '${ctx.mode}' for level variable ${ctx.variable.modelLHS}`)
      }

    //
    // Special functions
    //

    case '_GET_DIRECT_CONSTANTS':
      // TODO: Should not get here (throw error)
      break

    case '_ALLOCATE_AVAILABLE':
    case '_ELMCOUNT':
    case '_TREND':
    case '_VECTOR_ELM_MAP':
    case '_VECTOR_SELECT':
    case '_VECTOR_SORT_ORDER':
    case '_VMAX':
    case '_VMIN':
    case '_WITH_LOOKUP':
      break

    case '_DELAY1':
    case '_DELAY1I':
    case '_DELAY3':
    case '_DELAY3I': {
      // // For delay functions, replace the entire call with the expansion variable generated earlier
      // const delayVar = Model.varWithRefId(ctx.variable.delayVarRefId)
      // console.log(delayVar)
      // const rhsSubs = '' // TODO: generateRhsSubscripts(delayVar.subscripts)
      // return `(${delayVar.varName}${rhsSubs} / ${ctx.variable.delayTimeVarName}${rhsSubs})`
      return 'TODO'
    }

    case '_GET_DIRECT_DATA':
    case '_GET_DIRECT_LOOKUPS':
      break

    case '_INITIAL':
      break

    case '_NPV':
      break

    case '_SMOOTH':
    case '_SMOOTHI':
    case '_SMOOTH3':
    case '_SMOOTH3I':
      break

    default:
      break
  }
}

/**
 * Generate C code for the given level variable at init time.
 *
 * TODO: Types
 *
 * @param {*} callExpr The function call expression from the parsed model.
 * @param {GenExprContext} ctx The context used when generating code for the expression.
 */
function generateLevelInit(callExpr, ctx) {
  const fnId = callExpr.fnId

  // Get the index of the argument holding the initial value expression
  let initialArgIndex = 0
  switch (fnId) {
    case '_ACTIVE_INITIAL':
    case '_INTEG':
      initialArgIndex = 1
      break
    case '_DELAY_FIXED':
    case '_SAMPLE_IF_TRUE':
      initialArgIndex = 2
      break
    case '_DEPRECIATE_STRAIGHTLINE':
      initialArgIndex = 3
      break
    default:
      throw new Error(`Unhandled function '${fnId}' in code gen for level variable ${ctx.variable.modelLHS}`)
  }
  const initialArg = callExpr.args[initialArgIndex]
  return generateExpr(initialArg, ctx)
  //   // For DELAY FIXED and DEPRECIATE STRAIGHTLINE, also initialize the support struct
  //   // out of band, as they are not Vensim vars.
  //   if (fn === '_DELAY_FIXED') {
  //     let fixedDelay = `${this.var.fixedDelayVarName}${this.lhsSubscriptGen(this.var.subscripts)}`
  //     this.emit(`;\n  ${fixedDelay} = __new_fixed_delay(${fixedDelay}, `)
  //     this.setArgIndex(1)
  //     exprs[1].accept(this)
  //     this.emit(', ')
  //     this.setArgIndex(2)
  //     exprs[2].accept(this)
  //     this.emit(')')
  //   } else if (fn === '_DEPRECIATE_STRAIGHTLINE') {
  //     let depreciation = `${this.var.depreciationVarName}${this.lhsSubscriptGen(this.var.subscripts)}`
  //     this.emit(`;\n  ${depreciation} = __new_depreciation(${depreciation}, `)
  //     this.setArgIndex(1)
  //     exprs[1].accept(this)
  //     this.emit(', ')
  //     this.setArgIndex(2)
  //     exprs[3].accept(this)
  //     this.emit(')')
  //   }
}

/**
 * Generate C code for the given level variable at eval time.
 *
 * TODO: Types
 *
 * @param {*} callExpr The function call expression from the parsed model.
 * @param {GenExprContext} ctx The context used when generating code for the expression.
 */
function generateLevelEval(callExpr, ctx) {
  const fnId = callExpr.fnId

  function generateCall(args) {
    return `${fnId}(${args.join(', ')})`
  }

  switch (fnId) {
    case '_ACTIVE_INITIAL':
      // For ACTIVE INITIAL, emit the first arg without a function call
      return generateExpr(callExpr.args[0], ctx)

    case '_DELAY_FIXED': {
      // For DELAY FIXED, emit the first arg followed by the FixedDelay support var
      const args = []
      args.push(generateExpr(callExpr.args[0], ctx))
      args.push(ctx.varWithLhsSubscripts(ctx.variable.fixedDelayVarName))
      return generateCall(args)
    }

    case '_DEPRECIATE_STRAIGHTLINE': {
      // For DEPRECIATE STRAIGHTLINE, emit the first arg followed by the Depreciation support var
      const args = []
      args.push(generateExpr(callExpr.args[0], ctx))
      args.push(ctx.varWithLhsSubscripts(ctx.variable.depreciationVarName))
      return generateCall(args)
    }

    case '_INTEG':
    case '_SAMPLE_IF_TRUE': {
      // At eval time, emit the variable LHS as the first arg, giving the current value for the level.
      // Then emit the remaining arguments.
      const args = []
      args.push(ctx.varLhs)
      args.push(generateExpr(callExpr.args[0], ctx))
      if (fnId === '_SAMPLE_IF_TRUE') {
        args.push(generateExpr(callExpr.args[1], ctx))
      }
      return generateCall(args)
    }

    default:
      throw new Error(`Unhandled function '${fnId}' in code gen for level variable ${ctx.variable.modelLHS}`)
  }
}
