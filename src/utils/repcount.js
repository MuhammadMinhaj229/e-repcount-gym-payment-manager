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

/**
 * Reconcile a linked fee-cycle aggregate after a payment is created, edited, refunded, or removed.
 * The SDK does not expose a multi-table transaction, so callers must surface sync failures clearly.
 */
export async function adjustFeeCycleForPayment(sdk, dueId, delta) {
  const deltaCents = Math.round(Number(delta) * 100);
  if (!dueId || !Number.isFinite(deltaCents) || deltaCents === 0) return null;

  const current = await sdk.table('membership_dues_c')
    .select(['Id', 'amount_due_c', 'amount_paid_c', 'balance_c', 'status_c'])
    .get(dueId);

  if (!current.success || !current.data) {
    throw new Error(current.message || 'The linked fee cycle could not be loaded.');
  }

  const due = current.data;
  if (due.status_c === 'Waived') {
    throw new Error('A waived fee cycle cannot be reconciled with a payment.');
  }

  const dueCents = Math.max(0, Math.round(Number(due.amount_due_c || 0) * 100));
  const currentPaidCents = Math.max(0, Math.round(Number(due.amount_paid_c || 0) * 100));
  const nextPaidCents = currentPaidCents + deltaCents;
  if (nextPaidCents > dueCents) {
    throw new Error('The recorded payments would exceed the fee-cycle amount. Review the fee cycle before saving.');
  }

  const paidCents = Math.max(0, nextPaidCents);
  const balanceCents = Math.max(0, dueCents - paidCents);
  const amountPaid = paidCents / 100;
  const balance = balanceCents / 100;
  const status = balanceCents === 0
    ? 'Paid'
    : paidCents > 0
      ? 'Partially paid'
      : 'Unpaid';

  const updated = await sdk.table('membership_dues_c').update({
    Id: due.Id,
    amount_paid_c: amountPaid,
    balance_c: balance,
    status_c: status,
  });

  if (!updated.data?.length) {
    throw new Error(updated.messages?.join('; ') || updated.message || 'The fee-cycle balance update did not complete.');
  }

  return updated.data[0];
}

/**
 * Adds the signed-in demo owner to new mock records so the mock row policies
 * can display records created during the current session.
 * This is only for the MemoryAdapter showcase; production writes should let
 * the connected backend assign and enforce ownership.
 */
export function currentMockOwner(sdk) {
  const user = sdk?.session?.user?.();
  const ownerId = user?.Id;
  if (!ownerId) {
    throw new Error('Your session is not ready. Sign in again and retry.');
  }
  const fullName = [user?.FirstName, user?.LastName].filter(Boolean).join(' ');
  return {
    Id: String(ownerId),
    Name: user?.Name || fullName || user?.name || user?.emailAddress || user?.Email || 'Gym Owner',
  };
}
