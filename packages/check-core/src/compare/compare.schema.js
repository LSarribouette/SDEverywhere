// Copyright (c) 2022 Climate Interactive / New Venture Fund

export default {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Model Comparison Test',
  type: 'object',
  description: 'A group of model comparison scenarios.',
  additionalProperties: false,
  properties: {
    input_scenarios: {
      $ref: '#/$defs/top_level_input_scenarios_array'
    },
    user_scenarios: {
      $ref: '#/$defs/top_level_user_scenarios_array'
    }
  },

  $defs: {
    //
    // INPUT SCENARIOS
    //

    top_level_input_scenarios_array: {
      type: 'array',
      items: {
        $ref: '#/$defs/top_level_input_scenarios_array_item'
      }
    },

    top_level_input_scenarios_array_item: {
      oneOf: [
        { $ref: '#/$defs/input_scenarios_array_scenario_item' },
        { $ref: '#/$defs/input_scenarios_array_group_item' }
      ]
    },

    input_scenarios_array_scenario_item: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scenario: {
          $ref: '#/$defs/input_scenario'
        }
      },
      required: ['scenario']
    },

    input_scenarios_array_group_item: {
      type: 'object',
      additionalProperties: false,
      properties: {
        group: {
          $ref: '#/$defs/input_scenario_group'
        }
      },
      required: ['group']
    },

    input_scenario: {
      oneOf: [
        { $ref: '#/$defs/input_scenario_with_input_at_position' },
        { $ref: '#/$defs/input_scenario_with_input_at_value' },
        { $ref: '#/$defs/input_scenario_with_multiple_input_settings' },
        { $ref: '#/$defs/input_scenario_with_inputs_in_preset_at_position' }
        // { $ref: '#/$defs/input_scenario_with_inputs_in_group_at_position' }
        // { $ref: '#/$defs/input_scenario_preset' }
        // { $ref: '#/$defs/input_scenario_expand_for_each_input_in_group' }
      ]
    },

    input_scenario_position: {
      type: 'string',
      enum: ['min', 'max', 'default']
    },

    input_scenario_with_input_at_position: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string'
        },
        with: {
          type: 'string'
        },
        at: {
          $ref: '#/$defs/input_scenario_position'
        }
      },
      required: ['name', 'with', 'at']
    },

    input_scenario_with_input_at_value: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string'
        },
        with: {
          type: 'string'
        },
        at: {
          type: 'number'
        }
      },
      required: ['name', 'with', 'at']
    },

    input_scenario_input_at_position: {
      type: 'object',
      additionalProperties: false,
      properties: {
        input: {
          type: 'string'
        },
        at: {
          $ref: '#/$defs/input_scenario_position'
        }
      },
      required: ['input', 'at']
    },

    input_scenario_input_at_value: {
      type: 'object',
      additionalProperties: false,
      properties: {
        input: {
          type: 'string'
        },
        at: {
          type: 'number'
        }
      },
      required: ['input', 'at']
    },

    input_scenario_input_setting: {
      oneOf: [{ $ref: '#/$defs/input_scenario_input_at_position' }, { $ref: '#/$defs/input_scenario_input_at_value' }]
    },

    input_scenario_input_setting_array: {
      type: 'array',
      items: {
        $ref: '#/$defs/input_scenario_input_setting'
      },
      minItems: 1
    },

    input_scenario_with_multiple_input_settings: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string'
        },
        with: {
          $ref: '#/$defs/input_scenario_input_setting_array'
        }
      },
      required: ['name', 'with']
    },

    input_scenario_with_inputs_in_preset_at_position: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string'
        },
        with_inputs: {
          type: 'string',
          enum: ['all']
        },
        at: {
          $ref: '#/$defs/input_scenario_position'
        }
      },
      required: ['name', 'with_inputs', 'at']
    },

    // input_scenario_preset: {
    //   type: 'object',
    //   additionalProperties: false,
    //   properties: {
    //     preset: {
    //       type: 'string',
    //       enum: ['matrix']
    //     }
    //   },
    //   required: ['preset']
    // }

    input_scenario_group: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string'
        },
        scenarios: {
          type: 'array',
          items: {
            $ref: '#/$defs/input_scenario_group_scenarios_array_item'
          },
          minItems: 1
        }
      },
      required: ['name', 'scenarios']
    },

    input_scenario_group_scenarios_array_item: {
      oneOf: [{ $ref: '#/$defs/input_scenarios_array_scenario_item' }, { $ref: '#/$defs/input_scenario_ref' }]
    },

    input_scenario_ref: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scenario_ref: {
          type: 'string'
        }
      },
      required: ['scenario_ref']
    },

    input_scenario_group_ref: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scenario_group_ref: {
          type: 'string'
        }
      },
      required: ['scenario_group_ref']
    },

    //
    // USER SCENARIOS
    //

    top_level_user_scenarios_array: {
      type: 'array',
      items: {
        $ref: '#/$defs/top_level_user_scenarios_array_group_item'
      }
    },

    top_level_user_scenarios_array_group_item: {
      type: 'object',
      additionalProperties: false,
      properties: {
        group: {
          $ref: '#/$defs/user_scenario_group'
        }
      }
      // required: ['group']
    },

    user_scenario_group: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string'
        },
        scenarios: {
          type: 'array',
          items: {
            $ref: '#/$defs/user_scenarios_array_item'
          },
          minItems: 1
        }
      },
      required: ['name', 'scenarios']
    },

    user_scenarios_array_item: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scenario: {
          $ref: '#/$defs/user_scenario'
        }
      }
    },

    user_scenario: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string'
        },
        input_scenarios: {
          type: 'array',
          items: {
            $ref: '#/$defs/user_scenario_input_scenarios_array_item'
          },
          minItems: 1
        },
        graphs: {
          $ref: '#/$defs/user_scenario_graphs'
        }
      },
      required: ['name', 'input_scenarios', 'graphs']
    },

    user_scenario_input_scenarios_array_item: {
      oneOf: [{ $ref: '#/$defs/input_scenario_ref' }, { $ref: '#/$defs/input_scenario_group_ref' }]
    },

    user_scenario_graphs: {
      oneOf: [{ $ref: '#/$defs/user_scenario_graphs_preset' }, { $ref: '#/$defs/user_scenario_graphs_array' }]
    },

    user_scenario_graphs_preset: {
      type: 'string',
      enum: ['all']
    },

    user_scenario_graphs_array: {
      type: 'array',
      items: {
        type: 'string'
      },
      minItems: 1
    }
  }
}
