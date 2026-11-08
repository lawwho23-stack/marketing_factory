import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/noto-sans-myanmar/400.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Marketing Factory — Your little office, real work",
  description:
    "A private home for scripts, video production, leads and finance.",
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
