// Test setup and global utilities
import { jest } from '@jest/globals';

// Extend Jest matchers
expect.extend({
    toBeCloseTo(received: number, expected: number, precision: number = 2) {
        const pass = Math.abs(received - expected) < Math.pow(10, -precision);
        return {
            pass,
            message: () =>
                pass
                    ? `expected ${received} not to be close to ${expected}`
                    : `expected ${received} to be close to ${expected} (precision: ${precision})`
        };
    }
});

// Mock console methods to reduce test noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Set test timeout
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
    jest.clearAllMocks();
});
