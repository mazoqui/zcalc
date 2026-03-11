import * as C from "./constants.js";

/**
 * Creates a closure that calls a method on the machine object.
 */
function machineAction(methodName, args) {
  const action = function () {
    // H.machine is set at runtime
    window._calculatorState.machine[methodName].apply(
      window._calculatorState.machine,
      args,
    );
  };
  action.closureType = "machine";
  action.closureName = methodName;
  return action;
}

/**
 * Creates a closure that calls a method on the program controller.
 */
function programAction(methodName, args) {
  const action = function () {
    window._calculatorState.pgrm[methodName].call(
      window._calculatorState.pgrm,
      args,
    );
  };
  action.closureType = "pgrm";
  action.closureName = methodName;
  return action;
}

/**
 * Key dispatcher - maps calculator key presses to functions.
 *
 * The zCalc has a modifier key system:
 * - f (gold/orange): accesses financial functions
 * - g (blue): accesses alternate functions
 * - STO: store to register
 * - RCL: recall from register
 *
 * Each physical key can have multiple functions depending on the active modifier.
 */
export class Dispatcher {
  constructor() {
    this.functions = {}; // Key -> modifier -> function mapping
    this.modifierStateMachine = {}; // Modifier transition table

    this.initializeKeyMappings();
  }

  initializeKeyMappings() {
    const allKeys = [
      11,
      12,
      13,
      14,
      15,
      16, // Row 1: n, i, PV, PMT, FV, CHS
      7,
      8,
      9,
      10, // Row 1 right: 7, 8, 9, ÷
      21,
      22,
      23,
      24,
      25,
      26, // Row 2: y^x, 1/x, %T, Δ%, %, EEX
      4,
      5,
      6,
      20, // Row 2 right: 4, 5, 6, ×
      31,
      32,
      33,
      34,
      35,
      36, // Row 3: R/S, SST, R↓, x⇄y, CLx, ENTER
      1,
      2,
      3,
      30, // Row 3 right: 1, 2, 3, -
      41,
      42,
      43,
      44,
      45, // Row 4: ON, f, g, STO, RCL
      0,
      48,
      49,
      40,
      98, // Row 4 right: 0, ., Σ+, +, ←
    ];

    const modifierKeys = [
      C.KEY_FF,
      C.KEY_GG,
      C.KEY_STO,
      C.KEY_RCL,
      C.KEY_DECIMAL,
      C.KEY_DIVIDE,
      C.KEY_MULTIPLY,
      C.KEY_MINUS,
      C.KEY_PLUS,
      C.KEY_RDOWN,
    ];

    for (const key of allKeys) {
      this.functions[key] = {};
    }
    for (const key of modifierKeys) {
      this.modifierStateMachine[key] = {};
    }

    // === FINANCIAL KEYS (Row 1) ===

    // Key 11 (n): [f] Amortization, [g] 12×, [RCL] Recall n, [STO] Store n, [none] Store/Calc n
    this.mapKey(11, C.KEY_FF, "amortization", []);
    this.mapKey(11, C.KEY_GG, "ston_12x", [], { dontResetFinCalc: true });
    this.mapKey(11, C.KEY_RCL, "rclfin", [C.FIN_N]);
    this.mapKey(11, C.KEY_STO, "stofin", [C.FIN_N], { dontResetFinCalc: true });
    this.mapKey(11, 0, "sto_or_calc_fin", [C.FIN_N], {
      dontResetFinCalc: true,
    });

    // Key 12 (i): [f] Simple Interest, [g] 12÷, [RCL] Recall i, [STO] Store i, [none] Store/Calc i
    this.mapKey(12, C.KEY_FF, "simple_interest", []);
    this.mapKey(12, C.KEY_GG, "stoi_12div", [], { dontResetFinCalc: true });
    this.mapKey(12, C.KEY_RCL, "rclfin", [C.FIN_I]);
    this.mapKey(12, C.KEY_STO, "stofin", [C.FIN_I], { dontResetFinCalc: true });
    this.mapKey(12, 0, "sto_or_calc_fin", [C.FIN_I], {
      dontResetFinCalc: true,
    });

    // Key 13 (PV): [f] NPV, [g] Store CF0, [RCL] Recall PV, [STO] Store PV, [none] Store/Calc PV
    this.mapKey(13, C.KEY_FF, "npv", []);
    this.mapKey(13, C.KEY_GG, "stoCF0", []);
    this.mapKey(13, C.KEY_RCL, "rclfin", [C.FIN_PV]);
    this.mapKey(13, C.KEY_STO, "stofin", [C.FIN_PV], {
      dontResetFinCalc: true,
    });
    this.mapKey(13, 0, "sto_or_calc_fin", [C.FIN_PV], {
      dontResetFinCalc: true,
    });

    // Key 14 (PMT): [f] RND, [g] Store CFj, [RCL] Recall PMT, [RCL g] Recall CFj, [STO] Store PMT
    this.mapKey(14, C.KEY_FF, "rnd", []);
    this.mapKey(14, C.KEY_GG, "stoCFj", []);
    this.mapKey(14, C.KEY_RCL, "rclfin", [C.FIN_PMT]);
    this.mapKey(14, C.RCL_GG, "rclCFj", []);
    this.mapKey(14, C.KEY_STO, "stofin", [C.FIN_PMT], {
      dontResetFinCalc: true,
    });
    this.mapKey(14, 0, "sto_or_calc_fin", [C.FIN_PMT], {
      dontResetFinCalc: true,
    });

    // Key 15 (FV): [f] IRR, [g] Store Nj, [RCL g] Recall Nj, [RCL] Recall FV, [STO] Store FV
    this.mapKey(15, C.KEY_FF, "irr", []);
    this.mapKey(15, C.KEY_GG, "stoNj", []);
    this.mapKey(15, C.RCL_GG, "rclNj", []);
    this.mapKey(15, C.KEY_RCL, "rclfin", [C.FIN_FV]);
    this.mapKey(15, C.KEY_STO, "stofin", [C.FIN_FV], {
      dontResetFinCalc: true,
    });
    this.mapKey(15, 0, "sto_or_calc_fin", [C.FIN_FV], {
      dontResetFinCalc: true,
    });

    // Key 16 (CHS): [g] DATE, [none] CHS
    this.mapKey(16, C.KEY_GG, "date_date", []);
    this.mapKey(16, 0, "chs", []);

    // === DIGIT KEYS (0-9) ===
    for (let d = 0; d <= 9; ++d) {
      this.mapKey(d, C.KEY_FF, "set_decimals", [d, 0]);
      this.mapKey(d, C.KEY_RCL, "rcl", [d]);
      this.mapKey(d, C.RCL2, "rcl", [d + 10]);
      this.mapKey(d, C.KEY_STO, "sto", [d]);
      this.mapKey(d, C.STO2, "sto", [d + 10]);
      this.mapKey(d, C.STO_PLUS, "stoinfix", [d, C.STO_PLUS]);
      this.mapKey(d, C.STO_MINUS, "stoinfix", [d, C.STO_MINUS]);
      this.mapKey(d, C.STO_TIMES, "stoinfix", [d, C.STO_TIMES]);
      this.mapKey(d, C.STO_DIVIDE, "stoinfix", [d, C.STO_DIVIDE]);
      this.mapKey(d, C.GTO, "gto_digit_add", [d], { dontResetModifier: true });
      this.mapKey(d, 0, "digit_add", [d]);
    }

    // Digit-specific overrides
    this.mapKey(7, C.KEY_GG, "set_begin", [1], { dontResetFinCalc: true });
    this.mapKey(8, C.KEY_GG, "set_begin", [0], { dontResetFinCalc: true });
    this.mapKey(9, C.KEY_GG, "mem_info", [], { noProgramming: true });

    // === ARITHMETIC KEYS ===
    this.mapKey(10, 0, "divide", []);
    this.modifierStateMachine[10] = {};
    this.modifierStateMachine[10][C.KEY_STO] = C.STO_DIVIDE;

    this.mapKey(20, 0, "multiply", []);
    this.modifierStateMachine[20] = {};
    this.modifierStateMachine[20][C.KEY_STO] = C.STO_TIMES;

    this.mapKey(30, 0, "minus", []);
    this.modifierStateMachine[30] = {};
    this.modifierStateMachine[30][C.KEY_STO] = C.STO_MINUS;

    this.mapKey(40, 0, "plus", []);
    this.modifierStateMachine[40] = {};
    this.modifierStateMachine[40][C.KEY_STO] = C.STO_PLUS;

    // === ROW 2: MATHEMATICAL FUNCTIONS ===
    this.mapKey(21, C.KEY_FF, "bond_price", []);
    this.mapKey(21, C.KEY_GG, "sqroot", []);
    this.mapKey(21, 0, "poweryx", []);

    this.mapKey(22, C.KEY_FF, "bond_yield", []);
    this.mapKey(22, C.KEY_GG, "exp", []);
    this.mapKey(22, 0, "reciprocal", []);

    this.mapKey(23, C.KEY_FF, "depreciation_sl", []);
    this.mapKey(23, C.KEY_GG, "ln", []);
    this.mapKey(23, 0, "percentT", []);

    this.mapKey(24, C.KEY_FF, "depreciation_soyd", []);
    this.mapKey(24, C.KEY_GG, "frac", []);
    this.mapKey(24, 0, "deltapercent", []);

    this.mapKey(25, C.KEY_FF, "depreciation_db", []);
    this.mapKey(25, C.KEY_GG, "intg", []);
    this.mapKey(25, 0, "percent", []);

    this.mapKey(26, C.KEY_GG, "date_dys", []);
    this.mapKey(26, C.KEY_STO, "toggle_compoundf", []);
    this.mapKey(26, 0, "input_exponential", []);

    // === DATE KEYS ===
    this.mapKey(4, C.KEY_GG, "set_dmy", [1]);
    this.mapKey(5, C.KEY_GG, "set_dmy", [0]);

    // === STATISTICS ===
    this.mapKey(6, C.KEY_GG, "stat_avgw", []);
    this.mapKey(0, C.KEY_GG, "stat_avg", []);
    this.mapKey(48, C.KEY_FF, "set_decimals_exponential", []);
    this.mapKey(48, C.KEY_GG, "stat_stddev", []);
    this.mapKey(48, C.GTO, "gto_buf_clear", []);
    this.mapKey(48, 0, "decimal_point_mode", []);
    this.modifierStateMachine[48] = {};
    this.modifierStateMachine[48][C.KEY_STO] = C.STO2;
    this.modifierStateMachine[48][C.KEY_RCL] = C.RCL2;

    this.mapKey(49, C.KEY_GG, "stat_sigma_minus", []);
    this.mapKey(49, 0, "stat_sigma_plus", []);

    this.mapKey(1, C.KEY_GG, "stat_lr", [1]);
    this.mapKey(2, C.KEY_GG, "stat_lr", [0]);
    this.mapKey(3, C.KEY_GG, "fatorial", []);

    // === ROW 3: CONTROL KEYS ===
    this.mapKeyPgrm(31, C.KEY_GG, "pse", []);
    this.mapKey(31, C.KEY_FF, "prog_pr", []);
    this.functions[31][0] = programAction("rs", []);

    this.mapKey(32, C.KEY_FF, "clear_statistics", []);
    this.functions[32][C.KEY_GG] = programAction("bst", []);
    this.functions[32][0] = programAction("sst", []);

    this.mapKey(33, C.KEY_FF, "clear_prog", [0]);
    this.mapKey(33, 0, "r_down", []);
    this.modifierStateMachine[33] = {};
    this.modifierStateMachine[33][C.KEY_GG] = C.GTO;

    this.mapKey(34, C.KEY_FF, "clear_fin", []);
    this.mapKey(34, C.KEY_GG, "test_x_le_y", []);
    this.mapKey(34, 0, "x_exchange_y", []);

    this.mapKey(35, C.KEY_FF, "clear_reg", []);
    this.mapKey(35, C.KEY_GG, "test_x_eq0", []);
    this.mapKey(35, 0, "clx", []);

    this.mapKey(36, C.KEY_FF, "clear_prefix", []);
    this.mapKey(36, C.KEY_GG, "lstx", []);
    this.mapKey(36, 0, "enter", [0]);

    // === ROW 4: SPECIAL KEYS ===
    this.mapKey(41, 0, "toggle_power", [], { noProgramming: true });
    this.mapKey(41, C.KEY_RCL, "shv", [], { noProgramming: true });
    this.mapKey(41, C.KEY_STO, "apocryphal", [1], { noProgramming: true });

    // Modifier key transitions
    this.modifierStateMachine[42] = {};
    this.modifierStateMachine[42][0] = C.KEY_FF;
    this.modifierStateMachine[43] = {};
    this.modifierStateMachine[43][0] = C.KEY_GG;
    this.modifierStateMachine[43][C.KEY_RCL] = C.RCL_GG;
    this.modifierStateMachine[44] = {};
    this.modifierStateMachine[44][0] = C.KEY_STO;
    this.modifierStateMachine[45] = {};
    this.modifierStateMachine[45][0] = C.KEY_RCL;

    // Backspace
    this.mapKey(98, 0, "digit_delete", [], { noProgramming: true });
  }

  /**
   * Map a key + modifier combination to a machine method.
   */
  mapKey(keyCode, modifier, methodName, args, options = {}) {
    if (!this.functions[keyCode]) {
      this.functions[keyCode] = {};
    }
    const action = machineAction(methodName, args);
    if (options.dontResetFinCalc) action.dont_rst_do_fincalc = 1;
    if (options.dontResetModifier) action.dont_rst_modifier = 1;
    if (options.noProgramming) action.no_pgrm = 1;
    this.functions[keyCode][modifier] = action;
  }

  /**
   * Map a key + modifier to a machine method (alias for readability).
   */
  mapKeyPgrm(keyCode, modifier, methodName, args) {
    this.mapKey(keyCode, modifier, methodName, args);
  }

  /**
   * Handle modifier key state transitions.
   * Returns true if the key was handled as a modifier change.
   */
  handleModifier(keyCode, currentModifier, setModifier) {
    const transitions = this.modifierStateMachine[keyCode];
    if (transitions) {
      const newModifier = transitions[currentModifier];
      if (newModifier !== undefined) {
        setModifier(newModifier);
        return true;
      } else if (transitions[0] !== undefined) {
        setModifier(transitions[0]);
        return true;
      }
    }
    return false;
  }

  /**
   * Find the function bound to a key given the current modifier.
   * Falls back to the unmodified (0) function if no modified version exists.
   */
  findFunction(keyCode, currentModifier, isProgramming) {
    const keyFunctions = this.functions[keyCode];
    let fn = null;

    if (keyFunctions) {
      fn = keyFunctions[currentModifier];
      if (!fn) {
        fn = keyFunctions[0];
        if (fn) {
          // Will need to reset modifier since we fell back to base
          fn._fellBackToBase = true;
        }
      }
    }

    if (isProgramming && fn && fn.no_pgrm) {
      fn = null;
    }

    return fn;
  }

  /**
   * Dispatch a key press in interactive mode.
   * Looks up the function, executes it, and manages modifier state.
   */
  dispatchCommon(keyCode, machine) {
    let handled = true;

    if (
      this.handleModifier(keyCode, machine.modifier, (mod) =>
        machine.set_modifier(mod),
      )
    ) {
      return handled;
    }

    let fn = this.findFunction(keyCode, machine.modifier, false);
    if (!fn) {
      fn = function () {};
      handled = false;
    }

    let shouldResetModifier = true;
    let shouldResetFinCalc = true;

    if (fn.dont_rst_do_fincalc) shouldResetFinCalc = false;
    if (fn.dont_rst_modifier) shouldResetModifier = false;

    fn();

    if (shouldResetModifier) {
      machine.rst_modifier(shouldResetFinCalc);
    }

    return handled;
  }

  /**
   * Main dispatch entry point.
   * Routes key presses based on current calculator mode.
   */
  dispatch(keyCode, machine, keyboard, pgrm, debug) {
    if (keyCode === 99) {
      debug.show_memory();
      return;
    }

    if (keyboard.enabled() && machine.error_in_display) {
      machine.reset_error();
      return;
    }

    if (!keyboard.enabled()) {
      return;
    }

    if (machine.program_mode === C.MODE_PROGRAMMING) {
      pgrm.type(keyCode);
      return;
    }

    if (machine.program_mode >= C.MODE_RUNNING) {
      pgrm.stop();
      return;
    }

    this.dispatchCommon(keyCode, machine);
  }
}
