/**
 * Staging serviceability fixture.
 *
 * Shipment persistence and lifecycle now live in the durable ShipmentStore and the simulated
 * logistics provider. No shipment is kept in an in-memory Map here.
 */

const SERVICEABLE_POSTCODE = /^\d{6}$/;

export function checkServiceability(postcode: string): {
  serviceable: boolean;
  eta_days: number;
  reason: string | null;
} {
  if (!SERVICEABLE_POSTCODE.test(postcode)) {
    return { serviceable: false, eta_days: 0, reason: "invalid_postcode" };
  }
  return { serviceable: true, eta_days: 3, reason: null };
}
