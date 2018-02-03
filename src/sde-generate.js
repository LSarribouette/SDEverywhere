const fs = require('fs-extra')
const path = require('path')
const R = require('ramda')
const sh = require('shelljs')
const antlr4 = require('antlr4/index')
const ModelLexer = require('./ModelLexer').ModelLexer
const ModelParser = require('./ModelParser').ModelParser
const { codeGenerator } = require('./CodeGen')
const { preprocessModel } = require('./Preprocessor')
const { modelPathProps, buildDir, webDir, readDat } = require('./Helpers')
const { makeModelSpec, makeModelConfig } = require('./MakeConfig')
const F = require('./futil')

let command = 'generate [options] <model>'
let describe = 'generate model code'
let builder = {
  genc: {
    describe: 'generate C code for the model',
    type: 'boolean'
  },
  genhtml: {
    describe: 'generate an HTML UI for the model',
    type: 'boolean'
  },
  list: {
    describe: 'list model variables',
    type: 'boolean',
    alias: 'l'
  },
  preprocess: {
    describe: 'output the preprocessed model',
    type: 'boolean',
    alias: 'p'
  },
  spec: {
    describe: 'pathname of the I/O specification JSON file',
    type: 'string',
    alias: 's'
  },
  builddir: {
    describe: 'build directory',
    type: 'string',
    alias: 'b'
  },
  refidtest: {
    describe: 'test reference ids',
    type: 'boolean',
    alias: 'r'
  }
}
let handler = argv => {
  generate(argv.model, argv)
}

let generate = (model, opts) => {
  // Get the model name and directory from the model argument.
  let { modelDirname, modelName, modelPathname } = modelPathProps(model)
  // Ensure the build directory exists.
  let buildDirname = buildDir(opts.builddir, modelDirname)
  // Generate a spec file from the app.yaml file. Override the --spec argument if present.
  if (opts.genhtml) {
    opts.spec = makeModelSpec(modelDirname)
  }
  // Preprocess model text into parser input. Stop now if that's all we're doing.
  let spec = parseSpec(opts.spec)
  let extData = readDatFiles(spec.datfiles)
  let writeRemovals = opts.preprocess
  let input = preprocessModel(modelPathname, spec, writeRemovals)
  if (opts.preprocess) {
    let outputPathname = path.join(buildDirname, `${modelName}.mdl`)
    writeOutput(outputPathname, input)
    process.exit(0)
  }
  // Parse the model and generate code.
  let operation = 'generateC'
  if (opts.list) {
    operation = 'printVarList'
  } else if (opts.refidtest) {
    operation = 'printRefIdTest'
  }
  let parseTree = parseModel(input)
  let code = codeGenerator(parseTree, spec, operation, extData).generate()
  if (opts.genc || opts.genhtml) {
    let outputPathname = path.join(buildDirname, `${modelName}.c`)
    writeOutput(outputPathname, code)
  }
  // Generate a web app for the model.
  if (opts.genhtml) {
    let webDirname = webDir(buildDirname)
    makeModelConfig(modelDirname, webDirname)
    // let modelJS = `sd_${modelName}.js`
    // createHTML(modelDirname, buildDirname, modelName, modelJS, spec)
    process.exit(0)
  }
}
let createHTML = (modelDirname, buildDirname, modelName, modelJS, spec) => {
  // Copy template files from the src/web directory.
  // Replace the model-specific variables with contents of the model spec JSON.
  let templatePath = path.join(__dirname, 'web', 'html')
  sh.cp('-rf', templatePath, modelDirname)
  // Copy JS & wasm from the build directory.
  sh.cp(path.join(buildDirname, '*.js'), web_app_path)
  sh.cp(path.join(buildDirname, '*.wasm'), web_app_path)
}

let parseModel = input => {
  // Read the model text and return a parse tree.
  let chars = new antlr4.InputStream(input)
  let lexer = new ModelLexer(chars)
  let tokens = new antlr4.CommonTokenStream(lexer)
  let parser = new ModelParser(tokens)
  parser.buildParseTrees = true
  return parser.model()
}
let parseSpec = specFilename => {
  var parsedJSON = parseJsonFile(specFilename)

  //get a simple list if inputVars
  if ('inputVarDef' in parsedJSON) {
    parsedJSON.inputVars = Object.keys(parsedJSON.inputVarDef)
  }
  return parsedJSON
}
let parseJsonFile = filename => {
  // Parse the JSON file if it exists.
  let result = {}
  try {
    let json = fs.readFileSync(filename, 'utf8')
    result = JSON.parse(json)
    // console.error(`loaded ${filename}`);
  } catch (ex) {
    // If the file doesn't exist, return an empty object without complaining.
  }
  return result
}
let readDatFiles = datfiles => {
  // Read time series from external DAT files into a single object.
  let extData = new Map()
  if (datfiles) {
    R.forEach(pathname => {
      let data = readDat(pathname)
      extData = new Map([...extData, ...data])
    }, datfiles)
  }
  return extData
}
let writeOutput = (outputPathname, outputText) => {
  try {
    fs.outputFileSync(outputPathname, outputText)
  } catch (e) {
    console.log(outputPathname)
    console.log(e.message)
  }
}
module.exports = {
  command,
  describe,
  builder,
  handler,
  generate
}
