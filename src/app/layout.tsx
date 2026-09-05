import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Urban Furniture Accounting",
    template: "%s · Urban Furniture Accounting",
  },
  description:
    "Double-entry accounting for Urban Furniture: master data, purchases, sales, payments and financial reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
