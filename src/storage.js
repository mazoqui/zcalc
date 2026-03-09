import * as C from './constants.js';
import { isBadNumber, zeroPad, trim } from './utils.js';

/** @returns {object} Global calculator state */
function getState() {
    return window._calculatorState;
}

// Character table for compressing opcodes into single chars
const INSTRUCTION_CHARS = "0123456789_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ADDR_PREFIX = "$";

/**
 * Compress a dotted opcode string into a compact representation.
 * E.g., "43.33.00" -> compact string using INSTRUCTION_CHARS lookup.
 */
export function compressOpcode(opcode) {
    let compressed = "";
    const parts = opcode.split(".");

    for (const part of parts) {
        const partLength = part.length;
        const numValue = parseInt(part, 10);

        if (partLength === C.INSTRUCTION_SIZE && numValue >= 0 && numValue <= 50) {
            compressed += INSTRUCTION_CHARS.charAt(numValue);
        } else if (partLength === C.RAM_ADDR_SIZE) {
            compressed += ADDR_PREFIX;
            if (numValue < 64) {
                compressed += INSTRUCTION_CHARS.charAt(numValue);
            } else {
                compressed += INSTRUCTION_CHARS.charAt(Math.floor(numValue / 64));
                compressed += INSTRUCTION_CHARS.charAt(numValue % 64);
            }
        } else {
            return compressOpcode(C.STOP_INSTRUCTION);
        }
    }

    return compressed;
}

/**
 * Decompress a compact opcode string back to dotted format.
 */
export function decompressOpcode(compressed) {
    const parts = [];
    let hasError = false;
    let inAddress = 0;
    let addressValue = 0;

    for (let i = 0; i < compressed.length; ++i) {
        const char = compressed.charAt(i);

        if (char === ADDR_PREFIX) {
            if (parts.length < 1 || inAddress > 0) {
                hasError = true;
                break;
            }
            inAddress = 1;
            continue;
        }

        const charIndex = INSTRUCTION_CHARS.indexOf(char);
        if (charIndex < 0) {
            hasError = true;
            break;
        }

        if (inAddress) {
            addressValue = (addressValue * 64) + charIndex;
            if (addressValue >= Math.pow(10, C.RAM_ADDR_SIZE) || addressValue >= C.RAM_MAX) {
                hasError = true;
                break;
            }
            if (inAddress === 1) {
                parts.push(zeroPad(addressValue, C.RAM_ADDR_SIZE));
            } else {
                parts[parts.length - 1] = zeroPad(addressValue, C.RAM_ADDR_SIZE);
            }
            inAddress += 1;
        } else {
            if (charIndex > 49) {
                hasError = true;
                break;
            }
            parts.push(zeroPad(charIndex, C.INSTRUCTION_SIZE));
        }
    }

    if (hasError || parts.length > 3 || parts.length < 1) {
        return C.STOP_INSTRUCTION;
    }
    return parts.join(".");
}

/**
 * Serialize an array to a string for cookie storage.
 * @param {Array} array - Array to serialize
 * @param {string} type - "N" for numbers, "X" for opcodes
 */
function marshalArray(array, type) {
    let result = "A" + type;
    for (const item of array) {
        let value = item;
        if (type === "X") {
            value = compressOpcode(value);
        }
        result += "!" + value;
    }
    return result;
}

/**
 * Deserialize an array from a cookie string.
 */
function unmarshalArray(target, fieldName, serialized) {
    if (serialized.length < 2) return;

    const array = target[fieldName];
    const arrayType = serialized.charAt(1);
    const data = serialized.slice(3);
    const items = data.split("!");

    for (let i = 0; i < items.length && i < array.length; ++i) {
        if (arrayType === "N") {
            array[i] = parseFloat(items[i]);
            if (isBadNumber(array[i])) {
                array[i] = 0;
            }
        } else {
            // Opcode type - skip index 0 (empty instruction)
            if (i > 0) {
                array[i] = decompressOpcode(items[i]);
            }
        }
    }
}

/**
 * Storage controller - saves and loads calculator state via cookies.
 */
export class Storage {
    /**
     * Serialize the machine state to a cookie string.
     */
    serializeState(machine) {
        const expires = new Date();
        expires.setTime(expires.getTime() + 7 * 24 * 60 * 60 * 1000);

        let cookieStr = machine.nvname + "=";

        // Scalar values
        for (const field of machine.nvN) {
            cookieStr += field + ":" + machine[field] + " ";
        }

        // Numeric arrays
        for (const field of machine.nvAN) {
            cookieStr += field + ":" + marshalArray(machine[field], "N") + " ";
        }

        // Opcode arrays
        for (const field of machine.nvAX) {
            cookieStr += field + ":" + marshalArray(machine[field], "X") + " ";
        }

        cookieStr += "; expires=" + expires.toGMTString() + "; path=/";
        return cookieStr;
    }

    /**
     * Save the current calculator state to a cookie.
     */
    save() {
        document.cookie = this.serializeState(getState().machine);
    }

    /**
     * Deserialize and restore machine state from a cookie string.
     */
    deserializeState(machine, cookieString) {
        const cookies = cookieString.split(";");

        for (const cookie of cookies) {
            const keyValue = cookie.split("=");
            if (keyValue.length !== 2) continue;

            const name = trim(keyValue[0]);
            const value = trim(keyValue[1]);

            if (name !== C.TYPE_COOKIE) continue;

            const fields = value.split(" ");
            for (const field of fields) {
                const parts = field.split(":");
                if (parts.length === 2 && machine[parts[0]] !== undefined) {
                    if (parts[1].length >= 2 && parts[1].charAt(0) === "A") {
                        unmarshalArray(machine, parts[0], parts[1]);
                    } else {
                        machine[parts[0]] = parseFloat(parts[1]);
                        if (isBadNumber(machine[parts[0]])) {
                            machine[parts[0]] = 0;
                        }
                    }
                }
            }
        }
    }

    /**
     * Load calculator state from cookies.
     */
    load() {
        this.deserializeState(getState().machine, document.cookie);
    }
}
