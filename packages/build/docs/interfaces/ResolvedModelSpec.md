[@sdeverywhere/build](../index.md) / ResolvedModelSpec

# Interface: ResolvedModelSpec

Describes a model (e.g., a Vensim mdl file) and the input/output variables
that should be included in the model generated by SDEverywhere.  This is
largely the same as the `ModelSpec` interface, except this one has been
fully resolved (paths have been validated, input and output variables have
been checked, etc).  This is the spec object that will be passed to plugin
functions.

## Properties

### inputVarNames

 **inputVarNames**: `string`[]

The input variable names for the model.  This will be defined regardless
of whether `ModelSpec.inputs` was defined as an array of variable names
or an array of `InputSpec` instances.  (The input variable names are
derived from the `InputSpec` instances as needed.)

___

### inputs

 **inputs**: [`InputSpec`](InputSpec.md)[]

The input variable specs for the model.

___

### outputVarNames

 **outputVarNames**: `string`[]

The output variable names for the model.  This will be defined regardless
of whether `ModelSpec.outputs` was defined as an array of variable names
or an array of `OutputSpec` instances.  (The output variable names are
derived from the `OutputSpec` instances as needed.)

___

### outputs

 **outputs**: [`OutputSpec`](OutputSpec.md)[]

The output variable specs for the model.

___

### datFiles

 **datFiles**: `string`[]

The dat files that provide the data for exogenous data variables in the
model.

___

### bundleListing

 **bundleListing**: `boolean`

Whether to bundle a model listing with the generated model.

When this is true, a model listing will be bundled with the generated
model to allow the `runtime` package to resolve variables that are
referenced by name or identifier.  This listing will increase the size
of the generated model, so it is recommended to set this to true only
if it is needed.

___

### customLookups

 **customLookups**: `boolean` \| `string`[]

Whether to allow lookups to be overridden at runtime using `setLookup`.

If false, the generated model will contain a `setLookup` function that
throws an error, meaning that lookups cannot be overridden at runtime.

If true, all lookups in the generated model will be available to be
overridden.

If an array is provided, only those variable names in the array will
be available to be overridden.

___

### customOutputs

 **customOutputs**: `boolean` \| `string`[]

Whether to allow for capturing the data for arbitrary variables at
runtime (including variables that are not configured in the `outputs`
array).

If false, the generated model will contain a `storeOutput` function
that throws an error, meaning that the data for arbitrary variables
cannot be captured at runtime.

If true, all variables in the generated model will be available to be
captured at runtime.

If an array is provided, only those variable names in the array will
be available to be captured at runtime.

___

### options

 `Optional` **options**: `Object`

Additional options included with the SDE `spec.json` file.

#### Index signature

▪ [key: `string`]: `any`