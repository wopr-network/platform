/**
 * Type augmentation for @testing-library/jest-dom vitest matchers.
 *
 * The @testing-library/jest-dom package ships without types/vitest.d.ts
 * in this npm install. This file augments @vitest/expect's Assertion
 * interface with the jest-dom matchers.
 *
 * This is a module file (export {} below) so the declare module blocks
 * act as augmentation rather than replacement.
 */

// Make this a module file so declare module augments rather than replaces.
export {};

declare module "@vitest/expect" {
  interface Assertion {
    toBeInTheDocument(): void;
    toBeVisible(): void;
    toBeDisabled(): void;
    toBeEnabled(): void;
    toBeChecked(): void;
    toBePartiallyChecked(): void;
    toBeRequired(): void;
    toBeValid(): void;
    toBeInvalid(): void;
    toBeEmptyDOMElement(): void;
    toContainElement(element: Element | null): void;
    toContainHTML(html: string): void;
    toHaveAccessibleDescription(description?: string | RegExp): void;
    toHaveAccessibleName(name?: string | RegExp): void;
    toHaveAttribute(attr: string, value?: unknown): void;
    toHaveClass(...classNames: string[]): void;
    toHaveFocus(): void;
    toHaveFormValues(values: Record<string, unknown>): void;
    toHaveStyle(css: string | Record<string, unknown>): void;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace: boolean }): void;
    toHaveValue(value?: string | string[] | number): void;
    toHaveDisplayValue(value: string | RegExp | (string | RegExp)[]): void;
  }
}
