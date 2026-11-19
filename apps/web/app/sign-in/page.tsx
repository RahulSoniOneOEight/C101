import {
  getStorefrontPresentation,
  type StorefrontBanner,
} from "@/lib/experience-api";
import { getStorefrontLocale } from "@/lib/locale";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const channel = next?.startsWith("/trade") ? "b2b" : "b2c";
  const locale = await getStorefrontLocale();
  const hindi = locale === "hi-IN";
  let welcomeBanner: StorefrontBanner | null = null;
  try {
    const presentation = await getStorefrontPresentation(channel, locale);
    welcomeBanner =
      presentation.banners.find(
        (banner) => banner.placement === `${channel}.welcome.banner`,
      ) ?? null;
  } catch {
    // The sign-in form remains usable if CMS content is unavailable.
  }
  return (
    <section className="narrow-page auth-page">
      <div className="auth-heading">
        <span className="eyebrow">{hindi ? "कस्टमर एक्सेस" : "Customer access"}</span>
        <h1>{hindi ? "BazarBee में साइन इन करें" : "Sign in to BazarBee"}</h1>
        <p className="muted page-lead">
          {hindi
            ? "ईमेल कोड या मैजिक लिंक इस्तेमाल करें। ऑर्डर, ट्रैकिंग और रिटर्न सिर्फ आपके अकाउंट तक सीमित हैं।"
            : "Use a one-time email code or a magic link. Orders, tracking and returns stay owner-scoped — an order number alone never grants access."}
        </p>
      </div>
      <SignInForm next={next} welcomeBanner={welcomeBanner} />
      <p className="boundary-note">
        {hindi
          ? "सीमित स्टेजिंग पायलट · अनुमत पहचान · सिंगल-यूज़ कोड और लिंक · HTTP-only ब्राउज़र सेशन"
          : "Bounded staging pilot · allowlisted identities · single-use codes and links · HTTP-only browser session"}
      </p>
    </section>
  );
}
