import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fuji Chrome",
  description: "Classic Chrome film look for any photo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
