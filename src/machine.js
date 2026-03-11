import * as C from "./constants.js";
import {
  isBadNumber,
  sign,
  roundToDecimals,
  zeroPad,
  arithmeticRound,
  floatEquals10,
} from "./utils.js";
import {
  parseDate,
  addDays,
  dateDiffActual,
  dateDiff30_360,
  dateToNumber,
  dateToDisplayString,
} from "./date-utils.js";
import {
  factorial,
  toRadians,
  fromRadians,
  degreesToRadians,
  radiansToDegrees,
  decimalToHms,
  hmsToDecimal,
  toPolar,
  toRectangular,
  permutations as mathPermutations,
  combinations as mathCombinations,
  sinh,
  cosh,
  tanh,
  asinh,
  acosh,
  atanh,
} from "./math-functions.js";
import {
  calculateNPV,
  calculateIRR,
  solveTVM,
  calculateBondPrice,
  calculateBondYield,
  depreciationStraightLine,
  depreciationSOYD,
  depreciationDecliningBalance,
  calculateAmortization,
} from "./financial.js";
import {
  accumulateStatistics,
  calculateMean,
  calculateWeightedMean,
  calculateStdDev,
  regressionEstimate,
  linearRegression,
} from "./statistics.js";

/** @returns {object} Global calculator state */
function getState() {
  return window._calculatorState;
}

/**
 * zCalc Calculator State Machine.
 * Manages the RPN stack, memory registers, and all calculator operations.
 */
export class Machine {
  constructor() {
    // RPN stack registers
    this.x = 0; // X register (display/bottom of stack)
    this.y = 0; // Y register
    this.z = 0; // Z register
    this.w = 0; // T register (top of stack, "w" in original)
    this.last_x = 0; // Last X register

    // Algebraic mode state
    this.alg_op = 0;
    this.ALG_PLUS = 1;
    this.ALG_MINUS = 2;
    this.ALG_MULTIPLY = 3;
    this.ALG_DIVIDE = 4;
    this.ALG_POWER = 5;

    // Memory
    this.stomemory = []; // Storage registers (R0-R19)
    this.finmemory = []; // Financial registers [n, i, PV, PMT, FV]
    this.njmemory = []; // Cash flow count registers (Nj)
    this.index = 0; // Index register (11c)
    this.ram = []; // Program memory
    this.program_size = 1; // Program size (11c)
    this.flags = [0, 0]; // User flags

    // Display settings
    this.decimals = 2;
    this.comma = 0; // 0 = dot decimal, 1 = comma decimal
    this.notation = C.NOTATION_FIX;

    // Calculator modes
    this.begin = 0; // 0 = END mode, 1 = BEGIN mode
    this.dmy = 0; // 0 = M.DY, 1 = D.MY
    this.compoundf = 0; // Compound interest flag
    this.trigo = C.TRIGO_DEG;
    this.user = 0;
    this.algmode = 0; // 0 = RPN, 1 = algebraic

    // Program execution state
    this.program_mode = C.MODE_INTERACTIVE;
    this.ip = 0; // Instruction pointer
    this.call_stack = [];

    // Input state
    this.pushed = 0; // Whether stack was pushed (prevents double push)
    this.gtoxx = ""; // GTO address buffer
    this.modifier = 0; // Current modifier key state
    this.do_fincalc = 0; // Financial calc pending flag
    this.xmode = -1; // Input mode: -1=not typing, 0=integer, 1=decimal, 100=exponent
    this.typed_mantissa = "";
    this.typed_decimals = "";
    this.typed_mantissa_signal = 1;
    this.typed_exponent = "00";
    this.typed_exponent_signal = 1;
    this.error_in_display = 0;

    // Persistence field lists
    this.nvname = C.TYPE_COOKIE;
    this.nvN = [
      "x",
      "y",
      "z",
      "w",
      "last_x",
      "alg_op",
      "algmode",
      "decimals",
      "comma",
      "begin",
      "dmy",
      "compoundf",
      "notation",
    ];
    this.nvAN = ["stomemory", "finmemory", "njmemory"];
    this.nvAX = ["ram"];
  }

  // --- Program Memory ---

  program_limit() {
    return C.RAM_MAX - 1;
  }

  ram_available() {
    return C.RAM_MAX - 1;
  }

  incr_ip(skip) {
    this.ip += skip;
    if (this.ip < 0 || this.ip > this.program_limit()) {
      this.ip = 0;
    }
  }

  // --- Initialization & Clearing ---

  init() {
    this.clear_prog(1);
    this.clear_reg();
    this.clear_stack();
    this.error_in_display = 0;
  }

  clear_fin() {
    for (let i = 0; i < 5; ++i) {
      this.finmemory[i] = 0;
    }
    this.display_result();
  }

  clear_statistics() {
    for (let i = C.STAT_MIN; i <= C.STAT_MAX; ++i) {
      this.stomemory[i] = 0;
    }
    this.x = this.y = this.z = this.w = 0;
    this.display_result();
  }

  clear_prog(initialize) {
    if (initialize) {
      this.ram[0] = "";
      for (let i = 1; i < C.RAM_MAX; ++i) {
        this.ram[i] = C.STOP_INSTRUCTION;
      }
      this.program_size = 1;
    } else {
      this.display_result();
    }
    this.ip = 0;
  }

  clear_sto() {
    for (let i = 0; i < C.MEM_MAX; ++i) {
      this.stomemory[i] = 0;
      this.njmemory[i] = 1;
    }
  }

  cli() {
    getState().keyboard.disable();
  }

  sti() {
    getState().keyboard.enable();
  }

  clear_typing() {
    this.xmode = -1;
    this.typed_mantissa = "";
    this.typed_decimals = "";
    this.typed_mantissa_signal = 1;
    this.typed_exponent = "00";
    this.typed_exponent_signal = 1;
  }

  clear_stack() {
    this.last_x = this.x = this.y = this.z = this.w = 0;
  }

  clear_reg() {
    this.clear_stack();
    this.alg_op = 0;
    this.index = 0;
    this.clear_fin();
    this.clear_sto();
    this.display_result();
  }

  // --- Display Helpers ---

  display_result() {
    this.pushed = 0;
    this.clear_typing();
    getState().display.displayNumber(
      this.x,
      this.decimals,
      this.notation,
      this.comma,
      () => this.cli(),
      () => this.sti(),
    );
  }

  display_all() {
    getState().display.displayNumber(
      this.x,
      this.decimals,
      this.notation,
      this.comma,
      () => this.cli(),
      () => this.sti(),
    );
    this.display_modifier();
    this.display_begin();
    this.display_dmyc();
    this.display_pgrm();
    this.display_algmode();
    this.display_trigo();
    this.display_user();
  }

  display_result_date(date) {
    this.clear_typing();
    getState().display.show(dateToDisplayString(date, this.dmy));
  }

  display_pgrm() {
    getState().display.showProgramMode(
      this.program_mode === C.MODE_PROGRAMMING,
      this.program_mode >= C.MODE_RUNNING,
      this.ip,
    );
  }

  display_trigo() {
    getState().display.showTrigoMode(this.trigo);
  }

  display_user() {
    getState().display.showUserMode(this.user);
  }

  display_algmode() {
    getState().display.showAlgebraicMode(this.algmode);
  }

  display_error(errorCode) {
    getState().display.showError(errorCode);
    this.clear_typing();
    this.error_in_display = 1;
    if (this.program_mode >= C.MODE_RUNNING) {
      getState().pgrm.stop();
    }
  }

  reset_error() {
    this.error_in_display = 0;
    if (this.program_mode === C.MODE_INTERACTIVE) {
      this.display_result();
    } else if (this.program_mode === C.MODE_PROGRAMMING) {
      this.display_program_opcode();
    }
  }

  display_modifier2(mod) {
    getState().display.showModifier(mod);
  }

  display_modifier() {
    this.display_modifier2(this.modifier);
  }

  display_begin() {
    getState().display.showBegin(this.begin);
  }

  display_dmyc() {
    getState().display.showDmyAndCompound(this.dmy, this.compoundf);
  }

  display_program_opcode() {
    const text =
      zeroPad(this.ip.toFixed(0), C.RAM_ADDR_SIZE) + "-" + this.ram[this.ip];
    getState().display.show(text);
  }

  // --- Mode Setters ---

  set_dmy(value) {
    this.dmy = value;
    this.display_dmyc();
    this.display_result();
  }

  set_trigo(value) {
    this.trigo = value;
    this.display_trigo();
    this.display_result();
  }

  rpn_mode() {
    this.algmode = 0;
    this.alg_op = 0;
    this.display_algmode();
    this.display_result();
  }

  algebraic_mode() {
    this.algmode = 1;
    this.alg_op = 0;
    this.display_algmode();
    this.display_result();
  }

  toggle_compoundf() {
    this.compoundf = this.compoundf ? 0 : 1;
    this.display_dmyc();
    this.display_result();
  }

  toggle_user() {
    this.user = this.user ? 0 : 1;
    this.display_user();
    if (this.program_mode === C.MODE_INTERACTIVE) {
      this.display_result();
    }
  }

  set_begin(value) {
    this.begin = value;
    this.display_begin();
    this.display_result();
  }

  set_modifier(value) {
    this.modifier = value;
    if (value === C.GTO || value === C.GTO_MOVE) {
      this.gto_buf_clear();
    }
    this.display_modifier();
  }

  set_decimals(places, notationType) {
    this.notation = notationType;
    this.decimals = places;
    this.display_result();
  }

  set_decimals_exponential() {
    this.notation = C.NOTATION_SCI;
    this.decimals = 10;
    this.display_result();
  }

  rst_modifier(resetFinCalc) {
    if (resetFinCalc) {
      this.do_fincalc = 0;
    }
    this.modifier = 0;
    this.display_modifier();
  }

  // --- Stack Operations ---

  push() {
    this.w = this.z;
    this.z = this.y;
    this.y = this.x;
    this.pushed = 1;
  }

  pop() {
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
  }

  save_lastx() {
    if (!this.algmode) {
      this.last_x = this.x;
    }
  }

  lstx() {
    this.push();
    this.x = this.last_x;
    this.display_result();
  }

  shv() {
    this.push();
    this.x = C.SVE;
    this.display_result();
  }

  apocryphal(value) {
    this.push();
    this.x = 140 + value;
    this.display_result();
  }

  r_down() {
    const temp = this.x;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = temp;
    this.display_result();
  }

  r_up() {
    const temp = this.x;
    this.x = this.w;
    this.w = this.z;
    this.z = this.y;
    this.y = temp;
    this.display_result();
  }

  x_exchange_y() {
    const temp = this.x;
    this.x = this.y;
    this.y = temp;
    this.display_result();
  }

  clx() {
    this.x = 0;
    this.display_result();
    this.pushed = 1;
  }

  enter(algParam) {
    if (this.algmode && this.alg_op) {
      this.alg_resolve();
    } else if (!this.algmode || !algParam) {
      this.push();
      this.display_result();
      this.pushed = 1;
    } else {
      this.display_result();
    }
  }

  // --- Number Input ---

  digit_add(digit) {
    if (this.xmode === -1) {
      if (!this.pushed) this.push();
      this.clear_typing();
      this.typed_mantissa = "" + digit;
      this.xmode = 0;
    } else if (this.xmode === 0) {
      if (this.typed_mantissa.length < getState().display.displayDigitCount) {
        this.typed_mantissa += "" + digit;
      }
    } else if (this.xmode === 1) {
      if (
        this.typed_mantissa.length + this.typed_decimals.length <
        getState().display.displayDigitCount
      ) {
        this.typed_decimals += "" + digit;
      }
    } else if (this.xmode === 100) {
      this.typed_exponent = this.typed_exponent.substring(1, 2) + digit;
    }
    this.display_typing();
  }

  display_typing() {
    this.x =
      this.typed_mantissa_signal *
      parseFloat(this.typed_mantissa + "." + this.typed_decimals + "0") *
      Math.pow(
        10,
        parseInt("0" + this.typed_exponent, 10) * this.typed_exponent_signal,
      );

    getState().display.displayTypedNumber(
      this.typed_mantissa_signal,
      this.typed_mantissa,
      this.typed_decimals,
      this.typed_exponent,
      this.typed_exponent_signal,
      this.xmode,
      this.comma,
    );
  }

  digit_delete() {
    if (this.xmode === -1) {
      return;
    }
    if (this.xmode === 0) {
      const len = this.typed_mantissa.length - 1;
      if (len >= 0) {
        this.typed_mantissa = this.typed_mantissa.substring(0, len);
      }
    } else if (this.xmode === 1) {
      const len = this.typed_decimals.length - 1;
      if (len < 0) {
        this.xmode = 0;
      } else {
        this.typed_decimals = this.typed_decimals.substring(0, len);
      }
    } else if (this.xmode === 100) {
      this.typed_exponent = "";
      this.xmode = this.typed_decimals.length > 0 ? 1 : 0;
    }
    this.display_typing();
  }

  input_exponential() {
    if (this.xmode === -1) {
      if (!this.pushed) this.push();
      this.clear_typing();
      this.typed_mantissa = "1";
    } else if (this.xmode !== 100) {
      if (
        this.typed_mantissa.length >
        getState().display.displayDigitCount - 3
      ) {
        return;
      }
      if (parseInt("0" + this.typed_mantissa, 10) === 0) {
        this.typed_mantissa = "0";
        const decVal = parseInt("0" + this.typed_decimals, 10);
        if (decVal === 0) {
          this.typed_mantissa = "1";
        } else {
          const decStr = decVal.toFixed(0);
          const leadingZeros = this.typed_decimals.length - decStr.length;
          const maxLeadingZeros = Math.max(0, leadingZeros);
          if (
            this.typed_mantissa.length + maxLeadingZeros >=
            getState().display.displayDigitCount - 3
          ) {
            return;
          }
        }
      }
    }
    this.xmode = 100;
    this.display_typing();
  }

  decimal_point_mode() {
    if (this.xmode === -1) {
      if (!this.pushed) this.push();
      this.clear_typing();
    }
    if (this.typed_mantissa.length <= 0) {
      this.typed_mantissa = "0";
    }
    this.xmode = 1;
    this.display_typing();
  }

  chs() {
    if (this.xmode === -1) {
      this.x = -this.x;
      this.display_result();
      return;
    }
    if (this.xmode === 100) {
      this.typed_exponent_signal *= -1;
    } else {
      this.typed_mantissa_signal *= -1;
    }
    this.display_typing();
  }

  // --- Arithmetic ---

  arithmetic(result, operand1, operand2) {
    this.save_lastx();
    this.pop();
    this.x = arithmeticRound(result, operand1, operand2);
    this.display_result();
  }

  alg_resolve() {
    let success = 1;
    if (!this.algmode || this.alg_op <= 0) {
      return success;
    }

    let result;
    if (this.alg_op === this.ALG_PLUS) {
      this.arithmetic(this.y + this.x, this.x, this.y);
    } else if (this.alg_op === this.ALG_MINUS) {
      this.arithmetic(this.y - this.x, this.x, this.y);
    } else if (this.alg_op === this.ALG_MULTIPLY) {
      this.arithmetic(this.y * this.x, 0, 0);
    } else if (this.alg_op === this.ALG_DIVIDE) {
      result = this.y / this.x;
      if (isBadNumber(result)) {
        this.display_error(C.ERROR_DIVZERO);
        success = 0;
      } else {
        this.arithmetic(result, 0, 0);
      }
    } else if (this.alg_op === this.ALG_POWER) {
      result = Math.pow(this.y, this.x);
      if (isBadNumber(result)) {
        this.display_error(C.ERROR_DIVZERO);
        success = 0;
      } else {
        this.arithmetic(result, 0, 0);
      }
    }

    this.alg_op = 0;
    return success;
  }

  /** Helper for algebraic mode arithmetic */
  _algArithmetic(algOp, rpnCalc) {
    if (this.algmode) {
      if (!this.alg_resolve()) return;
      this.alg_op = algOp;
      this.push();
      this.display_result();
    } else {
      rpnCalc();
    }
  }

  plus() {
    this._algArithmetic(this.ALG_PLUS, () => {
      this.arithmetic(this.y + this.x, this.x, this.y);
    });
  }

  minus() {
    this._algArithmetic(this.ALG_MINUS, () => {
      this.arithmetic(this.y - this.x, this.x, this.y);
    });
  }

  multiply() {
    this._algArithmetic(this.ALG_MULTIPLY, () => {
      this.arithmetic(this.y * this.x, 0, 0);
    });
  }

  divide() {
    this._algArithmetic(this.ALG_DIVIDE, () => {
      const result = this.y / this.x;
      if (isBadNumber(result)) {
        this.display_error(C.ERROR_DIVZERO);
      } else {
        this.arithmetic(result, 0, 0);
      }
    });
  }

  poweryx() {
    this._algArithmetic(this.ALG_POWER, () => {
      const result = Math.pow(this.y, this.x);
      if (isBadNumber(result)) {
        this.display_error(C.ERROR_DIVZERO);
      } else {
        this.arithmetic(result, 0, 0);
      }
    });
  }

  // --- Unary Math Operations ---

  _unaryOp(fn) {
    const result = fn(this.x);
    if (isBadNumber(result)) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = result;
      this.display_result();
    }
  }

  reciprocal() {
    this._unaryOp((x) => 1 / x);
  }
  square() {
    this._unaryOp((x) => Math.pow(x, 2));
  }
  sqroot() {
    this._unaryOp((x) => Math.pow(x, 0.5));
  }
  exp() {
    this._unaryOp((x) => Math.exp(x));
  }
  ln() {
    this._unaryOp((x) => Math.log(x));
  }
  log10() {
    this._unaryOp((x) => Math.log(x) / Math.log(10));
  }
  power10() {
    this._unaryOp((x) => Math.pow(10, x));
  }

  intg() {
    this.save_lastx();
    this.x = Math.floor(Math.abs(this.x)) * sign(this.x);
    this.display_result();
  }

  frac() {
    this.save_lastx();
    this.x = (Math.abs(this.x) - Math.floor(Math.abs(this.x))) * sign(this.x);
    this.display_result();
  }

  abs() {
    this.save_lastx();
    this.x = Math.abs(this.x);
    this.display_result();
  }

  // --- Trigonometry ---

  trig(funcName) {
    const result = Math[funcName](toRadians(this.x, this.trigo));
    if (isBadNumber(result)) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = result;
      this.display_result();
    }
  }

  triginv(funcName) {
    const result = Math[funcName](this.x);
    if (isBadNumber(result)) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = fromRadians(result, this.trigo);
      this.display_result();
    }
  }

  htrig(funcName) {
    const hypFuncs = { sinh, cosh, tanh };
    this._unaryOp((x) => hypFuncs[funcName](x));
  }

  htriginv(funcName) {
    const hypInvFuncs = { asinh, acosh, atanh };
    this._unaryOp((x) => hypInvFuncs[funcName](x));
  }

  to_radians() {
    this.save_lastx();
    this.x = degreesToRadians(this.x);
    this.display_result();
  }

  to_degrees() {
    this.save_lastx();
    this.x = radiansToDegrees(this.x);
    this.display_result();
  }

  to_hms() {
    this.save_lastx();
    this.x = decimalToHms(this.x);
    this.display_result();
  }

  to_hour() {
    this.save_lastx();
    this.x = hmsToDecimal(this.x);
    this.display_result();
  }

  pi() {
    this.push();
    this.x = Math.PI;
    this.display_result();
  }

  random() {
    this.push();
    this.x = Math.random();
    this.display_result();
  }

  random_sto() {
    this.display_result();
  }

  rnd() {
    this.save_lastx();
    this.x = roundToDecimals(this.x, this.decimals);
    this.display_result();
  }

  polar() {
    const result = toPolar(this.x, this.y);
    if (isBadNumber(result[0]) || isBadNumber(result[1])) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = result[0];
      this.y = fromRadians(result[1], this.trigo);
      this.display_result();
    }
  }

  orthogonal() {
    const angleRad = toRadians(this.y, this.trigo);
    const result = toRectangular(this.x, angleRad);
    if (isBadNumber(result[0]) || isBadNumber(result[1])) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = result[0];
      this.y = result[1];
      this.display_result();
    }
  }

  // --- Percent Operations ---

  percent() {
    const result = (this.y * this.x) / 100;
    if (isBadNumber(result)) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = result;
      this.display_result();
    }
  }

  percentT() {
    if (!this.alg_resolve()) return;
    const result = (100 * this.x) / this.y;
    if (isBadNumber(result)) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = result;
      this.display_result();
    }
  }

  deltapercent() {
    if (!this.alg_resolve()) return;
    const result = 100 * (this.x / this.y) - 100;
    if (isBadNumber(result)) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      this.x = result;
      this.display_result();
    }
  }

  // --- Factorial ---

  fatorial() {
    if (this.x < 0 || this.x !== Math.floor(this.x)) {
      this.display_error(C.ERROR_DIVZERO);
      return;
    }
    if (this.x > 69.95) {
      this.save_lastx();
      this.x = C.VALUE_MAX;
      this.display_result();
      return;
    }
    const result = factorial(this.x);
    if (isBadNumber(result)) {
      this.display_error(C.ERROR_DIVZERO);
      return;
    }
    this.save_lastx();
    this.x = result;
    this.display_result();
  }

  permutations() {
    if (
      this.x < 0 ||
      this.x !== Math.floor(this.x) ||
      this.x > 80 ||
      this.y < 0 ||
      this.y !== Math.floor(this.y) ||
      this.y > 80 ||
      this.y < this.x
    ) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      const result = mathPermutations(this.y, this.x);
      if (isBadNumber(result)) {
        this.display_error(C.ERROR_DIVZERO);
        return;
      }
      this.pop();
      this.x = result;
      this.display_result();
    }
  }

  combinations() {
    if (
      this.x < 0 ||
      this.x !== Math.floor(this.x) ||
      this.x > 80 ||
      this.y < 0 ||
      this.y !== Math.floor(this.y) ||
      this.y > 80 ||
      this.y < this.x
    ) {
      this.display_error(C.ERROR_DIVZERO);
    } else {
      this.save_lastx();
      const result = mathCombinations(this.y, this.x);
      if (isBadNumber(result)) {
        this.display_error(C.ERROR_DIVZERO);
        return;
      }
      this.pop();
      this.x = result;
      this.display_result();
    }
  }

  // --- Memory Operations ---

  sto(register) {
    this.stomemory[register] = this.x;
    this.display_result();
  }

  rcl(register) {
    this.push();
    this.x = this.stomemory[register];
    this.display_result();
  }

  stoinfix(register, operation) {
    let value = this.stomemory[register];
    if (operation === C.STO_PLUS) value += this.x;
    else if (operation === C.STO_MINUS) value -= this.x;
    else if (operation === C.STO_TIMES) value *= this.x;
    else if (operation === C.STO_DIVIDE) {
      value /= this.x;
      if (isBadNumber(value)) {
        this.display_error(C.ERROR_DIVZERO);
        return;
      }
    }
    if (Math.abs(value) > C.VALUE_MAX) {
      this.display_error(C.ERROR_OVERFLOW);
      return;
    }
    this.stomemory[register] = value;
    this.display_result();
  }

  stofin(register) {
    this.finmemory[register] = this.x;
    this.display_result();
    this.pushed = 1;
  }

  rclfin(register) {
    this.push();
    this.x = this.finmemory[register];
    this.display_result();
  }

  ston_12x() {
    const result = this.x * 12;
    if (Math.abs(result) > C.VALUE_MAX) {
      this.display_error(C.ERROR_OVERFLOW);
      return;
    }
    this.x = result;
    this.stofin(C.FIN_N);
  }

  stoi_12div() {
    this.x /= 12;
    this.stofin(C.FIN_I);
  }

  // --- Cash Flow Memory ---

  stoCF0() {
    this.stomemory[0] = this.x;
    this.finmemory[C.FIN_N] = 0;
    this.display_result();
  }

  stoCFj() {
    const n = this.finmemory[C.FIN_N];
    if (n !== Math.floor(n) || n < 0 || n >= C.MEM_MAX) {
      this.display_error(C.ERROR_MEMORY);
    } else {
      this.finmemory[C.FIN_N]++;
      this.stomemory[this.finmemory[C.FIN_N]] = this.x;
      this.njmemory[this.finmemory[C.FIN_N]] = 1;
      this.display_result();
    }
  }

  rclCFj() {
    const n = this.finmemory[C.FIN_N];
    if (n < 0 || n >= C.MEM_MAX || Math.floor(n) !== n) {
      this.display_error(C.ERROR_MEMORY);
    } else {
      this.push();
      this.x = this.stomemory[n];
      --this.finmemory[C.FIN_N];
      this.display_result();
    }
  }

  rclNj() {
    const n = this.finmemory[C.FIN_N];
    if (n < 0 || n >= C.MEM_MAX || Math.floor(n) !== n) {
      this.display_error(C.ERROR_MEMORY);
    } else {
      this.push();
      this.x = this.njmemory[n];
      this.display_result();
    }
  }

  stoNj() {
    const n = this.finmemory[C.FIN_N];
    if (
      n !== Math.floor(n) ||
      n < 0 ||
      n >= C.MEM_MAX ||
      this.x !== Math.floor(this.x) ||
      this.x <= 0
    ) {
      this.display_error(C.ERROR_MEMORY);
    } else {
      this.njmemory[n] = this.x;
      this.display_result();
    }
  }

  mem_info() {
    getState().display.displayMemoryInfo(
      this.ram_available(),
      this.stomemory.length,
    );
    this.error_in_display = 1;
  }

  // --- Index Register (11c) ---

  fix_index() {
    const idx = Math.floor(Math.abs(this.index));
    if (idx >= C.MEM_MAX) {
      this.display_error(C.ERROR_INDEX);
      return null;
    }
    return idx;
  }

  sto_index() {
    const idx = this.fix_index();
    if (idx === null) return;
    this.stomemory[idx] = this.x;
    this.display_result();
  }

  rcl_index() {
    const idx = this.fix_index();
    if (idx === null) return;
    this.push();
    this.x = this.stomemory[idx];
    this.display_result();
  }

  x_exchange_index() {
    const idx = this.fix_index();
    if (idx === null) return;
    const temp = this.x;
    this.x = this.stomemory[idx];
    this.stomemory[this.index] = temp;
    this.display_result();
  }

  x_exchange_index_itself() {
    const temp = this.x;
    this.x = this.index;
    this.index = temp;
    this.display_result();
  }

  get_index() {
    this.push();
    this.x = this.index;
    this.display_result();
  }

  set_index() {
    this.index = this.x;
    this.display_result();
  }

  // --- Flags ---

  sf(flag) {
    if (flag >= this.flags.length) {
      this.display_error(C.ERROR_FLAG);
      return;
    }
    this.flags[flag] = 1;
  }

  cf(flag) {
    if (flag >= this.flags.length) {
      this.display_error(C.ERROR_FLAG);
      return;
    }
    this.flags[flag] = 0;
  }

  f_question(flag) {
    if (flag >= this.flags.length) {
      this.display_error(C.ERROR_FLAG);
      return;
    }
    this.incr_ip(this.flags[flag] ? 0 : 1);
    this.display_result();
  }

  // --- ISG/DSE (11c) ---

  dissect_index() {
    const s = sign(this.index);
    let rounded = roundToDecimals(Math.abs(this.index), 5);
    let counter = Math.floor(rounded) * s;
    rounded -= s * counter;
    rounded *= 1000;
    let limit = Math.floor(rounded + 0.001);
    rounded = Math.max(0, rounded - limit);
    rounded *= 100;
    let step = Math.floor(rounded + 0.1);
    return [counter, limit, step];
  }

  update_index(counter, limit, step) {
    const s = sign(counter);
    counter = Math.abs(counter);
    this.index = s * (counter + limit / 1000 + step / 100000);
  }

  f_isg() {
    const parts = this.dissect_index();
    let counter = parts[0],
      limit = parts[1],
      step = parts[2];
    counter += step === 0 ? 1 : step;
    this.incr_ip(counter > limit ? 1 : 0);
    this.update_index(counter, limit, step);
  }

  f_dse() {
    const parts = this.dissect_index();
    let counter = parts[0],
      limit = parts[1],
      step = parts[2];
    counter -= step === 0 ? 1 : step;
    this.incr_ip(counter <= limit ? 1 : 0);
    this.update_index(counter, limit, step);
  }

  // --- Pause ---

  pse() {
    this.cli();
    setTimeout(() => {
      this.sti();
      this.display_result();
    }, 1000);
  }

  // --- Settings ---

  toggle_decimal_character() {
    this.comma = this.comma ? 0 : 1;
    this.display_result();
    getState().storage.save();
  }

  toggle_power() {
    const content = document.getElementById("pointer_div");
    if (!content) return;
    const isOff = content.style.display === "none";
    content.style.display = isOff ? "" : "none";
    if (isOff) {
      this.display_all();
    }
  }

  // --- Prefix Display ---

  clear_prefix() {
    let absVal = Math.abs(this.x);
    let magnitude = Math.log(absVal) / Math.log(10);
    if (isBadNumber(magnitude)) magnitude = 1;
    if (magnitude === Math.floor(magnitude)) magnitude += 0.1;
    absVal =
      absVal *
      Math.pow(10, getState().display.displayDigitCount - Math.ceil(magnitude));
    this.cli();
    getState().display.show(
      zeroPad(absVal.toFixed(0), getState().display.displayDigitCount),
    );
    setTimeout(() => {
      this.sti();
      this.display_result();
    }, 1000);
  }

  // --- Test/Comparison Operations ---

  test_x_le_y() {
    this.display_result();
    this.incr_ip(this.x <= this.y ? 0 : 1);
  }

  test_x_gt_y() {
    this.display_result();
    this.incr_ip(this.x > this.y ? 0 : 1);
  }

  test_x_eq_y() {
    this.display_result();
    this.incr_ip(floatEquals10(this.x, this.y) ? 0 : 1);
  }

  test_x_ne_y() {
    this.display_result();
    this.incr_ip(!floatEquals10(this.x, this.y) ? 0 : 1);
  }

  test_x_less_0() {
    this.display_result();
    this.incr_ip(this.x < 0 ? 0 : 1);
  }

  test_x_gt_0() {
    this.display_result();
    this.incr_ip(this.x > 0 ? 0 : 1);
  }

  test_x_le_0() {
    this.display_result();
    this.incr_ip(this.x <= this.y ? 0 : 1);
  }

  test_x_eq0() {
    this.display_result();
    this.incr_ip(floatEquals10(this.x, 0) ? 0 : 1);
  }

  test_x_ne0() {
    this.display_result();
    this.incr_ip(!floatEquals10(this.x, 0) ? 0 : 1);
  }

  gto_buf_clear() {
    this.gtoxx = "";
  }

  gto_digit_add(digit) {
    this.gtoxx = "" + this.gtoxx + digit.toFixed(0);
    if (this.gtoxx.length >= C.RAM_ADDR_SIZE) {
      const address = parseInt(this.gtoxx, 10);
      this.gtoxx = "";
      this.rst_modifier();
      if (address > this.program_limit()) {
        this.display_error(C.ERROR_IP);
        return;
      }
      this.ip = address;
    }
  }

  nop() {}

  // --- Program Mode ---

  prog_pr() {
    if (this.program_mode === C.MODE_INTERACTIVE) {
      this.program_mode = C.MODE_PROGRAMMING;
      this.display_pgrm();
      this.display_program_opcode();
    }
  }

  prog_bst_after() {
    this.sti();
    this.display_result();
  }

  // --- Statistics ---

  stat_sigma_plus() {
    if (!this.alg_resolve()) return;
    accumulateStatistics(+1, this.stomemory, this.x, this.y);
    this.save_lastx();
    this.x = this.stomemory[C.STAT_N];
    this.display_result();
    this.pushed = 1;
  }

  stat_sigma_minus() {
    if (!this.alg_resolve()) return;
    accumulateStatistics(-1, this.stomemory, this.x, this.y);
    this.save_lastx();
    this.x = this.stomemory[C.STAT_N];
    this.display_result();
    this.pushed = 1;
  }

  stat_avgw() {
    this.alg_op = 0;
    const result = calculateWeightedMean(this.stomemory);
    if (!result[0]) {
      this.display_error(C.ERROR_STAT);
    } else {
      this.save_lastx();
      this.x = result[1];
      this.display_result();
    }
  }

  stat_avg() {
    this.alg_op = 0;
    const result = calculateMean(this.stomemory);
    if (!result[0]) {
      this.display_error(C.ERROR_STAT);
    } else {
      this.save_lastx();
      this.push();
      this.x = result[1];
      this.y = result[2];
      this.display_result();
    }
  }

  stat_stddev() {
    this.alg_op = 0;
    const result = calculateStdDev(this.stomemory);
    if (!result[0]) {
      this.display_error(C.ERROR_STAT);
      return;
    }
    this.save_lastx();
    this.push();
    this.x = result[1];
    this.y = result[2];
    this.display_result();
  }

  stat_lr(solveForX) {
    this.alg_op = 0;
    const result = regressionEstimate(this.stomemory, solveForX, this.x);
    if (!result[0]) {
      this.display_error(C.ERROR_STAT);
    } else {
      this.save_lastx();
      this.push();
      this.x = result[1];
      this.y = result[2];
      this.display_result();
    }
  }

  stat_linearregression() {
    this.alg_op = 0;
    const result = linearRegression(this.stomemory);
    if (!result[0]) {
      this.display_error(C.ERROR_STAT);
    } else {
      this.save_lastx();
      this.push();
      this.push();
      this.x = result[1];
      this.y = result[2];
      this.display_result();
    }
  }

  stat_sigma_rcl() {
    this.push();
    this.push();
    this.x = this.stomemory[C.STAT_X];
    this.y = this.stomemory[C.STAT_Y];
    this.display_result();
  }

  // --- Financial Operations ---

  simple_interest() {
    if (!this.alg_resolve()) return;
    const n = this.finmemory[C.FIN_N];
    const rate = this.finmemory[C.FIN_I] / 100;
    const pv = this.finmemory[C.FIN_PV];
    this.push();
    this.push();
    this.push();
    this.x = (n / 360) * -pv * rate;
    this.y = -pv;
    this.z = (n / 365) * -pv * rate;
    this.display_result();
  }

  fincalc2(variable) {
    this.sti();
    const result = solveTVM(
      variable,
      this.begin,
      this.compoundf,
      this.finmemory,
    );
    if (result === -1) {
      this.x = this.finmemory[variable];
      this.display_result();
    } else {
      this.display_error(result);
    }
  }

  sto_or_calc_fin(variable) {
    if (!this.alg_resolve()) return;
    if (!this.do_fincalc) {
      this.stofin(variable);
      this.do_fincalc = 1;
    } else {
      this.cli();
      getState().display.show("running");
      setTimeout(() => this.fincalc2(variable), 200);
    }
  }

  npv() {
    this.alg_op = 0;
    this.x = calculateNPV(
      this.finmemory[C.FIN_N],
      this.finmemory[C.FIN_I],
      this.stomemory,
      this.njmemory,
    );
    this.display_result();
  }

  irr() {
    this.alg_op = 0;
    getState().display.show("running");
    const result = calculateIRR(
      this.finmemory[C.FIN_N],
      this.finmemory[C.FIN_I],
      this.stomemory,
      this.njmemory,
    );
    this.finmemory[C.FIN_I] = result[1];
    if (result[0] !== -1) {
      this.display_error(result[0]);
    } else {
      this.push();
      this.x = this.finmemory[C.FIN_I];
      this.display_result();
    }
  }

  // --- Date Operations ---

  date_date() {
    this.alg_op = 0;
    const date = parseDate(this.y, this.dmy);
    if (date === null) {
      this.display_error(C.ERROR_DATE);
      return;
    }
    this.save_lastx();
    addDays(date, this.x);
    this.pop();
    this.x = dateToNumber(date, this.dmy);
    this.display_result_date(date);
  }

  date_dys() {
    this.alg_op = 0;
    const date1 = parseDate(this.x, this.dmy);
    const date2 = parseDate(this.y, this.dmy);
    if (date2 === null || date1 === null) {
      this.display_error(C.ERROR_DATE);
      return;
    }
    this.save_lastx();
    this.x = dateDiffActual(date2, date1);
    this.y = dateDiff30_360(date2, date1);
    this.display_result();
  }

  // --- Amortization ---

  amortization() {
    this.alg_op = 0;
    const numPayments = this.x;
    const startN = this.finmemory[C.FIN_N];
    const rate = this.finmemory[C.FIN_I] / 100;
    let pv = roundToDecimals(this.finmemory[C.FIN_PV], this.decimals);
    this.finmemory[C.FIN_PV] = pv;
    let pmt = roundToDecimals(this.finmemory[C.FIN_PMT], this.decimals);
    this.finmemory[C.FIN_PMT] = pmt;

    const result = calculateAmortization(
      numPayments,
      startN,
      rate,
      pv,
      pmt,
      this.decimals,
      this.begin,
    );
    const totalInterest = result[1];
    const totalPrincipal = result[2];

    this.push();
    this.push();
    this.x = totalInterest;
    this.y = totalPrincipal;
    this.z = numPayments;
    this.finmemory[C.FIN_N] += numPayments;
    this.finmemory[C.FIN_PV] += totalPrincipal;
    this.display_result();
  }

  // --- Bond Operations ---

  bond_price() {
    this.alg_op = 0;
    const yieldRate = this.finmemory[C.FIN_I];
    if (yieldRate <= -100) {
      this.display_error(C.ERROR_INTEREST);
      return;
    }
    const couponRate = this.finmemory[C.FIN_PMT];
    const settlement = parseDate(this.y, this.dmy);
    if (settlement === null) {
      this.display_error(C.ERROR_DATE);
      return;
    }
    const maturity = parseDate(this.x, this.dmy);
    if (maturity === null) {
      this.display_error(C.ERROR_DATE);
      return;
    }

    const result = calculateBondPrice(
      yieldRate,
      couponRate,
      settlement,
      maturity,
    );
    if (!result || result[0] >= 0) {
      this.display_error(result ? result[0] : C.ERROR_INTEREST);
      return;
    }

    this.push();
    this.push();
    this.finmemory[C.FIN_N] = this.x = result[1];
    this.y = result[2];
    this.display_result();
  }

  bond_yield() {
    this.alg_op = 0;
    const couponRate = this.finmemory[C.FIN_PMT];
    const settlement = parseDate(this.y, this.dmy);
    const maturity = parseDate(this.x, this.dmy);
    const price = this.finmemory[C.FIN_PV];

    const result = calculateBondYield(couponRate, settlement, maturity, price);
    if (result[0] >= 0) {
      this.display_error(result[0]);
      return;
    }

    this.push();
    this.finmemory[C.FIN_I] = this.x = result[1];
    this.display_result();
  }

  // --- Depreciation ---

  depreciation_sl() {
    this.alg_op = 0;
    const result = depreciationStraightLine(
      this.finmemory[C.FIN_PV],
      this.finmemory[C.FIN_FV],
      this.finmemory[C.FIN_N],
      this.x,
    );
    if (result[0] >= 0) {
      this.display_error(result[0]);
      return;
    }
    this.push();
    this.push();
    this.x = result[1];
    this.y = result[2];
    this.display_result();
  }

  depreciation_soyd() {
    this.alg_op = 0;
    const result = depreciationSOYD(
      this.finmemory[C.FIN_PV],
      this.finmemory[C.FIN_FV],
      this.finmemory[C.FIN_N],
      this.x,
    );
    if (result[0] >= 0) {
      this.display_error(result[0]);
      return;
    }
    this.push();
    this.push();
    this.x = result[1];
    this.y = result[2];
    this.display_result();
  }

  depreciation_db() {
    this.alg_op = 0;
    const result = depreciationDecliningBalance(
      this.finmemory[C.FIN_PV],
      this.finmemory[C.FIN_FV],
      this.finmemory[C.FIN_N],
      this.x,
      this.finmemory[C.FIN_I] / 100,
    );
    if (result[0] >= 0) {
      this.display_error(result[0]);
      return;
    }
    this.push();
    this.push();
    this.x = result[1];
    this.y = result[2];
    this.display_result();
  }
}
