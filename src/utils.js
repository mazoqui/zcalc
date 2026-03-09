/**
 * Check if a number is NaN or infinite.
 */
export function isBadNumber(value) {
    return isNaN(value) || !isFinite(value);
}

/**
 * Return 1 for non-negative numbers, -1 for negative.
 */
export function sign(value) {
    return value >= 0 ? 1 : -1;
}

/**
 * Round value to specified decimal places using commercial rounding.
 */
export function roundToDecimals(value, decimals) {
    if (decimals > 11) {
        return value;
    }
    const factor = Math.pow(10, decimals);
    return Math.round(Math.abs(value) * factor) / factor * sign(value);
}

/**
 * Trim whitespace from both ends of a string.
 */
export function trim(str) {
    return str.replace(/^\s+|\s+$/g, "");
}

/**
 * Zero-pad a number/string to a given length.
 */
export function zeroPad(value, length) {
    let str = "" + value;
    while (str.length < length) {
        str = "0" + str;
    }
    return str;
}

/**
 * Internationalize a number string:
 * - If useComma is true, swap "." and "," (European format)
 * - Add thousands separators
 * - If forceDecimal is true, ensure a decimal point exists
 */
export function formatNumber(numStr, useComma, forceDecimal) {
    let dotIndex = numStr.indexOf(".");

    if (dotIndex === -1 && forceDecimal) {
        numStr += ".";
        dotIndex = numStr.length - 1;
    }

    // Swap decimal separator if using comma mode
    if (dotIndex !== -1 && useComma) {
        numStr = numStr.slice(0, dotIndex) + "," + numStr.slice(dotIndex + 1);
    }

    if (dotIndex === -1) {
        dotIndex = numStr.length;
    }

    // Add thousands separator
    const thousandsSep = useComma ? "." : ",";
    const firstDigitOffset = (numStr.charAt(0) === "-" || numStr.charAt(0) === " ") ? 1 : 0;
    for (let i = dotIndex - 3; i > firstDigitOffset; i -= 3) {
        numStr = numStr.slice(0, i) + thousandsSep + numStr.slice(i);
    }

    return numStr;
}

/**
 * Clamp a value to avoid extreme infinity-like numbers in solver.
 */
export function clampToSolvable(value) {
    if (value > Math.pow(10, 95)) {
        return Math.pow(10, 95);
    } else if (value < -Math.pow(10, 95)) {
        return -Math.pow(10, 95);
    }
    return value;
}

/**
 * Round an arithmetic result to avoid floating point errors.
 * Rounds to 11 significant digits relative to the operands.
 */
export function arithmeticRound(result, operand1, operand2) {
    if (result === 0) {
        return result;
    } else if (operand1 === 0 && operand2 === 0) {
        return result;
    }

    const resultMagnitude = Math.floor(Math.log(Math.abs(result)) / Math.log(10));
    let operandMagnitude = resultMagnitude;

    if (operand1 !== 0) {
        operandMagnitude = Math.floor(Math.log(Math.abs(operand1)) / Math.log(10));
    }
    if (operand2 !== 0) {
        operandMagnitude = Math.min(operandMagnitude, Math.floor(Math.log(Math.abs(operand1)) / Math.log(10)));
    }

    if (operandMagnitude < -88) {
        return result;
    }

    const roundFactor = Math.pow(10, 11 - operandMagnitude);
    return Math.round(Math.abs(result) * roundFactor) / roundFactor * sign(result);
}

/**
 * Compare two floating point numbers with tolerance.
 */
export function floatEquals(a, b, tolerance) {
    if (a === undefined || a === null || b === undefined || b === null || isBadNumber(a) || isBadNumber(b)) {
        return false;
    }
    if (tolerance === undefined || tolerance === null) {
        tolerance = Math.pow(10, -10);
    }
    return Math.abs(a - b) <= tolerance;
}

/**
 * Compare two floats with 10-digit relative precision.
 */
export function floatEquals10(a, b) {
    if (a === undefined || a === null || b === undefined || b === null || isBadNumber(a) || isBadNumber(b)) {
        return false;
    }

    let tolerance;
    if (a === 0 || b === 0) {
        tolerance = Math.pow(10, -100);
    } else {
        const magnitude = Math.floor(Math.max(
            Math.log(Math.abs(b)) / Math.log(10),
            Math.log(Math.abs(a)) / Math.log(10)
        )) + 1;
        if (isBadNumber(magnitude)) {
            tolerance = Math.pow(10, -100);
        } else {
            tolerance = Math.pow(10, magnitude - 10);
        }
    }
    return floatEquals(a, b, tolerance);
}

/**
 * Compare two floats near zero with offset.
 */
export function floatEquals10Near0(a, b) {
    let offset = 0;
    if ((a <= 1 && a >= -1) || (b <= 1 && b >= -1)) {
        offset = 2;
    }
    return floatEquals10(offset + a, offset + b);
}
