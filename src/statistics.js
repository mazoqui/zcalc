import { isBadNumber, floatEquals } from './utils.js';
import * as C from './constants.js';

/**
 * Accumulate a data point into the statistics registers.
 * @param {number} direction - +1 to add, -1 to subtract
 * @param {number[]} registers - Storage memory array
 * @param {number} xValue - X data point
 * @param {number} yValue - Y data point
 */
export function accumulateStatistics(direction, registers, xValue, yValue) {
    registers[C.STAT_N] += direction;
    registers[C.STAT_X] += direction * xValue;
    registers[C.STAT_X2] += direction * xValue * xValue;
    registers[C.STAT_Y] += direction * yValue;
    registers[C.STAT_Y2] += direction * yValue * yValue;
    registers[C.STAT_XY] += direction * xValue * yValue;
}

/**
 * Calculate mean (average) of X and Y.
 * @returns {[number, number?, number?]} [success, meanX, meanY]
 */
export function calculateMean(registers) {
    if (registers[C.STAT_N] === 0) {
        return [0];
    }
    const meanX = registers[C.STAT_X] / registers[C.STAT_N];
    const meanY = registers[C.STAT_Y] / registers[C.STAT_N];
    return [1, meanX, meanY];
}

/**
 * Calculate weighted mean.
 * @returns {[number, number?]} [success, weightedMean]
 */
export function calculateWeightedMean(registers) {
    if (registers[C.STAT_X] === 0) {
        return [0];
    }
    return [1, registers[C.STAT_XY] / registers[C.STAT_X]];
}

/**
 * Calculate sample standard deviation of X and Y.
 * @returns {[number, number?, number?]} [success, stddevX, stddevY]
 */
export function calculateStdDev(registers) {
    const n = registers[C.STAT_N];
    const varianceX = n * registers[C.STAT_X2] - registers[C.STAT_X] * registers[C.STAT_X];
    const varianceY = n * registers[C.STAT_Y2] - registers[C.STAT_Y] * registers[C.STAT_Y];

    if (n <= 1 || varianceX < 0 || varianceY < 0) {
        return [0];
    }

    const stddevX = Math.pow(varianceX / (n * (n - 1)), 0.5);
    const stddevY = Math.pow(varianceY / (n * (n - 1)), 0.5);
    return [1, stddevX, stddevY];
}

/**
 * Calculate linear regression coefficients (A and B where y = A + Bx).
 * @returns {[number, number?, number?]} [success, intercept, slope]
 */
export function linearRegression(registers) {
    const n = registers[C.STAT_N];

    if (n <= 1) {
        return [0];
    }

    const sumX2minusMean = registers[C.STAT_X2] - registers[C.STAT_X] * registers[C.STAT_X] / n;
    if (floatEquals(sumX2minusMean, 0)) {
        return [0];
    }

    const meanX = registers[C.STAT_X] / n;
    const meanY = registers[C.STAT_Y] / n;

    let slope = registers[C.STAT_XY] - registers[C.STAT_X] * registers[C.STAT_Y] / n;
    slope /= sumX2minusMean;

    if (isBadNumber(slope)) {
        return [0];
    }

    const intercept = meanY - slope * meanX;
    return [1, intercept, slope];
}

/**
 * Linear regression estimate and correlation coefficient.
 * @param {number[]} registers - Statistics registers
 * @param {boolean} solveForX - If true, solve for x given y; otherwise y given x
 * @param {number} inputValue - The known value to estimate from
 * @returns {[number, number?, number?]} [success, estimate, correlation]
 */
export function regressionEstimate(registers, solveForX, inputValue) {
    const regression = linearRegression(registers);
    if (!regression[0]) {
        return [0];
    }

    const intercept = regression[1];
    const slope = regression[2];
    const n = registers[C.STAT_N];

    // Check for division by zero
    if (solveForX) {
        if (floatEquals(n * registers[C.STAT_X2] - registers[C.STAT_X] * registers[C.STAT_X], 0)) {
            return [0];
        }
    } else {
        if (floatEquals(n * registers[C.STAT_Y2] - registers[C.STAT_Y] * registers[C.STAT_Y], 0)) {
            return [0];
        }
    }

    // Calculate correlation coefficient (r)
    const sxx = registers[C.STAT_X2] - registers[C.STAT_X] * registers[C.STAT_X] / n;
    const syy = registers[C.STAT_Y2] - registers[C.STAT_Y] * registers[C.STAT_Y] / n;
    const sxy = registers[C.STAT_XY] - registers[C.STAT_X] * registers[C.STAT_Y] / n;

    if (sxx === 0 || syy === 0) {
        return [0];
    }
    if ((sxx * syy) < 0) {
        return [0];
    }

    const denominator = Math.sqrt(sxx * syy);
    if (isBadNumber(denominator) || denominator < 0) {
        return [0];
    }

    const correlation = sxy / denominator;

    // Calculate estimate
    let estimate;
    if (solveForX) {
        if (slope === 0) {
            return [0];
        }
        estimate = (inputValue - intercept) / slope;
    } else {
        estimate = intercept + slope * inputValue;
    }

    if (isBadNumber(estimate)) {
        return [0];
    }

    return [1, estimate, correlation];
}
