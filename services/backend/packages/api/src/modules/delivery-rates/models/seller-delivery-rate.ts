import { model } from "@medusajs/framework/utils";

const SellerDeliveryRate = model.define("seller_delivery_rate", {
  id: model.id({ prefix: "sdr" }).primaryKey(),
  seller_id: model.text(),
  pincode: model.text(),
  flat_fee_minor: model.number(),
  currency_code: model.text().default("inr"),
  active: model.boolean().default(true),
  updated_by: model.enum(["admin", "seller"]),
});

export default SellerDeliveryRate;
