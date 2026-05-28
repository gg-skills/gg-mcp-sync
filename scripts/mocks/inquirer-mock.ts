/**
 * @fileoverview Pre-queued Inquirer prompt answers for MCP Jest suites so CLI flows run without a TTY.
 * @example
 * ```ts
 * const responses = createMockResponses();
 * responses.confirm.push(false);
 * const prompts = createInquirerMocks(responses);
 * await prompts.confirm(); // false
 * ```
 * @testing Jest unit: npm test -- --runInBand scripts/mocks/inquirer-mock.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest } from "@jest/globals";

/**
 * Shape of pre-configured inquirer prompt response queues used by mock helpers.
 * @remarks
 * I/O: No external resources touched.
 * PURITY: Pure data container; mock indices advance on each prompt call.
 */
export interface MockPromptResponses {
  checkbox: string[][];
  confirm: boolean[];
  input: string[];
  password: string[];
  select: string[];
}

/**
 * Allocate empty response queues for every Inquirer prompt shape used by `createInquirerMocks`.
 */
export function createMockResponses(): MockPromptResponses {
  return {
    checkbox: [],
    confirm: [],
    input: [],
    password: [],
    select: [],
  };
}

/**
 * Build `jest.fn` prompt handlers that dequeue `responses` in call order with safe fallbacks when queues run dry.
 * @remarks Checkbox/confirm/input/password/select each maintain an internal index; `Separator` mirrors Inquirer's class shape for choice lists.
 */
export function createInquirerMocks(responses: MockPromptResponses) {
  let checkboxIndex = 0;
  let confirmIndex = 0;
  let inputIndex = 0;
  let passwordIndex = 0;
  let selectIndex = 0;

  return {
    checkbox: jest.fn(async () => {
      if (checkboxIndex < responses.checkbox.length) {
        return responses.checkbox[checkboxIndex++];
      }
      return [];
    }),
    confirm: jest.fn(async () => {
      if (confirmIndex < responses.confirm.length) {
        return responses.confirm[confirmIndex++];
      }
      return true;
    }),
    input: jest.fn(async () => {
      if (inputIndex < responses.input.length) {
        return responses.input[inputIndex++];
      }
      return "";
    }),
    password: jest.fn(async () => {
      if (passwordIndex < responses.password.length) {
        return responses.password[passwordIndex++];
      }
      return "";
    }),
    select: jest.fn(async () => {
      if (selectIndex < responses.select.length) {
        return responses.select[selectIndex++];
      }
      return "";
    }),
    Separator: InquirerMock_createSeparatorClass(),
  };
}

/**
 * Returns the mock `Separator` class constructor used by `createInquirerMocks` for choice lists.
 *
 * @remarks
 * Each call builds a fresh class so `Separator` stays scoped to a single mocks instance.
 */
function InquirerMock_createSeparatorClass() {
  /**
   * Minimal Inquirer `Separator` stand-in for mocked choice lists in MCP Jest suites.
   *
   * @remarks
   * Mirrors the discriminator and `line` field shape used by Inquirer separators inside `select` prompts.
   */
  class InquirerMockSeparator {
    type = "separator" as const;
    line: string;

    /**
     * Creates a separator row with the displayed label for mocked choice lists.
     *
     * @param line - Separator label shown in the choice list; defaults to empty when omitted.
     */
    constructor(line = "") {
      this.line = line;
    }
  }

  return InquirerMockSeparator;
}

/**
 * Clear Jest call history on every prompt mock from `createInquirerMocks` without mutating queued `responses`.
 * @remarks Does not reset queue indices inside `createInquirerMocks`; create a new mocks object when indices must rewind.
 */
export function resetInquirerMocks(mocks: ReturnType<typeof createInquirerMocks>) {
  (mocks.checkbox as jest.Mock).mockClear();
  (mocks.confirm as jest.Mock).mockClear();
  (mocks.input as jest.Mock).mockClear();
  (mocks.password as jest.Mock).mockClear();
  (mocks.select as jest.Mock).mockClear();
}
