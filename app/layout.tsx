import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { NavProgress } from "@/components/NavProgress";

const jakarta = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jakarta",
});

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
    <html lang="en" className={jakarta.variable}>
      <body>
        <AuthProvider>
          <NavProgress />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
