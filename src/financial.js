import { isBadNumber, roundToDecimals, clampToSolvable } from './utils.js';
import { dateDiffActual } from './date-utils.js';
import * as C from './constants.js';

/**
 * Calculate Net Present Value for cash flows.
 * @param {number} numFlows - Number of cash flow groups
 * @param {number} interestRate - Interest rate (percentage)
 * @param {number[]} cashFlows - Cash flow values (index 0 = CF0)
 * @param {number[]} flowCounts - Number of times each flow repeats
 */
export function calculateNPV(numFlows, interestRate, cashFlows, flowCounts) {
    let npv = cashFlows[0];
    let period = 0;

    for (let group = 1; group <= numFlows; ++group) {
        const flowAmount = cashFlows[group];
        for (let repeat = 1; repeat <= flowCounts[group]; ++repeat) {
            ++period;
            npv += flowAmount / Math.pow(1 + (interestRate / 100), period);
        }
    }

    return npv;
}

/**
 * Compute the present value limit factor for compound payments.
 * When interest is near zero, returns numPeriods directly.
 */
function compoundPaymentLimit(interestRate, numPeriods) {
    if (Math.abs(interestRate) < 1e-8) {
        return numPeriods;
    }
    return (1 - Math.pow(1 + (interestRate / 100), -numPeriods)) / (interestRate / 100);
}

/**
 * Calculate NPV for Time Value of Money (TVM) problems.
 * Used by the financial solver to find unknown TVM variables.
 *
 * @param {boolean} isIntegerPeriods - Whether N must be treated as integer
 * @param {number} n - Number of periods
 * @param {number} i - Interest rate per period (percentage)
 * @param {number} pv - Present value
 * @param {number} pmt - Payment per period
 * @param {number} fv - Future value
 * @param {boolean} beginMode - Payments at beginning of period
 * @param {boolean} compoundForOddPeriod - Use compound interest for fractional periods
 */
export function calculateTVM_NPV(isIntegerPeriods, n, i, pv, pmt, fv, beginMode, compoundForOddPeriod) {
    const rate = i / 100;
    const beginAdjust = (1 + rate * (beginMode ? 1 : 0));

    if (n === Math.floor(n) || isIntegerPeriods) {
        // Integer periods: standard TVM formula
        return pv + beginAdjust * pmt * compoundPaymentLimit(i, n) + fv * Math.pow(1 + rate, -n);
    }

    const integerPart = Math.floor(n);
    const fractionalPart = n - integerPart;

    if (!compoundForOddPeriod) {
        // Simple interest for fractional period
        return pv * (1 + rate * fractionalPart) +
            beginAdjust * pmt * compoundPaymentLimit(i, integerPart) +
            fv * Math.pow(1 + rate, -integerPart);
    } else {
        // Compound interest for fractional period
        return pv * Math.pow(1 + rate, fractionalPart) +
            beginAdjust * pmt * compoundPaymentLimit(i, integerPart) +
            fv * Math.pow(1 + rate, -integerPart);
    }
}

/**
 * Solve for a TVM variable using secant method interpolation.
 *
 * @param {number} solveFor - Which variable to solve (FIN_N, FIN_I, etc.)
 * @param {boolean} beginMode - Payments at beginning
 * @param {boolean} compoundForOddPeriod - Compound for fractional periods
 * @param {number[]} finRegisters - Array of [N, I, PV, PMT, FV]
 * @returns {number} -1 on success, error code on failure
 */
export function solveTVM(solveFor, beginMode, compoundForOddPeriod, finRegisters) {
    // Validate inputs
    let hasError = false;
    if (solveFor === C.FIN_N) {
        hasError = finRegisters[C.FIN_I] <= -100;
    } else if (solveFor === C.FIN_PV) {
        hasError = finRegisters[C.FIN_I] <= -100;
    } else if (solveFor === C.FIN_PMT) {
        hasError = finRegisters[C.FIN_I] <= -100 || finRegisters[C.FIN_N] === 0;
    } else if (solveFor === C.FIN_FV) {
        hasError = finRegisters[C.FIN_I] <= -100;
    }

    if (hasError) {
        return C.ERROR_INTEREST;
    }

    const originalValue = finRegisters[solveFor];
    let maxIterations = C.INTERPOLATION_MAX;
    const baseTolerance = 1.25e-10;

    // Scale tolerance based on magnitudes of known values
    let scaleFactor = 0;
    if (solveFor !== C.FIN_PV)  scaleFactor += Math.abs(finRegisters[C.FIN_PV]);
    if (solveFor !== C.FIN_PMT) scaleFactor += Math.abs(finRegisters[C.FIN_PMT]);
    if (solveFor !== C.FIN_N && solveFor !== C.FIN_PMT) {
        scaleFactor += Math.abs(finRegisters[C.FIN_N] * finRegisters[C.FIN_PMT]);
    }
    if (solveFor !== C.FIN_FV)  scaleFactor += Math.abs(finRegisters[C.FIN_FV]);

    const tolerance = baseTolerance * (scaleFactor > 0 ? scaleFactor : 1);

    // Initial guesses for secant method
    let previousGuess = 0;
    let currentGuess;
    if (solveFor === C.FIN_N || solveFor === C.FIN_I || scaleFactor <= 0) {
        currentGuess = 1;
    } else {
        currentGuess = scaleFactor;
    }

    while (--maxIterations >= 0) {
        const nextPrevious = currentGuess;
        currentGuess = previousGuess;

        // Evaluate NPV at nextPrevious
        finRegisters[solveFor] = nextPrevious;
        if (finRegisters[C.FIN_I] <= -100) break;
        const npvAtPrev = calculateTVM_NPV(
            solveFor === 0, finRegisters[C.FIN_N], finRegisters[C.FIN_I],
            finRegisters[C.FIN_PV], finRegisters[C.FIN_PMT], finRegisters[C.FIN_FV],
            beginMode, compoundForOddPeriod
        );

        // Evaluate NPV at currentGuess
        finRegisters[solveFor] = currentGuess;
        if (finRegisters[C.FIN_I] <= -100) break;
        const npvAtCurrent = calculateTVM_NPV(
            solveFor === 0, finRegisters[C.FIN_N], finRegisters[C.FIN_I],
            finRegisters[C.FIN_PV], finRegisters[C.FIN_PMT], finRegisters[C.FIN_FV],
            beginMode, compoundForOddPeriod
        );

        // Check convergence
        if (Math.abs(npvAtCurrent) < tolerance) {
            // Round N to integer if solving for N
            if (solveFor === C.FIN_N) {
                if ((currentGuess - Math.floor(currentGuess)) > 0.003) {
                    finRegisters[solveFor] = Math.floor(finRegisters[solveFor]) + 1;
                } else {
                    finRegisters[solveFor] = Math.floor(finRegisters[solveFor]);
                }
            }
            return -1; // Success
        }

        // Secant method step
        const slope = (npvAtCurrent - npvAtPrev) / (currentGuess - nextPrevious);
        previousGuess = npvAtPrev - nextPrevious * slope;
        previousGuess /= -slope;
        previousGuess = clampToSolvable(previousGuess);
    }

    // Failed to converge
    finRegisters[solveFor] = originalValue;
    return C.ERROR_INTEREST;
}

/**
 * Sum of absolute cash flow values (for IRR tolerance scaling).
 */
function cashFlowAbsSum(numFlows, cashFlows) {
    let sum = Math.abs(cashFlows[0]);
    for (let i = 1; i <= numFlows; ++i) {
        sum += Math.abs(cashFlows[i]);
    }
    return sum;
}

/**
 * Calculate Internal Rate of Return using secant method.
 *
 * @returns {[number, number]} [errorCode, result] where errorCode is -1 on success
 */
export function calculateIRR(numFlows, initialGuess, cashFlows, flowCounts) {
    let maxIterations = C.INTERPOLATION_MAX;
    let tolerance = 1.25e-10;

    const absSum = cashFlowAbsSum(numFlows, cashFlows);
    if (absSum > 0) {
        tolerance *= absSum;
    }

    if (initialGuess <= -100 || initialGuess > 10000000000) {
        initialGuess = 0;
    }

    let previousRate = initialGuess + 1;
    let currentRate = initialGuess;

    while (--maxIterations > 0) {
        const npvAtPrev = calculateNPV(numFlows, previousRate, cashFlows, flowCounts);
        const npvAtCurrent = calculateNPV(numFlows, currentRate, cashFlows, flowCounts);

        if (currentRate < -100 || currentRate > 10000000000) {
            return [C.ERROR_IRR, currentRate];
        }

        if (Math.abs(npvAtCurrent) < tolerance) {
            return [-1, currentRate]; // Success
        }

        // Secant method step
        const slope = (npvAtCurrent - npvAtPrev) / (currentRate - previousRate);
        let nextGuess = npvAtPrev - previousRate * slope;
        nextGuess /= -slope;
        nextGuess = clampToSolvable(nextGuess);

        previousRate = currentRate;
        currentRate = nextGuess;
    }

    return [C.ERROR_IRR2, currentRate];
}

/**
 * Find the previous coupon date for bond calculations.
 * Returns [prevCouponDate, nextCouponDate, numCoupons] or null on error.
 */
export function findPreviousCouponDate(settlementDate, maturityDate) {
    let couponCount = 0;
    let testDate = new Date(maturityDate);
    let nextCouponDate;

    while (testDate > settlementDate) {
        nextCouponDate = new Date(testDate);
        ++couponCount;
        testDate.setDate(1);
        testDate.setMonth(testDate.getMonth() - 6);
        const expectedMonth = testDate.getMonth();
        testDate.setDate(maturityDate.getDate());
        if (testDate.getMonth() !== expectedMonth) {
            return null;
        }
    }

    return [testDate, nextCouponDate, couponCount];
}

/**
 * Calculate bond price given yield.
 * @returns {[number, number, number]} [errorCode, price, accruedInterest]
 *          errorCode is -1 on success
 */
export function calculateBondPrice(yieldRate, couponRate, settlementDate, maturityDate) {
    const daysBetween = dateDiffActual(settlementDate, maturityDate);
    if (daysBetween <= 0) {
        return [C.ERROR_DATE, 0, 0];
    }

    const couponInfo = findPreviousCouponDate(settlementDate, maturityDate);
    if (couponInfo === null) {
        return [C.ERROR_DATE, 0, 0];
    }

    const couponPeriodDays = dateDiffActual(couponInfo[0], couponInfo[1]);
    const daysToNextCoupon = dateDiffActual(settlementDate, couponInfo[1]);
    const numCoupons = couponInfo[2];
    const daysFromLastCoupon = couponPeriodDays - daysToNextCoupon;

    let price;
    if (daysBetween <= couponPeriodDays) {
        // Simple case: within one coupon period
        price = (100 * (100 + couponRate / 2)) /
                (100 + ((daysBetween / couponPeriodDays) * yieldRate / 2));
    } else {
        // Multiple coupon periods
        price = 100 / Math.pow(1 + yieldRate / 200, numCoupons - 1 + daysToNextCoupon / couponPeriodDays);
        for (let period = 1; period <= numCoupons; ++period) {
            price += (couponRate / 2) /
                     Math.pow(1 + yieldRate / 200, period - 1 + daysToNextCoupon / couponPeriodDays);
        }
    }

    const accruedInterest = (couponRate / 2) * daysFromLastCoupon / couponPeriodDays;
    price -= accruedInterest;

    if (isBadNumber(price) || isBadNumber(accruedInterest)) {
        return [C.ERROR_INTEREST, 0, 0];
    }

    return [-1, price, accruedInterest];
}

/**
 * Calculate bond yield given price using secant method.
 * @returns {[number, number]} [errorCode, yield]
 */
export function calculateBondYield(couponRate, settlementDate, maturityDate, purchasePrice) {
    if (settlementDate === null) return [C.ERROR_DATE, 0];
    if (maturityDate === null) return [C.ERROR_DATE, 0];
    if (purchasePrice <= 0) return [C.ERROR_INTEREST, 0];

    let maxIterations = C.INTERPOLATION_MAX;
    const tolerance = 1.25e-10 * Math.abs(purchasePrice);

    let previousYield = 0;
    let currentYield = previousYield + 1;
    let result;

    while (--maxIterations > 0) {
        let bondResult = calculateBondPrice(previousYield, couponRate, settlementDate, maturityDate);
        if (!bondResult || bondResult[0] >= 0) {
            return bondResult ? [bondResult[0], 0] : [C.ERROR_INTEREST, 0];
        }
        const priceDiffAtPrev = bondResult[1] - purchasePrice;

        bondResult = calculateBondPrice(currentYield, couponRate, settlementDate, maturityDate);
        if (!bondResult || bondResult[0] >= 0) {
            return bondResult ? [bondResult[0], 0] : [C.ERROR_INTEREST, 0];
        }
        const priceDiffAtCurrent = bondResult[1] - purchasePrice;

        if (previousYield < -100 || previousYield > 10000000000) {
            return [C.ERROR_INTEREST, 0];
        }

        if (Math.abs(priceDiffAtCurrent) < tolerance) {
            result = currentYield;
            break;
        }

        // Secant method step
        const slope = (priceDiffAtCurrent - priceDiffAtPrev) / (currentYield - previousYield);
        let nextGuess = priceDiffAtPrev - previousYield * slope;
        nextGuess /= -slope;
        nextGuess = clampToSolvable(nextGuess);

        previousYield = currentYield;
        currentYield = nextGuess;
    }

    return [-1, result];
}

/**
 * Calculate straight-line depreciation.
 * @returns {[number, number, number]} [errorCode, depreciation, remainingValue]
 */
export function depreciationStraightLine(cost, salvage, life, year) {
    if (year < 0 || year !== Math.floor(year) || life <= 0 || life > Math.pow(10, 10)) {
        return [C.ERROR_INTEREST, 0, 0];
    }
    if (year > life) {
        return [-1, 0, 0];
    }

    let depreciation = 0;
    let remainingValue = cost - salvage;

    let y = year;
    while (--y >= 0) {
        depreciation = (cost - salvage) / life;
        if (isBadNumber(depreciation)) {
            return [C.ERROR_DIVZERO, 0, 0];
        }
        remainingValue -= depreciation;
    }

    return [-1, depreciation, remainingValue];
}

/**
 * Calculate sum-of-the-years-digits depreciation.
 * @returns {[number, number, number]} [errorCode, depreciation, remainingValue]
 */
export function depreciationSOYD(cost, salvage, life, year) {
    if (year < 0 || year !== Math.floor(year) || life <= 0 || life > Math.pow(10, 10)) {
        return [C.ERROR_INTEREST, 0, 0];
    }
    if (year > life) {
        return [-1, 0, 0];
    }

    let depreciation = 0;
    let remainingValue = cost - salvage;
    let currentYear = 0;
    const soydDenominator = life * (life + 1) / 2;

    let y = year;
    while (--y >= 0) {
        depreciation = (cost - salvage) * (life - (++currentYear) + 1) / soydDenominator;
        if (isBadNumber(depreciation)) {
            return [C.ERROR_DIVZERO, 0, 0];
        }
        remainingValue -= depreciation;
    }

    return [-1, depreciation, remainingValue];
}

/**
 * Calculate declining-balance depreciation.
 * @returns {[number, number, number]} [errorCode, depreciation, remainingValue]
 */
export function depreciationDecliningBalance(cost, salvage, life, year, declineRate) {
    if (year < 0 || year !== Math.floor(year) || life <= 0 || life > Math.pow(10, 10)) {
        return [C.ERROR_INTEREST, 0, 0];
    }
    if (year > life || (cost - salvage) < 0) {
        return [-1, 0, 0];
    }

    let depreciation = 0;
    let remainingValue = cost - salvage;
    let currentYear = 0;

    let y = year;
    while (--y >= 0) {
        if (++currentYear < life) {
            depreciation = (remainingValue + salvage) * declineRate / life;
        } else {
            depreciation = remainingValue;
        }
        if (isBadNumber(depreciation)) {
            return [C.ERROR_DIVZERO, 0, 0];
        }
        remainingValue -= depreciation;
        if (remainingValue < 0) {
            depreciation += remainingValue;
            remainingValue = 0;
        }
    }

    return [-1, depreciation, remainingValue];
}

/**
 * Calculate loan amortization.
 * @param {number} numPayments - Number of payments to amortize
 * @param {number} startingN - Current period counter
 * @param {number} interestRate - Rate per period (as decimal, not percentage)
 * @param {number} balance - Current loan balance (PV)
 * @param {number} payment - Payment amount (PMT)
 * @param {number} decimalPlaces - Rounding precision
 * @param {boolean} beginMode - Payments at beginning
 * @returns {[number, number, number]} [errorCode, totalInterest, totalPrincipal]
 */
export function calculateAmortization(numPayments, startingN, interestRate, balance, payment, decimalPlaces, beginMode) {
    if (numPayments <= 0 || numPayments !== Math.floor(numPayments) || interestRate <= -1) {
        return [C.ERROR_INTEREST, 0, 0];
    }

    let totalInterest = 0;
    let totalPrincipal = 0;

    for (let period = 1; period <= numPayments; ++period) {
        let interestPortion = roundToDecimals(-balance * interestRate, decimalPlaces);

        // In BEGIN mode, first payment has no interest if starting from period 0
        if (period === 1 && beginMode && startingN <= 0) {
            interestPortion = 0;
        }

        const principalPortion = payment - interestPortion;
        totalInterest += interestPortion;
        totalPrincipal += principalPortion;
        balance += principalPortion;
    }

    return [-1, totalInterest, totalPrincipal];
}
