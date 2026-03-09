import { isBadNumber, sign } from './utils.js';

/**
 * Convert degrees to radians.
 */
export function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

/**
 * Convert a value to radians based on the current trig mode.
 */
export function toRadians(value, trigoMode) {
    const TRIGO_DEG = 0;
    const TRIGO_GRAD = 2;

    if (trigoMode === TRIGO_DEG) {
        return degreesToRadians(value);
    } else if (trigoMode === TRIGO_GRAD) {
        return value * Math.PI / 200;
    }
    return value; // Already radians
}

/**
 * Convert radians to degrees.
 */
export function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}

/**
 * Convert a radian value to the current angle mode.
 */
export function fromRadians(radians, trigoMode) {
    const TRIGO_DEG = 0;
    const TRIGO_GRAD = 2;

    if (trigoMode === TRIGO_DEG) {
        return radiansToDegrees(radians);
    } else if (trigoMode === TRIGO_GRAD) {
        return radians * 200 / Math.PI;
    }
    return radians;
}

/**
 * Convert decimal hours to H.MMSS format.
 */
export function decimalToHms(decimalHours) {
    const sgn = sign(decimalHours);
    const hours = Math.floor(Math.abs(decimalHours));
    let fractional = Math.abs(decimalHours) - hours;

    fractional *= 60;
    const minutes = Math.floor(fractional + 1e-8);
    fractional = Math.max(fractional - minutes, 0);
    const seconds = fractional * 60;

    return sgn * (hours + minutes / 100 + seconds / 10000);
}

/**
 * Convert H.MMSS format to decimal hours.
 */
export function hmsToDecimal(hms) {
    const sgn = sign(hms);
    const hours = Math.floor(Math.abs(hms));
    let fractional = Math.abs(hms) - hours;

    fractional *= 100;
    const minutes = Math.floor(fractional + 1e-7);
    fractional = Math.max(fractional - minutes, 0);
    const seconds = fractional * 100;

    return sgn * (hours + minutes / 60 + seconds / 3600);
}

// Hyperbolic functions
export function sinh(x) {
    return (Math.exp(x) - Math.exp(-x)) / 2;
}

export function cosh(x) {
    return (Math.exp(x) + Math.exp(-x)) / 2;
}

export function tanh(x) {
    return (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x));
}

export function asinh(x) {
    return Math.log(x + Math.sqrt(x * x + 1));
}

export function acosh(x) {
    return Math.log(x + Math.sqrt(x * x - 1));
}

export function atanh(x) {
    return 0.5 * Math.log((1 + x) / (1 - x));
}

/**
 * Convert to polar coordinates.
 */
export function toPolar(x, y) {
    const angle = Math.atan2(y, x);
    const radius = Math.sqrt(x * x + y * y);
    return [radius, angle];
}

/**
 * Convert from polar to rectangular (orthogonal) coordinates.
 */
export function toRectangular(radius, angleRadians) {
    return [radius * Math.cos(angleRadians), radius * Math.sin(angleRadians)];
}

/**
 * Calculate factorial (integer only).
 */
export function factorial(n) {
    let result = 1;
    while (n > 1 && !isBadNumber(result)) {
        result *= n;
        --n;
    }
    return result;
}

/**
 * Lanczos approximation of the Gamma function.
 */
const GAMMA_G = 7;
const GAMMA_P = [
    0.9999999999998099,
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    0.000009984369578019572,
    1.5056327351493116e-7
];

export function gamma(z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    }
    z = z - 1;
    let x = GAMMA_P[0];
    for (let i = 1; i < (GAMMA_G + 2); ++i) {
        x += GAMMA_P[i] / (z + i);
    }
    const t = z + GAMMA_G + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Factorial using Gamma function (supports non-integers).
 */
export function factorialGamma(n) {
    if (n >= 0 && Math.floor(n) === n) {
        return factorial(n);
    }
    return gamma(n + 1);
}

/**
 * Permutations: P(n, r) = n! / (n-r)!
 */
export function permutations(n, r) {
    return factorial(n) / factorial(n - r);
}

/**
 * Combinations: C(n, r) = P(n, r) / r!
 */
export function combinations(n, r) {
    return permutations(n, r) / factorial(r);
}
