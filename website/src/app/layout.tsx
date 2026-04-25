import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/site";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Analytics } from "@/components/analytics";
import { CookieConsent } from "@/components/cookie-consent";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.title}, ${SITE.tagline}`,
    template: `%s · ${SITE.title}`,
  },
  description: SITE.description,
  keywords: Array.from(SITE.keywords),
  authors: [{ name: "AgentDM", url: "https://agentdm.ai" }],
  creator: "AgentDM",
  publisher: "AgentDM",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.title}, ${SITE.tagline}`,
    description: SITE.description,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${SITE.title}, ${SITE.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
    creator: SITE.twitter,
    title: `${SITE.title}, ${SITE.tagline}`,
    description: SITE.description,
    images: [
      {
        url: "/opengraph-image",
        alt: `${SITE.title}, ${SITE.tagline}`,
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: "AgentDM",
    url: SITE.agentdm,
    logo: `${SITE.url}/icon.svg`,
    sameAs: [SITE.repo, SITE.agentdm],
  };

  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    inLanguage: "en-US",
    publisher: { "@id": `${SITE.url}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE.url}/docs?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE.url}/#software`,
    name: SITE.name,
    description: SITE.description,
    url: SITE.url,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Linux",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    license: "https://opensource.org/licenses/MIT",
    codeRepository: SITE.repo,
    programmingLanguage: ["TypeScript", "Python"],
    author: { "@id": `${SITE.url}/#organization` },
    publisher: { "@id": `${SITE.url}/#organization` },
    image: `${SITE.url}/opengraph-image`,
    screenshot: [
      `${SITE.url}/screenshots/control-panel.svg`,
      `${SITE.url}/screenshots/agentdm-network.svg`,
    ],
    featureList: [
      "Persistent streaming Claude Code sessions per agent",
      "Agent-to-agent direct messaging over AgentDM",
      "Local breaker-cabinet style control panel dashboard",
      "One-command bootstrap via /teamfuse-init",
      "Pluggable Kanban boards: GitHub Projects, Linear, Jira, Trello, Notion",
      "Runs across multiple machines with no shared filesystem",
    ],
  };

  const graphLd = {
    "@context": "https://schema.org",
    "@graph": [organizationLd, websiteLd, softwareLd],
  };

  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graphLd) }}
        />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
