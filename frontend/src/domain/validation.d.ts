export type ValidationErrorField = 'rating' | 'nps' | 'statement' | 'phone' | 'consent' | 'password' | 'confirmation';
export interface ValidationError { field: ValidationErrorField; message: string }
export interface ContactDraft { statement: string; phone: string; consent: boolean }
export function formatBrazilPhone(value: string): string;
export function isValidBrazilPhone(value: string): boolean;
export function validateRating(value: unknown): ValidationError | null;
export function validateNps(value: unknown): ValidationError | null;
export function validateContactRequest(draft: ContactDraft): ValidationError | null;
export function validatePasswordConfirmation(password: unknown, confirmation: unknown): ValidationError | null;