const fs = require('fs-extra')
const path = require('path')
const util = require('util')
const R = require('ramda')
const sh = require('shelljs')
const B = require('bufx')

// Set true to print a stack trace in vlog
const PRINT_VLOG_TRACE = false

// next sequence number for generated temporary variable names
let nextTmpVarSeq = 1
// next sequence number for generated lookup variable names
let nextLookupVarSeq = 1
// next sequence number for generated level variable names
let nextLevelVarSeq = 1
// next sequence number for generated aux variable names
let nextAuxVarSeq = 1
// string table for web apps
let strings = []

let canonicalName = name => {
  // Format a model variable name into a valid C identifier.
  return (
    '_' +
    name
      .replace(/"/g, '')
      .trim()
      .replace(/\s+!$/g, '!')
      .replace(/\s/g, '_')
      .replace(/,/g, '_')
      .replace(/-/g, '_')
      .replace(/\./g, '_')
      .replace(/\$/g, '_')
      .replace(/'/g, '_')
      .replace(/&/g, '_')
      .replace(/%/g, '_')
      .toLowerCase()
  )
}
let decanonicalize = name => {
  // Decanonicalize the var name.
  try {
    name = name.replace(/^_/, '').replace(/_/g, ' ')
    // Vensim variable names need to be surrounded by quotes if they:
    // do not start with a letter
    // do not contain only letters, spaces, numbers, single quotes, and dollar signs.
    if (!name.match(/^[A-Za-z]/) || name.match(/[^A-Za-z0-9\s'$]/)) {
      name = `"${name}"`
    }
  } catch (e) {
    debugger
    throw e
  }
  return name
}
let cFunctionName = name => {
  return canonicalName(name).toUpperCase()
}
let newTmpVarName = () => {
  // Return a unique temporary variable name
  return `__t${nextTmpVarSeq++}`
}
let newLookupVarName = () => {
  // Return a unique lookup arg variable name
  return `_lookup${nextLookupVarSeq++}`
}
let newLevelVarName = () => {
  // Return a unique level variable name
  return `_level${nextLevelVarSeq++}`
}
let newAuxVarName = () => {
  // Return a unique aux variable name
  return `_aux${nextAuxVarSeq++}`
}
let isSmoothFunction = fn => {
  // Return true if fn is a Vensim smooth function.
  return fn === '_SMOOTH' || fn === '_SMOOTHI' || fn === '_SMOOTH3' || fn === '_SMOOTH3I'
}
let isDelayFunction = fn => {
  // Return true if fn is a Vensim delay function.
  return fn === '_DELAY1' || fn === '_DELAY1I' || fn === '_DELAY3' || fn === '_DELAY3I'
}
let isArrayFunction = fn => {
  // Return true if fn is a Vensim array function.
  return fn === '_SUM' || fn === '_VECTOR_SELECT'
}
let listConcat = (a, x, addSpaces = false) => {
  // Append a string x to string a with comma delimiters
  let s = addSpaces ? ' ' : ''
  if (R.isEmpty(x)) {
    return a
  } else {
    return a + (R.isEmpty(a) ? '' : `,${s}`) + x
  }
}
let cdbl = x => {
  // Convert a number into a C double constant.
  let s = x.toString()
  if (!s.includes('.')) {
    s += '.0'
  }
  return s
}
let strToConst = c => {
  let d = parseFloat(c)
  return cdbl(d)
}
let extractMatch = (fn, list) => {
  // Return the first element of a list that matches the predicate and remove it from the list,
  // or return undefined if no element matches.
  let i = R.findIndex(fn, list)
  if (i >= 0) {
    return list.splice(i, 1)[0]
  } else {
    return undefined
  }
}
let replaceInArray = (oldStr, newStr, a) => {
  // Replace the first occurrence of oldStr with newStr in an array of strings a.
  // A new array is constructed. The original array remains unchanged.
  let i = R.indexOf(oldStr, a)
  if (i >= 0) {
    let b = a.slice(0)
    b.splice(i, 1, newStr)
    return b
  } else {
    return a
  }
}
let mapObjProps = (f, obj) => {
  // Map the key and value for each of the object's properties through function f.
  let result = {}
  R.forEach(k => (result[f(k)] = f(obj[k])), Object.keys(obj))
  return result
}
let isIterable = obj => {
  // Return true of the object is iterable.
  if (obj == null) {
    return false
  }
  return typeof obj[Symbol.iterator] === 'function'
}
let stringToId = str => {
  // Look up a string id. Create the id from the string if it is not found.
  let stringIndex = R.indexOf(str, strings)
  if (stringIndex < 0) {
    stringIndex = strings.length
    strings.push(str)
  }
  return `id${stringIndex}`
}
// Command helpers
let outputDir = (outfile, modelDirname) => {
  if (outfile) {
    outfile = path.dirname(outfile)
  }
  return ensureDir(outfile, 'output', modelDirname)
}
let buildDir = (build, modelDirname) => {
  // Ensure the given build directory or {modelDir}/build exists.
  return ensureDir(build, 'build', modelDirname)
}
let webDir = buildDirname => {
  // Ensure a web directory exists under the build directory.
  return ensureDir(null, 'web', buildDirname)
}
let ensureDir = (dir, defaultDir, modelDirname) => {
  // Ensure the directory exists as given or under the model directory.
  let dirName = dir || path.join(modelDirname, defaultDir)
  fs.ensureDirSync(dirName)
  return dirName
}
let linkCSourceFiles = (modelDirname, buildDirname) => {
  let cDirname = path.join(__dirname, 'c')
  sh.ls(cDirname).forEach(filename => {
    // If a C source file is present in the model directory, link to it instead
    // as an override.
    let srcPathname = path.join(modelDirname, filename)
    if (!fs.existsSync(srcPathname)) {
      srcPathname = path.join(cDirname, filename)
    }
    let dstPathname = path.join(buildDirname, filename)
    fs.ensureSymlinkSync(srcPathname, dstPathname)
  })
}
let filesExcept = (glob, exceptionFn) => {
  return R.reject(exceptionFn, sh.ls(glob))
}
let modelPathProps = model => {
  // Normalize a model pathname that may or may not include the .mdl extension.
  // If there is not a path in the model argument, default to the current working directory.
  // Return an object with properties that look like this:
  // modelDirname: '/Users/todd/src/models/arrays'
  // modelName: 'arrays'
  // modelPathname: '/Users/todd/src/models/arrays/arrays.mdl'
  let p = R.merge({ ext: '.mdl' }, R.pick(['dir', 'name'], path.parse(model)))
  if (R.isEmpty(p.dir)) {
    p.dir = process.cwd()
  }
  return {
    modelDirname: p.dir,
    modelName: p.name,
    modelPathname: path.format(p)
  }
}
let execCmd = cmd => {
  // Run a command line silently in the "sh" shell. Print error output on error.
  let exitCode = 0
  let result = sh.exec(cmd, { silent: true })
  if (sh.error()) {
    console.log(result.stderr)
    exitCode = 1
  }
  return exitCode
}
let readDat = (pathname, varPrefix = '') => {
  // Read a Vensim DAT file into a Map.
  // Key: variable name in canonical format
  // Value: Map from numeric time value to numeric variable value
  let log = new Map()
  let varName = ''
  let varValues = new Map()
  let lineNum = 1
  let splitDatLine = line => {
    // Return an array of nonempty string fields up to the first blank field.
    const f = line.split('\t')
    const len = f.length
    let fieldFrom = (i, values) => {
      if (i < len) {
        let value = f[i].trim()
        if (value !== '') {
          values.push(value)
          fieldFrom(i + 1, values)
        }
      }
      return values
    }
    return fieldFrom(0, [])
  }
  let addValues = () => {
    if (varName !== '' && varValues.size > 0) {
      log.set(`${varPrefix}${varName}`, varValues)
    }
  }
  try {
    let lines = B.lines(B.read(pathname))
    lines.forEach(line => {
      let values = splitDatLine(line)
      if (values.length === 1) {
        // Lines with a single value are variable names that start a data section.
        // Save the values for the current var if we are not on the first one.
        addValues()
        // Start a new map for this var.
        // Convert the var name to canonical form so it is the same in both logs.
        varName = canonicalName(values[0])
        varValues = new Map()
      } else if (values.length > 1) {
        // Data lines in Vensim DAT format have {time}\t{value} format with optional comments afterward.
        let t = B.num(values[0])
        let value = B.num(values[1])
        // Save the value at time t in the varValues map.
        if (Number.isNaN(t)) {
          console.error(`DAT file ${pathname}:${lineNum} time value is NaN`)
        } else if (Number.isNaN(value)) {
          console.error(`DAT file ${pathname}:${lineNum} var "${varName}" value is NaN at time=${t}`)
        } else {
          varValues.set(t, value)
        }
      }
      lineNum++
    })
    addValues()
  } catch (e) {
    console.error(e.message)
  }
  return log
}
let execCmdAsync = cmd => {
  // Run a command line asynchronously and silently in the "sh" shell. Print error output on error.
  let exitCode = 0
  sh.exec(cmd, { silent: true }, (status, stdout, stderr) => {
    if (status) {
      console.log(stderr)
      exitCode = 1
    }
  })
  return exitCode
}
// Function to map over lists's value and index
let mapIndexed = R.addIndex(R.map)
// Function to sort an array of strings
let asort = R.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
// Function to alpha sort an array of variables on the model LHS
let vsort = R.sort((a, b) => (a.modelLHS > b.modelLHS ? 1 : a.modelLHS < b.modelLHS ? -1 : 0))
// Function to list an array to stderr
let printArray = R.forEach(x => console.error(x))
// Function to expand an array of strings into a comma-delimited list of strings
let strlist = a => {
  return a.join(', ')
}
// Function to join an array with newlines
let lines = R.join('\n')
//
// Debugging helpers
//
let vlog = (title, value, depth = 1) => {
  if (value) {
    console.error(title, ':', util.inspect(value, { depth: depth, colors: false }))
  } else {
    console.error(title)
  }
  if (PRINT_VLOG_TRACE) {
    console.trace()
  }
}

module.exports = {
  asort,
  buildDir,
  canonicalName,
  cdbl,
  cFunctionName,
  execCmd,
  extractMatch,
  filesExcept,
  isArrayFunction,
  isDelayFunction,
  isSmoothFunction,
  isIterable,
  lines,
  linkCSourceFiles,
  listConcat,
  mapIndexed,
  mapObjProps,
  modelPathProps,
  newAuxVarName,
  newLevelVarName,
  newLookupVarName,
  newTmpVarName,
  outputDir,
  printArray,
  readDat,
  replaceInArray,
  strings,
  stringToId,
  strlist,
  strToConst,
  decanonicalize,
  vlog,
  vsort,
  webDir
}
