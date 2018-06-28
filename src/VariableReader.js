const antlr4 = require('antlr4/index')
const { ModelParser } = require('antlr4-vensim')
const R = require('ramda')
const ModelReader = require('./ModelReader')
const Variable = require('./Variable')
const { sub, isDimension, isIndex, normalizeSubscripts } = require('./Subscript')
const { canonicalName, vlog, replaceInArray, printArray } = require('./Helpers')

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
    // VariableReader only considers subscript lists in the LHS.
    // Other rules can assume that subscripts are filled in because this comes first.
    if (ctx.parentCtx.ruleIndex === ModelParser.RULE_lhs) {
      if (this.var.subscripts.length == 0) {
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
      } else {
        // A second subscript list is an EXCEPT clause that establishes an ad hoc subdimension.
        // Construct a subdimension from the LHS subscripts minus the exception indices.
        let exceptSubs = R.map(id => canonicalName(id.getText()), ctx.Id())
        // printArray(R.map(id => id.getText(), ctx.Id()))
        // vlog('var with EXCEPT clause', this.var.varName)
        // printArray(this.var.subscripts)
        // printArray(exceptSubs)
        let isException = (indName, exceptSub) => {
          // Compare the LHS index name directly to an exception index subscript.
          let result = false
          if (isIndex(exceptSub)) {
            result = indName === exceptSub
          } else if (isDimension(exceptSub)) {
            result = R.contains(indName, sub(exceptSub).value)
          }
          return result
        }
        // 1D case
        if (this.var.subscripts.length === 1) {
          let subscript = this.var.subscripts[0]
          let exceptSub = exceptSubs[0]
          if (isDimension(subscript)) {
            // Separate into variables for each index in the dimension minus exceptions.
            for (let indName of sub(subscript).value) {
              if (!isException(indName, exceptSub)) {
                let v = new Variable(this.var.eqnCtx)
                v.varName = this.var.varName
                v.subscripts = replaceInArray(subscript, indName, this.var.subscripts)
                v.separationDim = subscript
                this.expandedVars.push(v)
              }
            }
          }
        }
      }
    }
    super.visitSubscriptList(ctx)
  }
  visitConstList(ctx) {
    let exprs = ctx.expr()
    let errmsgNoDim = () => vlog('ERROR: no dimension for constant list in variable', this.var.varName)
    let errmsgDimSize = () =>
      vlog('ERROR: the dimension size does not match the number of constants in constant list', this.var.varName)
    // A constant list should have more than one value because the syntax is a list of constants delimited by commas.
    if (exprs.length > 1) {
      // Construct a variable (based on the variable so far) for each constant on the list.
      // The parser collapses 2D constant lists into a flat list in row-major order.
      // The subscripts must be dimensions.
      let numDims = this.var.subscripts.length
      if (numDims === 0) {
        errmsgNoDim()
      } else if (numDims === 1) {
        let dimName = this.var.subscripts[0]
        if (isDimension(dimName)) {
          let dim = sub(dimName)
          if (dim.size !== exprs.length) {
            errmsgDimSize()
          }
          R.forEach(indName => {
            let v = new Variable(this.var.eqnCtx)
            v.varName = this.var.varName
            v.subscripts = [indName]
            this.expandedVars.push(v)
          }, dim.value)
        } else {
          errmsgNoDim()
        }
      } else if (numDims === 2) {
        let dimName1 = this.var.subscripts[0]
        let dimName2 = this.var.subscripts[1]
        if (isDimension(dimName1) && isDimension(dimName2)) {
          let dim1 = sub(dimName1)
          let dim2 = sub(dimName2)
          let n = dim1.size * dim2.size
          if (n !== exprs.length) {
            errmsgNoDim()
          }
          for (let indName1 of dim1.value) {
            for (let indName2 of dim2.value) {
              let v = new Variable(this.var.eqnCtx)
              v.varName = this.var.varName
              v.subscripts = [indName1, indName2]
              this.expandedVars.push(v)
            }
          }
        }
      }
    }
  }
}
