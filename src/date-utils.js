/**
 * Get timezone offset in milliseconds.
 */
export function getTimezoneOffsetMs(date) {
    return date.getTimezoneOffset() * 60000;
}

/**
 * Validate a date (year, month, day).
 * Returns true if the date is valid.
 */
export function isValidDate(year, month, day) {
    let maxDay = 31;
    if (month === 4 || month === 6 || month === 9 || month === 11) {
        maxDay = 30;
    } else if (month === 2) {
        maxDay = 28;
        if ((year % 4) === 0 && (((year % 100) !== 0) || ((year % 400) === 0))) {
            maxDay = 29;
        }
    }
    if (day <= 0 || day > maxDay || year <= 0 || year > 9999 || month <= 0 || month > 12) {
        return false;
    }
    return true;
}

/**
 * Parse a date from a calculator-format number.
 * In DMY mode, the format is DD.MMYYYY
 * In MDY mode, the format is MM.DDYYYY
 */
export function parseDate(dateNumber, isDmy) {
    dateNumber = Math.round(Math.abs(dateNumber) * 1000000);
    let day = Math.round(dateNumber / 1000000) % 100;
    let month = Math.round(dateNumber / 10000) % 100;
    const year = Math.round(dateNumber % 10000);

    if (!isDmy) {
        // MDY mode: swap day and month
        const temp = day;
        day = month;
        month = temp;
    }

    if (!isValidDate(year, month, day)) {
        return null;
    }

    return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Calculate difference in days between two dates (actual calendar).
 */
export function dateDiffActual(startDate, endDate) {
    return Math.round(
        ((endDate.getTime() - getTimezoneOffsetMs(endDate)) -
         (startDate.getTime() - getTimezoneOffsetMs(startDate))) / 86400000
    );
}

/**
 * Add days to a date (mutates the date object).
 */
export function addDays(date, days) {
    date.setTime(date.getTime() + Math.floor(days) * 86400000);
}

/**
 * Calculate difference in days using 30/360 convention.
 */
export function dateDiff30_360(startDate, endDate) {
    let startDay = startDate.getDate();
    let endDay = endDate.getDate();
    let adjStartDay = startDay;
    let adjEndDay = endDay;

    if (startDay === 31) {
        adjStartDay = 30;
    }
    if (endDay === 31) {
        if (startDay >= 30) {
            adjEndDay = 30;
        }
    }

    const startDays360 = 360 * startDate.getFullYear() + 30 * (startDate.getMonth() + 1) + adjStartDay;
    const endDays360 = 360 * endDate.getFullYear() + 30 * (endDate.getMonth() + 1) + adjEndDay;
    return endDays360 - startDays360;
}

/**
 * Convert a Date to a calculator-format number.
 */
export function dateToNumber(date, isDmy) {
    if (isDmy) {
        return date.getDate() + (date.getMonth() + 1) / 100 + date.getFullYear() / 1000000;
    } else {
        return (date.getMonth() + 1) + date.getDate() / 100 + date.getFullYear() / 1000000;
    }
}

/**
 * Format a date for display, including day-of-week.
 */
export function dateToDisplayString(date, isDmy) {
    let dayOfWeek = date.getDay();
    if (dayOfWeek === 0) {
        dayOfWeek = 7;  // Sunday = 7 (ISO)
    }
    return dateToNumber(date, isDmy).toFixed(6) + "  " + dayOfWeek;
}
