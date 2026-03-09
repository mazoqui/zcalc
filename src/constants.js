// Calculator mode constants
export const MODE_INTERACTIVE = 0;
export const MODE_PROGRAMMING = 1;
export const MODE_RUNNING = 2;
export const MODE_RUNNING_STEP = 3;

// Financial register indices
export const FIN_N = 0;
export const FIN_I = 1;
export const FIN_PV = 2;
export const FIN_PMT = 3;
export const FIN_FV = 4;

// Statistics register indices
export const STAT_N = 1;
export const STAT_X = 2;
export const STAT_X2 = 3;
export const STAT_Y = 4;
export const STAT_Y2 = 5;
export const STAT_XY = 6;
export const STAT_MIN = STAT_N;
export const STAT_MAX = STAT_XY;

// Trigonometry modes
export const TRIGO_DEG = 0;
export const TRIGO_RAD = 1;
export const TRIGO_GRAD = 2;

// Display notation modes
export const NOTATION_FIX = 0;
export const NOTATION_SCI = 1;
export const NOTATION_ENG = 2;

// Value limits
export const VALUE_MAX = 9.999999 * Math.pow(10, 99);
export const VALUE_MIN = Math.pow(10, -99);

// Program memory
export const RAM_MAX = 100;
export const RAM_ADDR_SIZE = 2;
export const STOP_INSTRUCTION = "43.33.00";
export const STOP_INSTRUCTION_IS_INVALID = false;
export const INSTRUCTION_SIZE = 2;
export const INSTRUCTION_MAX = 100;

// Storage memory
export const MEM_MAX = 20;

// Error codes
export const ERROR_DIVZERO = 0;
export const ERROR_OVERFLOW = 1;
export const ERROR_STAT = 2;
export const ERROR_IP = 4;
export const ERROR_INDEX = 3;
export const ERROR_RTN = 5;
export const ERROR_FLAG = 6;
export const ERROR_IRR = 3;
export const ERROR_INTEREST = 5;
export const ERROR_MEMORY = 6;
export const ERROR_IRR2 = 7;
export const ERROR_DATE = 8;

// Modifier keys
export const KEY_FF = 42;
export const KEY_GG = 43;
export const KEY_STO = 44;
export const KEY_RCL = 45;
export const KEY_RS = 31;
export const KEY_SST = 32;
export const KEY_RDOWN = 33;
export const KEY_DECIMAL = 48;
export const KEY_PLUS = 40;
export const KEY_MINUS = 30;
export const KEY_MULTIPLY = 20;
export const KEY_DIVIDE = 10;
export const KEY_BACKSPACE = 98;

// Compound modifier codes
export const STO2 = KEY_STO * 100 + KEY_DECIMAL;
export const RCL2 = KEY_RCL * 100 + KEY_DECIMAL;
export const RCL_GG = KEY_RCL * 100 + KEY_GG;
export const STO_PLUS = KEY_STO * 100 + KEY_PLUS;
export const STO_MINUS = KEY_STO * 100 + KEY_MINUS;
export const STO_TIMES = KEY_STO * 100 + KEY_MULTIPLY;
export const STO_DIVIDE = KEY_STO * 100 + KEY_DIVIDE;
export const GTO = KEY_GG * 100 + KEY_RDOWN;
export const GTO_MOVE = GTO * 100 + KEY_DECIMAL;

// These were set to 99999999 (unused in zcalc mode)
export const HYP = 99999999;
export const HYPINV = 99999999;
export const LBL = 99999999;
export const GSB = 99999999;
export const FIX = 99999999;
export const SCI = 99999999;
export const ENG = 99999999;
export const STO_F = 99999999;

// Calculator model type
export const CALC_TYPE = "zcalc";
export const TYPE_COOKIE = "zcalc";

// Display geometry
export const DISPLAY_THEO_WIDTH = 700;
export const DISPLAY_THEO_HEIGHT = 438;
export const DISPLAY_KEY_OFFSET_X = 44;
export const DISPLAY_KEY_OFFSET_Y = 151;
export const DISPLAY_KEY_WIDTH = 54;
export const DISPLAY_KEY_HEIGHT = 50;
export const DISPLAY_KEY_DIST_X = (606 - 44) / 9;
export const DISPLAY_KEY_DIST_Y = (364 - 151) / 3;

// Interpolation
export const INTERPOLATION_MAX = 50;

// Special value
export const SVE = 5.5;
