/**
 * Single source of truth for plan pricing/minute allotments — shared by the
 * real Ziina checkout flow (app/api/subscription/verify-payment) and the
 * admin panel's manual grant tool, so the two can't drift apart.
 */

export const MONTHLY_PRICE_USD = 12;
export const MONTHLY_MINUTES = 150;

export const YEARLY_DISCOUNT_PCT = 30;
/** 12 months at the monthly price, minus the yearly discount. */
export const YEARLY_PRICE_USD = Math.round(MONTHLY_PRICE_USD * 12 * (1 - YEARLY_DISCOUNT_PCT / 100) * 100) / 100;
/** A full year's worth of monthly minutes, granted upfront. */
export const YEARLY_MINUTES = MONTHLY_MINUTES * 12;

export const TRIAL_DAYS = 3;
