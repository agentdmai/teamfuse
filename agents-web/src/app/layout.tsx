import type { Metadata } from "next";
import { COMPANY_NAME } from "@/lib/agents";
import "./globals.css";

export const metadata: Metadata = {
  title: `${COMPANY_NAME} · control panel`,
  description: `Control plane for the ${COMPANY_NAME} Claude Code agents`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
