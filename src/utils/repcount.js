export function localDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function logMutationError(entity, operation, error) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'Unknown error';
  console.error('[RepCount] ' + operation + ' ' + entity + ' failed: ' + message);
}

// The Supabase database trigger recalculates due balances atomically whenever a payment changes.
export async function adjustFeeCycleForPayment() {
  return null;
}
