import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { NavProgress } from "@/components/NavProgress";

export const metadata: Metadata = {
  title: "Reveal AI — Voice Says Everything",
  description: "Daily emotional check-in & burnout detection through your voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NavProgress />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
