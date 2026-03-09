import * as C from "./constants.js";
import { zeroPad } from "./utils.js";

/** @returns {object} Global calculator state */
function getState() {
  return window._calculatorState;
}

/**
 * Encode a key code as a fixed-width string for program memory.
 */
function encodeKey(keyCode, isAddress) {
  if (isAddress) {
    return zeroPad(keyCode.toFixed(0), C.RAM_ADDR_SIZE);
  }
  return zeroPad(keyCode.toFixed(0), C.INSTRUCTION_SIZE);
}

/**
 * Expand a compound opcode into its constituent parts.
 * E.g., modifier*100 + key -> [modifier, key]
 */
function expandOpcode(opcode) {
  const parts = [];
  if (opcode >= C.INSTRUCTION_MAX) {
    const prefix = expandOpcode(Math.floor(opcode / 100));
    parts.push(...prefix);
  }
  parts.push(opcode % C.INSTRUCTION_MAX);
  return parts;
}

/**
 * Encode a modifier value as a dotted string prefix.
 */
function encodeModifier(modifier) {
  if (modifier <= 0) return "";
  let result = "";
  const parts = expandOpcode(modifier);
  for (const part of parts) {
    result += encodeKey(part, false) + ".";
  }
  return result;
}

/**
 * Encode a full instruction (modifier + key) for program storage.
 */
function encodeInstruction(modifier, keyCode, isAddress) {
  return encodeModifier(modifier) + encodeKey(keyCode, isAddress);
}

/**
 * Check if an opcode array matches a reference opcode pattern.
 */
function opcodeMatches(opcodeArray, referenceOpcode, matchLength) {
  const refParts = expandOpcode(referenceOpcode);
  for (let i = 0; i < matchLength; ++i) {
    if (opcodeArray[i] !== refParts[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Program controller for the zCalc's keystroke programming mode.
 * Handles program entry, execution, and step-through.
 */
export class ProgramController {
  constructor() {
    this.executionDelay = 100;

    // Special instructions that need custom execution handling
    this.execSpecialHandlers = {};
    this.execSpecialHandlers[C.GTO] = {
      opcodeLength: 3,
      variableArgs: 1,
      handler: this.executeGoto,
    };
    this.execSpecialHandlers[C.KEY_RS] = {
      opcodeLength: 1,
      variableArgs: 0,
      handler: this.executeRunStop,
    };

    // Special key combinations during program entry
    this.typeSpecialHandlers = {};
    this.typeSpecialHandlers[C.KEY_FF * 100 + C.KEY_RS] =
      this.typeExitProgramMode;
    this.typeSpecialHandlers[C.KEY_SST] = this.typeStepForward;
    this.typeSpecialHandlers[C.KEY_GG * 100 + C.KEY_SST] =
      this.typeStepBackward;
    this.typeSpecialHandlers[C.KEY_BACKSPACE] = this.typeStepBackward;
    this.typeSpecialHandlers[C.KEY_FF * 100 + C.KEY_RDOWN] =
      this.typeClearProgram;
    this.typeSpecialHandlers[C.GTO * 100 + C.KEY_DECIMAL] =
      this.typeGotoMoveBegin;
    this.typeSpecialHandlers[C.KEY_GG * 100 + C.KEY_RDOWN] = this.typeGotoBegin;
    this.typeSpecialHandlers[C.KEY_GG * 100 + 9] = this.typeMemInfo;

    for (let digit = 0; digit <= 9; ++digit) {
      this.typeSpecialHandlers[C.GTO_MOVE * 100 + digit] =
        this.typeGotoMoveDigit;
      this.typeSpecialHandlers[C.GTO * 100 + digit] = this.typeGotoDigit;
    }
  }

  /**
   * Store an instruction at the current program position.
   */
  storeInstruction(modifier, keyCode, isAddress) {
    const machine = getState().machine;
    if (machine.ip + 1 >= C.RAM_MAX) {
      machine.display_error(C.ERROR_IP);
      return;
    }
    ++machine.ip;
    machine.ram[machine.ip] = encodeInstruction(modifier, keyCode, isAddress);
  }

  // Alias used by dispatcher
  p_poke(modifier, keyCode, isAddress) {
    this.storeInstruction(modifier, keyCode, isAddress);
  }

  /**
   * Schedule the next program step execution.
   */
  scheduleNextStep() {
    const machine = getState().machine;
    if (machine.program_mode >= C.MODE_RUNNING) {
      machine.display_pgrm();
      setTimeout(() => this.executeStep(), this.executionDelay);
    }
  }

  // Alias
  p_sched() {
    this.scheduleNextStep();
  }

  /**
   * Execute a GTO instruction.
   */
  executeGoto(opcodeArray) {
    const machine = getState().machine;
    machine.ip = opcodeArray[2];
    machine.rst_modifier(1);
  }

  // Alias
  p_exec_gto(opcodeArray) {
    this.executeGoto(opcodeArray);
  }

  /**
   * Execute a R/S (run/stop) instruction.
   */
  executeRunStop(opcodeArray) {
    const machine = getState().machine;
    ++machine.ip;
    this.stop();
    machine.rst_modifier(1);
  }

  // Alias
  p_exec_rs(opcodeArray) {
    this.executeRunStop(opcodeArray);
  }

  /**
   * Check if the current instruction matches a special handler.
   */
  handleSpecialExecution(opcodeArray) {
    let handler = null;

    for (const key in this.execSpecialHandlers) {
      if (typeof key === "object") continue;
      const spec = this.execSpecialHandlers[key];
      if (spec.opcodeLength !== opcodeArray.length) continue;
      if (
        !opcodeMatches(opcodeArray, key, spec.opcodeLength - spec.variableArgs)
      )
        continue;
      handler = spec.handler;
      break;
    }

    if (handler) {
      handler.call(this, opcodeArray);
    }
    return !!handler;
  }

  // Alias
  p_exec_handle_special(opcodeArray) {
    return this.handleSpecialExecution(opcodeArray);
  }

  /**
   * Execute one program step.
   */
  executeStep() {
    const machine = getState().machine;
    const keyboard = getState().keyboard;
    const dispatcher = getState().dispatcher;

    if (machine.program_mode < C.MODE_RUNNING) return;

    if (!keyboard.enabled()) {
      this.scheduleNextStep();
      return;
    }

    if (machine.ip <= 0) {
      machine.ip = 1;
      machine.display_pgrm();
    }

    // Parse the instruction
    const instruction = machine.ram[machine.ip];
    const parts = instruction.split(".");
    for (let i = 0; i < parts.length; ++i) {
      parts[i] = parseInt(parts[i], 10);
    }

    // Try special instruction handling first
    if (!this.handleSpecialExecution(parts)) {
      // Execute as regular key presses
      for (let i = 0; i < parts.length; ++i) {
        if (!dispatcher.dispatchCommon(parts[i], machine)) {
          console.log("Invalid opcode for exec: " + instruction);
        }
      }
      if (machine.program_mode >= C.MODE_RUNNING || !machine.error_in_display) {
        ++machine.ip;
      }
    }

    // Handle program wrap-around and stop conditions
    if (machine.ip > C.RAM_MAX - 1) {
      machine.ip = 0;
    }

    if (machine.ip <= 0) {
      this.stop();
    } else if (machine.program_mode === C.MODE_RUNNING_STEP) {
      machine.program_mode = C.MODE_INTERACTIVE;
      machine.display_pgrm();
    } else if (machine.program_mode === C.MODE_RUNNING) {
      this.scheduleNextStep();
    }
  }

  // Alias
  p_execute() {
    this.executeStep();
  }

  /**
   * Run program in single-step mode.
   */
  runStep() {
    const machine = getState().machine;
    machine.program_mode = C.MODE_RUNNING_STEP;
    if (machine.ip <= 0) machine.ip = 1;
    machine.display_pgrm();
    this.scheduleNextStep();
  }

  // Alias
  p_run_step() {
    this.runStep();
  }

  /**
   * Run program continuously.
   */
  run() {
    const machine = getState().machine;
    machine.program_mode = C.MODE_RUNNING;
    if (machine.ip <= 0) machine.ip = 1;
    machine.display_pgrm();
    this.scheduleNextStep();
  }

  // Alias
  p_run() {
    this.run();
  }

  /**
   * R/S key handler - toggle between run and stop.
   */
  rs() {
    const machine = getState().machine;
    if (machine.program_mode === C.MODE_INTERACTIVE) {
      machine.display_result();
      this.run();
    } else {
      this.stop();
    }
    machine.rst_modifier(1);
  }

  /**
   * Stop program execution.
   */
  stop() {
    const machine = getState().machine;
    machine.program_mode = C.MODE_INTERACTIVE;
    machine.display_pgrm();
    if (!machine.error_in_display) {
      machine.display_result();
    }
  }

  /**
   * SST key handler - single step.
   */
  sst() {
    const machine = getState().machine;
    if (machine.program_mode === C.MODE_INTERACTIVE) {
      this.runStep();
    }
    machine.rst_modifier(1);
  }

  /**
   * BST key handler - back step.
   */
  bst() {
    const machine = getState().machine;
    if (machine.ip > 0) --machine.ip;
    machine.display_program_opcode();
    machine.cli();
    setTimeout(() => machine.prog_bst_after(), this.executionDelay);
    machine.rst_modifier(1);
  }

  // --- Program Entry Special Handlers ---

  typeExitProgramMode() {
    const machine = getState().machine;
    machine.rst_modifier(1);
    machine.program_mode = C.MODE_INTERACTIVE;
    machine.ip = 0;
    machine.display_pgrm();
    machine.display_modifier();
    machine.display_result();
  }

  // Alias
  p_type_pr() {
    this.typeExitProgramMode();
  }

  typeMemInfo() {
    const machine = getState().machine;
    machine.rst_modifier(1);
    machine.mem_info();
  }

  // Alias
  p_type_mem_info() {
    this.typeMemInfo();
  }

  typeStepForward() {
    const machine = getState().machine;
    if (++machine.ip >= C.RAM_MAX) machine.ip = 0;
    machine.rst_modifier(1);
    machine.display_program_opcode();
  }

  // Alias
  p_type_sst() {
    this.typeStepForward();
  }

  typeStepBackward() {
    const machine = getState().machine;
    if (--machine.ip < 0) machine.ip = C.RAM_MAX - 1;
    machine.rst_modifier(1);
    machine.display_program_opcode();
  }

  // Alias
  p_type_bst() {
    this.typeStepBackward();
  }

  typeClearProgram() {
    const machine = getState().machine;
    machine.clear_prog(1);
    machine.rst_modifier(1);
    machine.display_program_opcode();
  }

  // Alias
  p_type_clear_pgrm() {
    this.typeClearProgram();
  }

  typeGotoMoveDigit(digit) {
    const machine = getState().machine;
    machine.gtoxx = "" + machine.gtoxx + digit.toFixed(0);
    if (machine.gtoxx.length >= C.RAM_ADDR_SIZE) {
      const address = parseInt(machine.gtoxx, 10);
      machine.gtoxx = "";
      machine.rst_modifier(1);
      if (address >= C.RAM_MAX) {
        machine.display_error(C.ERROR_IP);
        return;
      }
      machine.ip = address;
    }
    machine.display_program_opcode();
  }

  // Alias
  p_type_gto_move_n(digit) {
    this.typeGotoMoveDigit(digit);
  }

  typeGotoDigit(digit) {
    const machine = getState().machine;
    machine.gtoxx = "" + machine.gtoxx + digit.toFixed(0);
    if (machine.gtoxx.length >= C.RAM_ADDR_SIZE) {
      const address = parseInt(machine.gtoxx, 10);
      machine.gtoxx = "";
      machine.rst_modifier(1);
      if (address >= C.RAM_MAX) {
        machine.display_error(C.ERROR_IP);
        return;
      }
      this.storeInstruction(C.GTO, address, true);
    }
    machine.display_program_opcode();
  }

  // Alias
  p_type_gto_n(digit) {
    this.typeGotoDigit(digit);
  }

  typeGotoMoveBegin() {
    const machine = getState().machine;
    machine.set_modifier(C.GTO_MOVE, 1);
    machine.display_program_opcode();
  }

  // Alias
  p_type_gto_move_begin() {
    this.typeGotoMoveBegin();
  }

  typeGotoBegin() {
    const machine = getState().machine;
    machine.set_modifier(C.GTO, 1);
    machine.gtoxx = "";
    machine.display_program_opcode();
    return true;
  }

  // Alias
  p_type_gto_begin() {
    return this.typeGotoBegin();
  }

  /**
   * Handle special key combinations during program entry mode.
   */
  handleSpecialType(keyCode) {
    const machine = getState().machine;
    const combinedCode = machine.modifier * 100 + keyCode;
    const handler = this.typeSpecialHandlers[combinedCode];
    if (handler) {
      handler.call(this, keyCode);
      return true;
    }
    return false;
  }

  // Alias
  p_type_handle_special(keyCode) {
    return this.handleSpecialType(keyCode);
  }

  /**
   * Handle a key press in program entry mode.
   */
  type(keyCode) {
    const machine = getState().machine;
    const dispatcher = getState().dispatcher;

    if (this.handleSpecialType(keyCode)) return;

    if (
      !dispatcher.handleModifier(keyCode, machine.modifier, (mod) =>
        machine.set_modifier(mod),
      )
    ) {
      const fn = dispatcher.findFunction(keyCode, machine.modifier, true);
      if (!fn) {
        console.log("pgrm typing: no handler for " + keyCode);
        machine.display_program_opcode();
        machine.rst_modifier(1);
        return;
      }
      this.storeInstruction(machine.modifier, keyCode, false);
      machine.rst_modifier(1);
    }
    machine.display_program_opcode();
  }
}
