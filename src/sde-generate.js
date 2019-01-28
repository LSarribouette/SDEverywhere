const fs = require('fs-extra')
const path = require('path')
const R = require('ramda')
const sh = require('shelljs')
const antlr4 = require('antlr4/index')
const browserify = require('browserify')
const { ModelLexer, ModelParser } = require('antlr4-vensim')
const { codeGenerator } = require('./CodeGen')
const { preprocessModel } = require('./Preprocessor')
const {
  canonicalName,
  modelPathProps,
  buildDir,
  webDir,
  linkCSourceFiles,
  filesExcept,
  execCmd,
  readDat
} = require('./Helpers')
const { makeModelSpec, makeModelConfig } = require('./MakeConfig')
const Model = require('./Model')
const Subscript = require('./Subscript')
const B = require('bufx')

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
    describe: 'write a preprocessed model that runs in Vensim',
    type: 'boolean',
    alias: 'p'
  },
  analysis: {
    describe: 'write a nonexecutable preprocessed model for analysis',
    type: 'boolean',
    alias: 'a'
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
  // Generate a spec file from the app.yaml file for web apps.
  // This overrides the --spec argument if present.
  if (opts.genhtml) {
    opts.spec = makeModelSpec(modelDirname)
  }
  // Preprocess model text into parser input. Stop now if that's all we're doing.
  let spec = parseSpec(opts.spec)
  let extData = readDatFiles(modelDirname, spec.datfiles)
  // Produce a runnable model with the "genc" and "preprocess" options.
  let profile = opts.analysis ? 'analysis' : 'genc'
  // Write the preprocessed model and removals if the option is "analysis" or "preprocess".
  let writeFiles = opts.analysis || opts.preprocess
  let input = preprocessModel(modelPathname, spec, profile, writeFiles)
  if (writeFiles) {
    let outputPathname = path.join(buildDirname, `${modelName}.mdl`)
    writeOutput(outputPathname, input)
    process.exit(0)
  }
  // Parse the model and generate code. If no operation is specified, the code generator will
  // read the model and do nothing else. This is required for the list operation.
  let operation = ''
  if (opts.genc || opts.genhtml) {
    operation = 'generateC'
  } else if (opts.list) {
    operation = 'printVarList'
  } else if (opts.refidtest) {
    operation = 'printRefIdTest'
  }
  let parseTree = parseModel(input)
  let code = codeGenerator(parseTree, { spec, operation, extData }).generate()
  if (opts.genc || opts.genhtml) {
    let outputPathname = path.join(buildDirname, `${modelName}.c`)
    writeOutput(outputPathname, code)
  }
  if (opts.list) {
    let outputPathname, outputText
    // Write variables to a text file.
    outputPathname = path.join(buildDirname, `${modelName}_vars.txt`)
    outputText = Model.printVarList()
    writeOutput(outputPathname, outputText)
    // Write subscripts to a text file.
    outputPathname = path.join(buildDirname, `${modelName}_subs.txt`)
    outputText = Subscript.printSubscripts()
    writeOutput(outputPathname, outputText)
    // Write variables to a YAML file.
    outputPathname = path.join(buildDirname, `${modelName}_vars.yaml`)
    outputText = Model.yamlVarList()
    writeOutput(outputPathname, outputText)
    // Write subscripts to a YAML file.
    outputPathname = path.join(buildDirname, `${modelName}_subs.yaml`)
    outputText = Subscript.yamlSubsList()
    writeOutput(outputPathname, outputText)
  }
  // Generate a web app for the model.
  if (opts.genhtml) {
    let webDirname = webDir(buildDirname)
    linkCSourceFiles(modelDirname, buildDirname)
    if (generateWASM(buildDirname, webDirname) === 0) {
      makeModelConfig(modelDirname, webDirname)
      copyTemplate(buildDirname)
      customizeApp(modelDirname, webDirname)
      packApp(webDirname)
    }
  }
}
let generateWASM = (buildDirname, webDirname) => {
  // Generate WASM from C source files in the build directory.
  let args = filesExcept(`${buildDirname}/*.c`, name => name.endsWith('main.c'))
  // Include the build directory as a place to look for header files.
  args.push(`-I${buildDirname}`)
  // Set the output pathname for the JavaScript wrapper to the web directory.
  // The WASM file will be written to the same directory and basename.
  args.push('-o')
  args.push(path.join(webDirname, 'model_sde.js'))
  // Set flags for WASM compilation and optimization.
  // Use -O0 optimization in development to get readable model_sde.js wrapper source.
  // Use -Oz optimization for productions runs.
  args.push('-Wall -Oz')
  // Turn on safe heap to debug "application has corrupted its heap memory area" exceptions.
  // Also turn on the clamp when using safe heap. Ref: https://github.com/WebAssembly/binaryen/issues/1110
  // args.push('-s SAFE_HEAP=1')
  // args.push('-s "BINARYEN_TRAP_MODE=\'clamp\'"')
  // Prevent the WASM code from exiting after it runs the model.
  args.push('-s NO_EXIT_RUNTIME=1')
  // Export the function that runs the model.
  args.push('-s EXPORTED_FUNCTIONS="[\'_run_model\']"')
  // Export the Module.cwrap method used to wrap arguments.
  args.push('-s "EXTRA_EXPORTED_RUNTIME_METHODS=[\'cwrap\']"')
  // Use a simpler malloc to reduce code size.
  args.push('-s MALLOC=emmalloc')
  // Run the Closure compiler to minimize JS glue code.
  args.push('--closure 1')
  // Run the emcc command to generate WASM code.
  let cmd = `emcc ${args.join(' ')}`
  // console.log(cmd)
  let exitCode = execCmd(cmd)
  if (exitCode) {
    console.error('The Emscripten SDK must be installed in your path.')
  }
  return exitCode
}
let copyTemplate = buildDirname => {
  // Copy template files from the src/web directory.
  let templateDirname = path.join(__dirname, 'web')
  sh.cp('-Rf', templateDirname, buildDirname)
}
let customizeApp = (modelDirname, webDirname) => {
  // Read the newly generated model config to customize app files.
  let cfgPathname = `${webDirname}/model_config`
  try {
    const { app } = require(cfgPathname)
    if (app && app.logo) {
      let logoPathname = `${modelDirname}/${app.logo}`
      sh.cp('-f', logoPathname, webDirname)
    }
  } catch (e) {
    console.error(e.message)
  }
}
let packApp = webDirname => {
  // Concatenate JS source files for the browser.
  let sourcePathname = path.join(webDirname, 'index.js')
  let minPathname = path.join(webDirname, 'index.min.js')
  // Resolve module imports against the SDEverywhere node_modules.
  let nodePath = path.resolve(__dirname, '..', 'node_modules')
  let b = browserify(sourcePathname, { paths: nodePath })
  let writable = fs.createWriteStream(minPathname)
  b.bundle()
    .pipe(writable)
    .on('finish', error => {
      // Remove JavaScript source files.
      let sourceFiles = filesExcept(
        `${webDirname}/*.js`,
        name => name.endsWith('index.min.js') || name.endsWith('model_sde.js')
      )
      // In development, comment this out to retain generated source files.
      sh.rm(sourceFiles)
    })
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
  let spec = parseJsonFile(specFilename)
  // Translate dimension families in the spec to canonical form.
  if (spec.dimensionFamilies) {
    let f = {}
    for (let dimName in spec.dimensionFamilies) {
      let family = spec.dimensionFamilies[dimName]
      f[canonicalName(dimName)] = canonicalName(family)
    }
    spec.dimensionFamilies = f
  }
  return spec
}
let parseJsonFile = filename => {
  // Parse the JSON file if it exists.
  let result = {}
  try {
    let json = B.read(filename)
    result = JSON.parse(json)
    // console.error(`loaded ${filename}`);
  } catch (ex) {
    // If the file doesn't exist, return an empty object without complaining.
  }
  return result
}
let readDatFiles = (modelDirname, datfiles) => {
  // Read time series from external DAT files into a single object.
  // The datfiles object is a map from var prefixes to pathnames.
  let extData = new Map()
  if (datfiles) {
    for (let varPrefix in datfiles) {
      let pathname = path.join(modelDirname, datfiles[varPrefix])
      let data = readDat(pathname, varPrefix)
      extData = new Map([...extData, ...data])
    }
  }
  return extData
}
let writeOutput = (outputPathname, outputText) => {
  try {
    B.write(outputText, outputPathname)
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
