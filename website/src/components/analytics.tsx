"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import {
  CONSENT_CHANGE_EVENT,
  readConsent,
  type ConsentValue,
} from "@/lib/consent";
import { SITE } from "@/lib/site";

export function Analytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(readConsent() === "accepted");
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ConsentValue>).detail;
      setConsented(detail === "accepted");
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  const tags = SITE.analytics.gaTags;
  if (!consented || tags.length === 0) return null;

  const [primary, ...rest] = tags;
  const configCalls = [primary, ...rest]
    .map((id) => `gtag('config', ${JSON.stringify(id)});`)
    .join("\n");

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${primary}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          ${configCalls}
        `}
      </Script>
    </>
  );
}
