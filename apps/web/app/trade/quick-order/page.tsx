import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PILOT_SESSION_COOKIE,
  getMyContexts,
  hasTradeRole,
  listMyOrders,
  listTradeProducts,
  type ComposedProduct,
  type CustomerOrderSummary,
} from "@/lib/experience-api";
import { buyAgainProducts } from "@/lib/trade";
import { TradeNav } from "../trade-nav";
import { QuickOrder } from "./quick-order";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trade quick order",
};

export default async function QuickOrderPage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) redirect(`/sign-in?next=${encodeURIComponent("/trade/quick-order")}`);

  let trade = false;
  try {
    trade = hasTradeRole(await getMyContexts(token));
  } catch {
    // The guard below sends non-trade or unavailable sessions to the trade marketing page.
  }
  if (!trade) redirect("/trade");

  let products: ComposedProduct[] = [];
  let orders: CustomerOrderSummary[] = [];
  try {
    [products, orders] = await Promise.all([
      listTradeProducts(token, 100),
      listMyOrders(token, 20),
    ]);
  } catch {
    // Both lists render their empty states below if the trade APIs are temporarily unavailable.
  }
  const available = products.filter((product) => product.best_price);
  const buyAgain = buyAgainProducts(available, orders);

  return (
    <section className="trade-page">
      <TradeNav active="quick-order" />
      <div className="trade-heading">
        <div>
          <span className="eyebrow">Trade workspace</span>
          <h1>Quick order</h1>
          <p className="muted page-lead">
            Search by SKU or title, set the MOQ quantity and add lines to the quotation cart.
            Buy-again lines come from your own order history.
          </p>
        </div>
      </div>
      <QuickOrder products={available} buyAgain={buyAgain} />
    </section>
  );
}
