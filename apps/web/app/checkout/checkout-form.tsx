"use client";

import { useState } from "react";

interface Props {
  offerId: string;
  productTitle: string;
}

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string }
  | { status: "done"; orderGroupId: string };

export function CheckoutForm({ offerId, productTitle }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offerId,
          email: form.get("email"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          address1: form.get("address1"),
          city: form.get("city"),
          postalCode: form.get("postalCode"),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        type?: string;
        order_group?: { id: string };
        payment?: { payment_mode?: string; test_data?: boolean };
      };
      if (!res.ok) {
        setState({ status: "error", message: data.error ?? `request failed (${res.status})` });
        return;
      }
      // Success is the server's canonical simulated order group — never assumed client-side.
      if (
        data.type !== "order_group" ||
        !data.order_group?.id ||
        data.payment?.payment_mode !== "simulated" ||
        data.payment?.test_data !== true
      ) {
        setState({ status: "error", message: "Server did not return a canonical simulated order." });
        return;
      }
      setState({ status: "done", orderGroupId: data.order_group.id });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }

  if (state.status === "done") {
    return (
      <div className="notice ok">
        Order confirmed · canonical order group <code>{state.orderGroupId}</code> · simulated payment
        (test data).
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <p className="muted">{productTitle} · simulated prepaid payment (bounded staging pilot)</p>
      <label>
        Email
        <input name="email" type="email" required defaultValue="pilot-buyer@buildkart.local" />
      </label>
      <label>
        First name
        <input name="firstName" required defaultValue="Pilot" />
      </label>
      <label>
        Last name
        <input name="lastName" required defaultValue="Buyer" />
      </label>
      <label>
        Address
        <input name="address1" required defaultValue="101 Test Yard" />
      </label>
      <label>
        City
        <input name="city" required defaultValue="Jaipur" />
      </label>
      <label>
        Postal code
        <input name="postalCode" required pattern="\d{6}" defaultValue="302001" />
      </label>
      {state.status === "error" ? <div className="notice err">Checkout failed: {state.message}</div> : null}
      <button className="button" type="submit" disabled={state.status === "busy"}>
        {state.status === "busy" ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
