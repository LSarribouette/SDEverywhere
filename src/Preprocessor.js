const path = require('path')
const R = require('ramda')
const B = require('bufx')

let preprocessModel = (mdlFilename, spec, writeRemovals = false) => {
  const MACROS_FILENAME = 'macros.txt'
  const REMOVALS_FILENAME = 'removals.txt'
  const ENCODING = '{UTF-8}'
  let opts = {
    emitEncoding: false,
    emitMacros: false,
    emitComments: false,
    emitSketch: false,
    joinFormulaLines: true
  }
  // These options produce a model file that is still executable by Vensim.
  // opts = {
  //   emitEncoding: true,
  //   emitMacros: true,
  //   emitComments: true,
  //   emitSketch: false,
  //   joinFormulaLines: false
  // }
  let mdl, eqns
  // Equations that contain a string in the removalKeys list in the spec file will be removed.
  let removalKeys = (spec && spec.removalKeys) || []
  // Get the first line of an equation.
  let firstLine = s => {
    let i = s.indexOf('\n')
    if (i < 0) {
      return s.trim()
    } else {
      return s.slice(0, i).trim()
    }
  }
  let getMdlFromPPBuf = () => {
    // Reset the mdl string from the preprocessor buffer.
    mdl = B.getBuf('pp')
    B.clearBuf('pp')
  }
  // Open output channels.
  B.open('rm')
  B.open('macros')
  B.open('pp')
  // Read the model file.
  mdl = B.read(mdlFilename)

  // Remove the macro section.
  let inMacroSection = false
  for (let line of B.lines(mdl)) {
    if (!inMacroSection && R.contains(':MACRO:', line)) {
      B.emitLine(line, 'macros')
      inMacroSection = true
    } else if (inMacroSection) {
      B.emitLine(line, 'macros')
      if (R.contains(':END OF MACRO:', line)) {
        B.emit('\n', 'macros')
        inMacroSection = false
      }
    } else {
      B.emitLine(line, 'pp')
    }
  }
  getMdlFromPPBuf()

  // Split the model into an array of equations and groups.
  eqns = mdl.split('|')
  // Remove some equations into the removals channel.
  for (let eqn of eqns) {
    if (R.contains('\\---/// Sketch', eqn)) {
      if (!opts.emitSketch) {
        // Skip everything starting with the first sketch section.
        break
      }
    } else if (R.contains('********************************************************', eqn)) {
      // Skip groups
    } else if (R.contains('TABBED ARRAY', eqn) || R.any(x => R.contains(x, eqn), removalKeys)) {
      // Remove tabbed arrays and equations containing removal key strings from the spec.
      B.emit(eqn, 'rm')
      B.emit('|', 'rm')
    } else if (!R.isEmpty(eqn)) {
      // Emit the equation.
      B.emit(eqn, 'pp')
      B.emit('|', 'pp')
    }
  }
  getMdlFromPPBuf()

  // Join lines continued with trailing backslash characters.
  let prevLine = ''
  for (let line of B.lines(mdl)) {
    // Join a previous line with a backslash ending to the current line.
    if (!R.isEmpty(prevLine)) {
      line = prevLine + line.trim()
      prevLine = ''
    }
    let continuation = line.match(/\\\s*$/)
    if (continuation) {
      // If there is a backslash ending on this line, save it without the backslash.
      prevLine = line.substr(0, continuation.index).replace(/\s+$/, ' ')
    } else {
      // With no continuation on this line, go ahead and emit it.
      B.emitLine(line, 'pp')
    }
  }
  getMdlFromPPBuf()

  // Emit formula lines.
  eqns = mdl.split('|')
  for (let eqn of eqns) {
    let i = eqn.indexOf('~')
    if (i >= 0) {
      let formula = B.lines(eqn.substr(0, i))
      for (let i = 0; i < formula.length; i++) {
        if (i === 0 && formula[i] === ENCODING) {
          if (opts.emitEncoding) {
            B.emitLine(formula[i], 'pp')
          }
          if (opts.emitMacros) {
            let macros = B.getBuf('macros')
            B.emit(macros, 'pp')
          }
        } else {
          if (opts.joinFormulaLines) {
            B.emit(formula[i].replace(/^\t+/, ''), 'pp')
          } else {
            B.emitLine(formula[i], 'pp')
          }
        }
      }
      if (opts.joinFormulaLines) {
        B.emitLine(opts.emitComments ? '' : ' ~~|', 'pp')
      }
      if (opts.emitComments) {
        // Emit the comment as-is with a leading tab to emulate Vensim.
        B.emit('\t', 'pp')
        B.emit(eqn.substr(i), 'pp')
        if (opts.joinFormulaLines) {
          B.emitLine('|', 'pp')
        } else {
          B.emit('|', 'pp')
        }
      }
    }
  }
  getMdlFromPPBuf()

  // Write removals to a file in the model directory.
  if (writeRemovals) {
    // Write macros to a file if we did not emit them to the model.
    if (!opts.emitMacros && B.getBuf('macros')) {
      let macrosPathname = path.join(path.dirname(mdlFilename), MACROS_FILENAME)
      B.writeBuf(macrosPathname, 'macros')
    }
    if (B.getBuf('rm')) {
      let rmPathname = path.join(path.dirname(mdlFilename), REMOVALS_FILENAME)
      B.writeBuf(rmPathname, 'rm')
    }
  }
  // Return the preprocessed model as a string.
  return mdl
}

module.exports = { preprocessModel }
