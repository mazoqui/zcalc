import { zeroPad, formatNumber } from "./utils.js";
import * as C from "./constants.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * SVG polygon definitions for each 7-segment LCD segment.
 * Based on classic hexagonal LCD segment geometry in an 88x160 coordinate system.
 * Decimal point and comma extend beyond the digit body using overflow:visible.
 */
const SEGMENT_POLYGONS = {
  a: "18,0 70,0 78,8 70,16 18,16 10,8", // top horizontal
  b: "0,18 8,10 16,18 16,70 8,78 0,70", // top-left vertical
  c: "72,18 80,10 88,18 88,70 80,78 72,70", // top-right vertical
  d: "18,72 70,72 78,80 70,88 18,88 10,80", // middle horizontal
  e: "0,90 8,82 16,90 16,142 8,150 0,142", // bottom-left vertical
  f: "72,90 80,82 88,90 88,142 80,150 72,142", // bottom-right vertical
  g: "18,144 70,144 78,152 70,160 18,160 10,152", // bottom horizontal
  p: "95,142 113,142 113,160 95,160", // decimal point
  t: "95,164 108,164 85,190 73,190", // thousands separator (comma tail)
};

/** Segment names in rendering order, matching bit flag positions */
const SEGMENT_NAMES = ["a", "b", "c", "d", "e", "f", "g", "p", "t"];

/** Number of LCD digit positions */
const DIGIT_COUNT = 11;

/**
 * Seven-segment LCD display controller.
 * Manages rendering digits on the calculator's 7-segment LCD display
 * using inline SVG polygon elements instead of external PNG images.
 */
export class Display {
  constructor() {
    this.maxDisplayableValue = 9999999999;
    this.displayDigitCount = 10;
    this.minDisplayableValue = 1e-10;
    this.lcdDigits = [];
    this.functionalityLevel = 0;

    // Segment bit flags for 7-segment display
    const SEG_A = 1; // top horizontal
    const SEG_B = 2; // top-left vertical
    const SEG_C = 4; // top-right vertical
    const SEG_D = 8; // middle horizontal
    const SEG_E = 16; // bottom-left vertical
    const SEG_F = 32; // bottom-right vertical
    const SEG_G = 64; // bottom horizontal
    const SEG_P = 128; // decimal point
    const SEG_T = 256; // thousands separator

    // Character to segment mapping
    this.segmentMap = [];
    this.segmentMap["0"] = SEG_A | SEG_B | SEG_C | SEG_E | SEG_F | SEG_G;
    this.segmentMap["1"] = SEG_C | SEG_F;
    this.segmentMap["2"] = SEG_A | SEG_C | SEG_D | SEG_E | SEG_G;
    this.segmentMap["3"] = SEG_A | SEG_C | SEG_D | SEG_F | SEG_G;
    this.segmentMap["4"] = SEG_B | SEG_C | SEG_D | SEG_F;
    this.segmentMap["5"] = SEG_A | SEG_B | SEG_D | SEG_F | SEG_G;
    this.segmentMap["6"] = SEG_A | SEG_B | SEG_D | SEG_E | SEG_F | SEG_G;
    this.segmentMap["7"] = SEG_A | SEG_C | SEG_F;
    this.segmentMap["8"] =
      SEG_A | SEG_B | SEG_C | SEG_D | SEG_E | SEG_F | SEG_G;
    this.segmentMap["9"] = SEG_A | SEG_B | SEG_C | SEG_D | SEG_F | SEG_G;
    this.segmentMap[" "] = 0;
    this.segmentMap["."] = SEG_P;
    this.segmentMap[","] = SEG_P | SEG_T;
    this.segmentMap["r"] = SEG_A | SEG_B;
    this.segmentMap["u"] = SEG_B | SEG_C | SEG_D;
    this.segmentMap["n"] = SEG_B | SEG_C | SEG_A;
    this.segmentMap["i"] = SEG_B;
    this.segmentMap["g"] = SEG_A | SEG_B | SEG_C | SEG_D | SEG_F | SEG_G;
    this.segmentMap["-"] = SEG_D;
    this.segmentMap["E"] = SEG_A | SEG_B | SEG_D | SEG_E | SEG_G;
    this.segmentMap["e"] = SEG_A | SEG_B | SEG_D | SEG_E | SEG_G;
    this.segmentMap["O"] = SEG_D | SEG_E | SEG_F | SEG_G;
    this.segmentMap["R"] = SEG_D | SEG_E;
    this.segmentMap["P"] = SEG_A | SEG_B | SEG_C | SEG_D | SEG_E;
    this.segmentMap[":"] = SEG_P;

    if (
      !document ||
      !document.getElementById ||
      !document.getElementById("display")
    ) {
      return;
    }

    if (window.lcd_broken) {
      this.functionalityLevel = 1;
    } else {
      this.functionalityLevel = 2;
    }

    // Create SVG digit elements programmatically
    this.container = document.getElementById("pointer_div");
    this.svgDigits = [];

    for (let pos = 0; pos < DIGIT_COUNT; ++pos) {
      this.lcdDigits[pos] = [];
      this.lcdDigits[pos][0] = 0; // placeholder for 1-based indexing

      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 88 160");
      svg.style.position = "absolute";
      svg.style.zIndex = "1";
      svg.style.overflow = "visible";

      for (const name of SEGMENT_NAMES) {
        const polygon = document.createElementNS(SVG_NS, "polygon");
        polygon.setAttribute("points", SEGMENT_POLYGONS[name]);
        polygon.setAttribute("fill", "#333");
        polygon.style.visibility = "hidden";
        svg.appendChild(polygon);
        this.lcdDigits[pos].push(polygon);
      }

      this.container.appendChild(svg);
      this.svgDigits.push(svg);
    }

    // Initial layout + resize observer
    this._layoutDigits();
    new ResizeObserver(() => this._layoutDigits()).observe(this.container);

    // Status indicator elements
    this.displayElement = document.getElementById("display");
    this.beginIndicator = document.getElementById("begin");
    this.dmycIndicator = document.getElementById("dmyc");
    this.modifierIndicator = document.getElementById("modifier");
    this.pgrmIndicator = document.getElementById("pgrm");
    this.rpnalgIndicator = document.getElementById("rpnalg");
    this.trigoIndicator = document.getElementById("trigo");
    this.userIndicator = document.getElementById("user");

    this.clear();
  }

  /**
   * Recompute digit SVG sizes and positions based on current container dimensions.
   * Called on init and on container resize.
   */
  _layoutDigits() {
    const containerHeight = this.container.offsetHeight || 52;
    const containerWidth = this.container.offsetWidth || 350;
    const digitHeight = Math.round(containerHeight * 0.6);
    const digitWidth = Math.round((digitHeight * 88) / 160);
    const digitSpacing = Math.round(digitWidth * 1.5);
    const totalWidth = DIGIT_COUNT * digitSpacing;
    const startLeft = Math.round((containerWidth - totalWidth) / 2);
    const digitTop = Math.round((containerHeight - digitHeight) * 0.35);

    for (let pos = 0; pos < this.svgDigits.length; ++pos) {
      const svg = this.svgDigits[pos];
      svg.setAttribute("width", String(digitWidth));
      svg.setAttribute("height", String(digitHeight));
      svg.style.top = digitTop + "px";
      svg.style.left = startLeft + pos * digitSpacing + "px";
    }
  }

  /**
   * Render a single character at a digit position.
   * @param {string} char - Character to display
   * @param {number} position - LCD digit position (0-10)
   * @param {boolean} overlay - If true, keep existing visible segments
   */
  renderDigit(char, position, overlay) {
    if (position >= this.lcdDigits.length) {
      return;
    }
    if (!this.segmentMap[char]) {
      char = " ";
    }

    const segmentBits = this.segmentMap[char];
    const digitSegments = this.lcdDigits[position];
    let bitMask = 1;

    for (let seg = 1; seg < digitSegments.length; ++seg) {
      const shouldBeVisible = !!(segmentBits & bitMask);
      const isCurrentlyVisible =
        overlay && digitSegments[seg].style.visibility === "visible";
      digitSegments[seg].style.visibility =
        shouldBeVisible || isCurrentlyVisible ? "visible" : "hidden";
      bitMask <<= 1;
    }
  }

  /**
   * Render a string on the LCD display using 7-segment digits.
   * @param {string} text - The text to render on the LCD
   */
  renderLCD(text) {
    let digitPos = -1;

    for (let i = 0; i < text.length && digitPos < this.lcdDigits.length; ++i) {
      const char = text.charAt(i);
      ++digitPos;

      if (char === "." || char === ",") {
        // Decimal/thousands separator overlays on previous digit
        --digitPos;
        this.renderDigit(char, digitPos, true);
      } else {
        this.renderDigit(char, digitPos, false);
      }
    }

    // Clear remaining digit positions
    for (++digitPos; digitPos < this.lcdDigits.length; ++digitPos) {
      this.renderDigit(" ", digitPos, false);
    }
  }

  /**
   * Show text on the display (uses LCD segments or fallback text).
   * @param {string} text - The text to display
   */
  show(text) {
    if (this.functionalityLevel >= 2) {
      this.renderLCD(text);
    } else if (this.functionalityLevel >= 1) {
      this.displayElement.innerHTML = text;
    }
  }

  /**
   * Clear the entire display.
   */
  clear() {
    if (this.functionalityLevel >= 2) {
      for (let pos = 0; pos < this.lcdDigits.length; ++pos) {
        for (let seg = 1; seg < this.lcdDigits[pos].length; ++seg) {
          this.lcdDigits[pos][seg].style.visibility = "hidden";
        }
      }
    } else if (this.functionalityLevel >= 1) {
      this.displayElement.innerHTML = "";
    }
  }

  /**
   * Format a number for display according to current notation and decimal settings.
   * @param {number} value - The number to format
   * @param {number} decimals - Number of decimal places
   * @param {number} notation - Display notation (FIX, SCI, ENG)
   * @param {boolean} useComma - Use comma as decimal separator
   * @returns {string} Formatted display string
   */
  formatResult(value, decimals, notation, useComma) {
    let formattedStr = "";
    let absValue = Math.abs(value);
    let displayDecimals = decimals;
    let sciDecimals = decimals;
    let currentNotation = notation;
    let overflow = 0;
    let exponent;

    // Handle overflow/underflow
    if (value >= C.VALUE_MAX) {
      overflow = 1;
      exponent = 99;
      value = C.VALUE_MAX;
      absValue = Math.abs(value);
    } else if (value <= -C.VALUE_MAX) {
      overflow = 2;
      exponent = 99;
      value = -C.VALUE_MAX;
      absValue = Math.abs(value);
    } else if (absValue >= C.VALUE_MIN) {
      exponent = Math.log(absValue) / Math.log(10);
      exponent = Math.floor(exponent + 1e-11);
    } else {
      overflow = 3; // underflow to zero
      exponent = -100;
      absValue = value = 0;
    }

    // Determine if FIX notation needs to switch to SCI
    if (currentNotation === C.NOTATION_FIX) {
      sciDecimals = 6;
      if (absValue > this.maxDisplayableValue) {
        currentNotation = C.NOTATION_SCI;
      } else if (absValue !== 0 && exponent < -9) {
        currentNotation = C.NOTATION_SCI;
      } else if (absValue !== 0 && displayDecimals < -exponent) {
        displayDecimals = -exponent;
      }
    }

    sciDecimals = Math.min(sciDecimals, 6);

    // Calculate mantissa
    let mantissa;
    if (overflow !== 3) {
      mantissa = value / Math.pow(10, exponent);
    } else {
      mantissa = 0;
    }

    const mantissaSign = mantissa >= 0 ? 1 : -1;
    mantissa = parseFloat(Math.abs(mantissa).toFixed(sciDecimals));

    // Normalize mantissa for scientific notation
    if (currentNotation !== C.NOTATION_FIX && mantissa >= 10) {
      mantissa /= 10;
      exponent += 1;
    }
    mantissa *= mantissaSign;

    // Engineering notation: adjust exponent to multiple of 3
    if (currentNotation === C.NOTATION_ENG && !overflow) {
      const engExponent = 3 * Math.floor(exponent / 3);
      while (exponent > engExponent) {
        mantissa *= 10;
        exponent -= 1;
        if (sciDecimals > 0) {
          sciDecimals -= 1;
        }
      }
    }

    // Format scientific/engineering notation
    if (currentNotation !== C.NOTATION_FIX) {
      if (overflow === 1) {
        return formatNumber(" 9.999999 99", useComma, true);
      } else if (overflow === 2) {
        return formatNumber("-9.999999 99", useComma, true);
      }

      formattedStr = formatNumber(
        mantissa.toFixed(sciDecimals),
        useComma,
        true,
      );
      if (mantissa >= 0) {
        formattedStr = " " + formattedStr;
      }

      const mantissaWidth = this.displayDigitCount - 3 + 1 + 1;
      formattedStr = formattedStr.substring(0, mantissaWidth);
      while (formattedStr.length < mantissaWidth) {
        formattedStr += " ";
      }

      if (mantissa === 0) {
        exponent = 0;
      }

      if (exponent < 0) {
        formattedStr += "-" + zeroPad((-exponent).toFixed(0), 2);
      } else {
        formattedStr += " " + zeroPad(exponent.toFixed(0), 2);
      }
      return formattedStr;
    }

    // Fixed notation
    const fixedDecimals = Math.max(0, displayDecimals);
    const signChar = value < 0 ? "-" : " ";
    const absVal = Math.abs(value);
    let totalDigits =
      absVal.toFixed(fixedDecimals).length - (fixedDecimals > 0 ? 1 : 0);
    let actualDecimals = fixedDecimals;

    if (totalDigits > this.displayDigitCount) {
      actualDecimals -= totalDigits - this.displayDigitCount;
      actualDecimals = Math.max(0, actualDecimals);
    }

    formattedStr = formatNumber(
      signChar + absVal.toFixed(actualDecimals),
      useComma,
      true,
    );
    return formattedStr;
  }

  /**
   * Display a number immediately (no blink).
   * @param {number} value - The number to display
   * @param {number} decimals - Number of decimal places
   * @param {number} notation - Display notation mode
   * @param {boolean} useComma - Use comma as decimal separator
   */
  displayNumberImmediate(value, decimals, notation, useComma) {
    if (isNaN(value)) {
      value = 0;
    } else if (value > C.VALUE_MAX) {
      value = C.VALUE_MAX;
    } else if (value < -C.VALUE_MAX) {
      value = -C.VALUE_MAX;
    } else if (Math.abs(value) < C.VALUE_MIN) {
      value = 0;
    }

    const formatted = this.formatResult(value, decimals, notation, useComma);
    this.show(formatted);
  }

  /**
   * Display a number with a brief blink effect.
   * @param {number} value - Number to display
   * @param {number} decimals - Number of decimal places
   * @param {number} notation - Display notation mode
   * @param {boolean} useComma - Use comma as decimal separator
   * @param {Function} onKeyboardDisable - Callback to disable keyboard
   * @param {Function} onKeyboardEnable - Callback to re-enable keyboard
   */
  displayNumber(
    value,
    decimals,
    notation,
    useComma,
    onKeyboardDisable,
    onKeyboardEnable,
  ) {
    onKeyboardDisable();
    this.show("");
    setTimeout(() => {
      onKeyboardEnable();
      this.displayNumberImmediate(value, decimals, notation, useComma);
    }, 25);
  }

  /**
   * Display a number being typed by the user.
   * @param {number} signChar - Sign of the number (-1 or 1)
   * @param {string} integerPart - Integer portion of the typed number
   * @param {string} decimalPart - Decimal portion of the typed number
   * @param {string} exponentStr - Exponent string (for scientific input)
   * @param {number} exponentSign - Sign of the exponent (-1 or 1)
   * @param {number} inputMode - Current input mode (0=integer, 1=decimal, 100=exponent)
   * @param {boolean} useComma - Use comma as decimal separator
   */
  displayTypedNumber(
    signChar,
    integerPart,
    decimalPart,
    exponentStr,
    exponentSign,
    inputMode,
    useComma,
  ) {
    let displayStr = "";

    if (inputMode === 0) {
      // Integer part being typed
      if (integerPart.length <= 0) {
        displayStr = " 0";
      } else {
        displayStr = (signChar < 0 ? "-" : " ") + integerPart;
      }
      displayStr += ".";
      displayStr = formatNumber(displayStr, useComma, false);
    } else if (inputMode === 1) {
      // Decimal part being typed
      displayStr = formatNumber(
        (signChar < 0 ? "-" : " ") + integerPart + "." + decimalPart,
        useComma,
        true,
      );
    } else if (inputMode === 100) {
      // Exponent being typed
      const visibleDecimals = decimalPart.substring(0, 7 - integerPart.length);
      displayStr = formatNumber(
        (signChar < 0 ? "-" : " ") + integerPart + "." + visibleDecimals,
        useComma,
        true,
      );
      for (
        let i = 0;
        i < 7 - visibleDecimals.length - integerPart.length;
        ++i
      ) {
        displayStr += " ";
      }
      displayStr += exponentSign < 0 ? "-" : " ";
      displayStr += zeroPad(parseInt("0" + exponentStr, 10).toFixed(0), 2);
    }

    this.show(displayStr);
  }

  /**
   * Show the current modifier key indicator.
   * @param {number} modifier - The active modifier key constant
   */
  showModifier(modifier) {
    const MODIFIER_LABELS = {
      [C.KEY_FF]: "f",
      [C.KEY_GG]: "g",
      [C.KEY_STO]: "STO",
      [C.STO2]: "STO\u2605",
      [C.KEY_RCL]: "RCL",
      [C.RCL2]: "RCL\u2605",
      [C.RCL_GG]: "RCL g",
      [C.STO_PLUS]: "STO+",
      [C.STO_MINUS]: "STO-",
      [C.STO_TIMES]: "STO\u00d7",
      [C.STO_DIVIDE]: "STO\u00f7",
      [C.GTO]: "GTO",
      [C.GTO_MOVE]: "GTO\u2605",
    };

    const label = MODIFIER_LABELS[modifier] || "";
    if (this.functionalityLevel >= 1) {
      this.modifierIndicator.innerHTML = label;
    }
  }

  /**
   * Show or hide the BEGIN indicator.
   * @param {boolean} isBeginMode - Whether BEGIN mode is active
   */
  showBegin(isBeginMode) {
    if (this.beginIndicator && this.functionalityLevel >= 1) {
      this.beginIndicator.innerHTML = isBeginMode ? "BEGIN" : "";
    }
  }

  /**
   * Show an error message on the display.
   * @param {number} errorCode - The error code to display
   */
  showError(errorCode) {
    this.show("ERROR " + errorCode);
  }

  /**
   * Display memory info (program steps and registers available).
   * @param {number} programSteps - Number of available program steps
   * @param {number} registerCount - Number of available registers
   */
  displayMemoryInfo(programSteps, registerCount) {
    --registerCount;
    let regDisplay = (registerCount % 10).toFixed(0);
    if (registerCount >= 10) {
      regDisplay = ":" + regDisplay;
    }
    this.show(
      "P-" + zeroPad(programSteps, C.RAM_ADDR_SIZE) + " R-" + regDisplay,
    );
  }

  /**
   * Show DMY and compound interest indicators.
   * @param {boolean} isDmy - Whether day-month-year date format is active
   * @param {boolean} isCompound - Whether compound interest mode is active
   */
  showDmyAndCompound(isDmy, isCompound) {
    let text = "";
    if (isDmy) text += "D.MY";
    if (isCompound) text += "&nbsp;&nbsp;C";
    if (this.dmycIndicator && this.functionalityLevel >= 1) {
      this.dmycIndicator.innerHTML = text;
    }
  }

  /**
   * Show PGRM/RUN mode indicator.
   * @param {boolean} isProgramming - Whether programming mode is active
   * @param {boolean} isRunning - Whether a program is running
   * @param {number} instructionPointer - Current program instruction pointer
   */
  showProgramMode(isProgramming, isRunning, instructionPointer) {
    let text = "";
    if (isProgramming) {
      text = "PGRM";
    } else if (isRunning) {
      text = "RUN " + zeroPad(instructionPointer.toFixed(0), 2);
    }
    if (this.functionalityLevel >= 1) {
      this.pgrmIndicator.innerHTML = text;
    }
  }

  /**
   * Show RPN/ALG mode indicator (zCalc-platinum only).
   * @param {number} mode - The algebraic mode setting
   */
  showAlgebraicMode(_mode) {
    // Not used in standard zCalc mode
  }

  /**
   * Show trigonometry mode indicator (11c only).
   * @param {number} mode - The trigonometry mode setting
   */
  showTrigoMode(_mode) {
    // Not used in zCalc mode
  }

  /**
   * Show USER mode indicator (11c only).
   * @param {number} mode - The user mode setting
   */
  showUserMode(_mode) {
    // Not used in zCalc mode
  }
}
