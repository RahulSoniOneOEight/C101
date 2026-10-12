/**
 * Editorial app-shell content — non-transactional, provider-neutral.
 *
 * This is a typed, version-controlled seed module. CMS provider selection remains deferred; CMS
 * content cannot own or determine price, stock, seller eligibility, payment, allocation, order or
 * accounting state. Resolve by content_type + placement + locale, falling back hi-IN -> en-IN.
 */

export type AppContentType =
  | "banner"
  | "onboarding"
  | "help"
  | "faq"
  | "campaign-copy"
  | "legal_link";
export type AppLocale = "en-IN" | "hi-IN";

export interface AppContent {
  id: string;
  content_type: AppContentType;
  placement: string;
  locale: AppLocale;
  title: string;
  body: string;
  action_label: string | null;
  action_uri: string | null;
  /** Contract requires a string version tag; fixtures use values such as `test-v1`. */
  version: string;
  test_data: boolean;
}

export const appContent: AppContent[] = [
  {
    id: "banner-welcome-en-in",
    content_type: "banner",
    placement: "home.hero",
    locale: "en-IN",
    title: "Welcome to BuildKart",
    body: "Tools, hardware and building supplies from verified sellers.",
    action_label: "Shop now",
    action_uri: "/products",
    version: "1",
    test_data: true,
  },
  {
    id: "banner-welcome-hi-in",
    content_type: "banner",
    placement: "home.hero",
    locale: "hi-IN",
    title: "BuildKart में आपका स्वागत है",
    body: "सत्यापित विक्रेताओं से उपकरण, हार्डवेयर और निर्माण सामग्री।",
    action_label: "अभी खरीदें",
    action_uri: "/products",
    version: "1",
    test_data: true,
  },
  {
    id: "onboarding-b2b-en-in",
    content_type: "onboarding",
    placement: "onboarding.b2b",
    locale: "en-IN",
    title: "Set up your business account",
    body: "Add your GSTIN, delivery sites and approval workflow to unlock B2B purchasing.",
    action_label: "Get started",
    action_uri: "/onboarding/business",
    version: "1",
    test_data: true,
  },
  {
    id: "help-delivery-en-in",
    content_type: "help",
    placement: "help.delivery",
    locale: "en-IN",
    title: "Delivery help",
    body: "Delivery times are shown on each seller offer. Your order ships after the seller confirms allocation.",
    action_label: null,
    action_uri: null,
    version: "1",
    test_data: true,
  },
  {
    id: "help-delivery-hi-in",
    content_type: "help",
    placement: "help.delivery",
    locale: "hi-IN",
    title: "डिलीवरी सहायता",
    body: "डिलीवरी समय हर विक्रेता प्रस्ताव पर दिखाया जाता है। विक्रेता द्वारा आवंटन की पुष्टि के बाद आपका ऑर्डर भेजा जाता है।",
    action_label: null,
    action_uri: null,
    version: "1",
    test_data: true,
  },
  {
    id: "faq-payment-en-in",
    content_type: "faq",
    placement: "faq.payment",
    locale: "en-IN",
    title: "Which payment methods are available?",
    body: "This staging environment uses simulated payment only. Real payment methods will be enabled after provider approval.",
    action_label: null,
    action_uri: null,
    version: "1",
    test_data: true,
  },
  {
    id: "legal-terms-en-in",
    content_type: "legal_link",
    placement: "footer.legal",
    locale: "en-IN",
    title: "Terms of Service",
    body: "Terms of Service",
    action_label: "Read",
    action_uri: "/legal/terms",
    version: "1",
    test_data: true,
  },
  {
    id: "legal-privacy-en-in",
    content_type: "legal_link",
    placement: "footer.legal",
    locale: "en-IN",
    title: "Privacy Policy",
    body: "Privacy Policy",
    action_label: "Read",
    action_uri: "/legal/privacy",
    version: "1",
    test_data: true,
  },
  // CHG-029 campaign elements. Editorial only; they cannot determine discount eligibility.
  {
    id: "content_campaign_power_tool_week_en_in",
    content_type: "campaign-copy",
    placement: "collection.power-tool-week.hero",
    locale: "en-IN",
    title: "Power Tool Week — 10% off",
    body: "Staging campaign. 10% off Power Tools and free shipping. Simulated discount, no real charge.",
    action_label: "Shop Power Tools",
    action_uri: "/collections/power-tool-week",
    version: "test-v1",
    test_data: true,
  },
  {
    id: "content_campaign_site_ready_banner_en_in",
    content_type: "banner",
    placement: "home.campaign-strip",
    locale: "en-IN",
    title: "Site Ready savings",
    body: "Bulk plywood and verified-trade safety gear offers for staging review.",
    action_label: "View offers",
    action_uri: "/collections/monsoon-site-essentials",
    version: "test-v1",
    test_data: true,
  },
  {
    id: "content_campaign_site_ready_banner_hi_in",
    content_type: "banner",
    placement: "home.campaign-strip",
    locale: "hi-IN",
    title: "साइट रेडी बचत",
    body: "स्टेजिंग समीक्षा के लिए थोक प्लाईवुड और सत्यापित व्यापार सुरक्षा उपकरण ऑफ़र।",
    action_label: "ऑफ़र देखें",
    action_uri: "/collections/monsoon-site-essentials",
    version: "test-v1",
    test_data: true,
  },
  {
    id: "content_onboarding_trade_program_en_in",
    content_type: "onboarding",
    placement: "onboarding.trade-program",
    locale: "en-IN",
    title: "Join the BuildKart trade program",
    body: "Add your GSTIN and delivery sites to unlock trade pricing and campaign eligibility in staging.",
    action_label: "Start",
    action_uri: "/onboarding/business",
    version: "test-v1",
    test_data: true,
  },
];

/** Resolve content for a placement, with hi-IN -> en-IN locale fallback. */
export function resolveContent(
  placement: string,
  locale: AppLocale,
): AppContent[] {
  const exact = appContent.filter((c) => c.placement === placement && c.locale === locale);
  if (exact.length) return exact;
  if (locale !== "en-IN") {
    return appContent.filter((c) => c.placement === placement && c.locale === "en-IN");
  }
  return [];
}
