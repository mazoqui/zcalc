import * as C from "./constants.js";

/**
 * Keyboard and mouse/touch input handler.
 * Maps physical keyboard keys and calculator button clicks to key codes.
 */
export class Keyboard {
  constructor(onKeyPress) {
    this.isEnabled = false;
    this.onKeyPress = onKeyPress;

    // Physical keyboard to calculator key code mapping
    this.keyMap = {
      0: 0,
      ".": C.KEY_DECIMAL,
      ",": C.KEY_DECIMAL,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
      8: 8,
      9: 9,
      "+": C.KEY_PLUS,
      "=": C.KEY_PLUS,
      "-": C.KEY_MINUS,
      "*": C.KEY_MULTIPLY,
      x: C.KEY_MULTIPLY,
      X: C.KEY_MULTIPLY,
      "/": C.KEY_DIVIDE,
      ":": C.KEY_DIVIDE,
      "\r": 36,
      "\n": 36,
      " ": 36,
      h: 16,
      H: 16,
      f: C.KEY_FF,
      F: C.KEY_FF,
      g: C.KEY_GG,
      G: C.KEY_GG,
      s: C.KEY_STO,
      S: C.KEY_STO,
      r: C.KEY_RCL,
      R: C.KEY_RCL,
      o: 41,
      O: 41,
      w: 49,
      W: 49,
      y: 34,
      Y: 34,
      // zCalc specific keys
      c: 35,
      C: 35,
      n: 11,
      N: 11,
      i: 12,
      I: 12,
      p: 13,
      P: 13,
      m: 14,
      M: 14,
      v: 15,
      V: 15,
      "#": 23,
      $: 24,
      "%": 25,
      "!": 21,
      "\\": 22,
      d: 33,
      D: 33,
      "[": C.KEY_RS,
      "]": C.KEY_SST,
      "?": 99,
      Z: C.KEY_BACKSPACE,
      z: C.KEY_BACKSPACE,
      e: 26,
      E: 26,
    };
    // Backspace key (charCode 8)
    this.keyMap[String.fromCharCode(8)] = C.KEY_BACKSPACE;
    // Open paren maps to R-down
    this.keyMap[String.fromCharCode(40)] = 33;

    // Setup pointer div for click/touch handling
    if (document && document.getElementById) {
      this.pointerDiv = document.getElementById("pointer_div");
    } else {
      this.pointerDiv = {
        offsetLeft: 0,
        offsetTop: 0,
        clientWidth: C.DISPLAY_THEO_WIDTH,
        clientHeight: C.DISPLAY_THEO_HEIGHT,
        style: { width: C.DISPLAY_THEO_WIDTH, height: C.DISPLAY_THEO_HEIGHT },
      };
    }

    // Calculate key grid scaling
    const scaleX =
      parseInt(this.pointerDiv.clientWidth, 10) / C.DISPLAY_THEO_WIDTH;
    const scaleY =
      parseInt(this.pointerDiv.clientHeight, 10) / C.DISPLAY_THEO_HEIGHT;
    this.keyOffsetX = C.DISPLAY_KEY_OFFSET_X * scaleX;
    this.keyOffsetY = C.DISPLAY_KEY_OFFSET_Y * scaleY;
    this.keyWidth = C.DISPLAY_KEY_WIDTH * scaleX;
    this.keyHeight = C.DISPLAY_KEY_HEIGHT * scaleY;
    this.keyStepX = C.DISPLAY_KEY_DIST_X * scaleX;
    this.keyStepY = C.DISPLAY_KEY_DIST_Y * scaleY;

    this.enable();
    this.setupEventListeners();
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  enabled() {
    return this.isEnabled;
  }

  /**
   * Set up keyboard and mouse/touch event listeners.
   */
  setupEventListeners() {
    if (!document || !document.getElementById) return;

    if (C.CALC_TYPE === "touch") {
      this.pointerDiv.ontouchstart = (event) => this.handleMouseClick(event);
    } else {
      this.pointerDiv.onclick = (event) => this.handleMouseClick(event);
    }
    document.onkeypress = (event) => this.handleKeyPress(event);
  }

  /**
   * Map a grid position (from mouse click) to a calculator key code.
   * The calculator has a 10x4 grid of keys, but the grid indices
   * don't directly correspond to key codes.
   */
  gridPositionToKeyCode(gridIndex) {
    let adjusted = gridIndex + 11;
    const units = adjusted % 10;

    if (units === 0) {
      adjusted -= 10;
    }

    const tens = Math.floor(adjusted / 10);

    if (adjusted === 47) {
      adjusted = 0;
    } else if (units >= 7 && units <= 9 && adjusted !== 48 && adjusted !== 49) {
      adjusted = units - 3 * (tens - 1);
    }

    if (adjusted === 46) {
      adjusted = 36; // ENTER key
    }

    return adjusted;
  }

  /**
   * Handle physical keyboard key press.
   */
  handleKeyPress(event) {
    let keyCode;
    if (window.event) {
      event = window.event;
      keyCode = window.event.keyCode;
    } else if (event.which) {
      keyCode = event.which;
    } else {
      return true;
    }

    const char = String.fromCharCode(keyCode);
    const calcKeyCode = this.keyMap[char];

    if (calcKeyCode !== undefined && calcKeyCode !== null) {
      this.onKeyPress(calcKeyCode);
      event.returnValue = false;
      if (event.preventDefault) {
        event.preventDefault();
      }
      return false;
    }
    return true;
  }

  /**
   * Handle mouse click or touch on the calculator face.
   * Determines which key was clicked based on click coordinates.
   */
  handleMouseClick(event) {
    if (!event) {
      event = window.event;
    }

    let clickX, clickY;
    const isTouchDisplay = false; // zcalc uses mouse clicks

    if (isTouchDisplay) {
      event.preventDefault();
      clickX =
        event.targetTouches[0].pageX -
        this.pointerDiv.offsetLeft -
        this.keyOffsetX;
      clickY =
        event.targetTouches[0].pageY -
        this.pointerDiv.offsetTop -
        this.keyOffsetY;
    } else {
      clickX =
        (event.offsetX
          ? event.offsetX
          : event.pageX - this.pointerDiv.offsetLeft) - this.keyOffsetX;
      clickY =
        (event.offsetY
          ? event.offsetY
          : event.pageY - this.pointerDiv.offsetTop) - this.keyOffsetY;
    }

    // Check bounds
    if (
      clickX < 0 ||
      clickY < 0 ||
      clickX >= this.keyStepX * 10 ||
      clickY >= this.keyStepY * 4
    ) {
      return;
    }

    // Determine grid position
    const gridColumn = Math.floor(clickX / this.keyStepX);
    const gridRow = Math.floor(clickY / this.keyStepY);
    const gridIndex = gridColumn + 10 * gridRow;

    // Check click is within key bounds (not in gap between keys)
    let relativeX = clickX;
    let relativeY = clickY;
    while (relativeX > this.keyStepX) relativeX -= this.keyStepX;
    while (relativeY > this.keyStepY) relativeY -= this.keyStepY;

    // Key 25 (EEX, bottom of row) has extended height
    const isWithinKey =
      relativeX < this.keyWidth &&
      (relativeY < this.keyHeight || gridIndex === 25);

    if (isWithinKey) {
      this.onKeyPress(this.gridPositionToKeyCode(gridIndex));
    }
  }
}
