const antlr4 = require('antlr4/index')
const { ModelParser } = require('antlr4-vensim')
const R = require('ramda')
const ModelReader = require('./ModelReader')
const Variable = require('./Variable')
const { sub, isDimension, normalizeSubscripts } = require('./Subscript')
const { canonicalName, vlog, replaceInArray } = require('./Helpers')

module.exports = class VariableReader extends ModelReader {
  constructor(specialSeparationDims) {
    super()
    // specialSeparationDims are var names that need to be separated because of
    // circular references, mapped to the dimension subscript to separate on.
    // '{c-variable-name}': '{c-dimension-name}'
    this.specialSeparationDims = specialSeparationDims || {}
  }
  visitModel(ctx) {
    let equations = ctx.equation()
    if (equations) {
      for (let equation of equations) {
        equation.accept(this)
      }
    }
  }
  visitEquation(ctx) {
    // Start a new variable and an alternate array of variables for constant lists.
    const { addVariable } = require('./Model')
    this.var = new Variable(ctx)
    this.expandedVars = []
    // Fill in the variable by visiting the equation parse context.
    super.visitEquation(ctx)
    // Add variables to the model.
    if (this.expandedVars.length > 0) {
      R.forEach(v => addVariable(v), this.expandedVars)
    } else {
      addVariable(this.var)
    }
  }
  visitLhs(ctx) {
    this.var.varName = canonicalName(ctx.Id().getText())
    super.visitLhs(ctx)
  }
  visitSubscriptList(ctx) {
    if (ctx.parentCtx.ruleIndex === ModelParser.RULE_lhs) {
      // Get LHS subscripts in normal form.
      let subscripts = R.map(id => canonicalName(id.getText()), ctx.Id())
      this.var.subscripts = normalizeSubscripts(subscripts)
      // If the LHS has a subdimension as a subscript, expand it into individual
      // scalar variables for each index in the subdimension. This handles the case
      // where the indices need to be evaluated interleaved with other variables.
      // The separated variables are used instead of the original model variable.
      R.forEach(subscript => {
        if (isDimension(subscript)) {
          let dim = sub(subscript)
          let specialSeparationDim = this.specialSeparationDims[this.var.varName]
          if (dim.size < sub(dim.family).size || specialSeparationDim === subscript) {
            // Separate into variables for each index in the subdimension.
            R.forEach(indName => {
              let v = new Variable(this.var.eqnCtx)
              v.varName = this.var.varName
              v.subscripts = replaceInArray(subscript, indName, this.var.subscripts)
              v.separationDim = subscript
              this.expandedVars.push(v)
            }, dim.value)
          }
        }
      }, this.var.subscripts)
    }
    super.visitSubscriptList(ctx)
  }
  visitConstList(ctx) {
    let exprs = ctx.expr()
    if (exprs.length > 1) {
      // Construct a variable (based on the variable so far) for each constant on the list.
      // Assume the subscript is a dimension because a constant list has more than one value.
      // TODO are there cases where there is more than one dimension?
      let dimName = this.var.subscripts[0]
      if (isDimension(dimName)) {
        let dim = sub(dimName)
        if (dim.size != exprs.length) {
          vlog(
            'ERROR: the number of dimensions does not match the number of constants in constant list',
            this.var.varName
          )
        }
        R.forEach(indName => {
          let v = new Variable(this.var.eqnCtx)
          v.varName = this.var.varName
          v.subscripts = [indName]
          this.expandedVars.push(v)
        }, dim.value)
      } else {
        vlog('ERROR: no dimension for constant list', this.var.varName)
      }
    }
  }
}
