import type { Metadata, Viewport } from "next";
import { Providers } from "@/app/providers";
import "./globals.css";

const LOGO_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/Imagemaster" +
  String.fromCharCode(37) +
  "20password.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0ltYWdlbWFzdGVyIHBhc3N3b3JkLnBuZyIsImlhdCI6MTc3NDc3ODU5MywiZXhwIjoxODA2MzE0NTkzfQ.DtXXTBgybU6RG5SGG3YWocfxxdsbGFNdPW5p6i5Cszk";

export const metadata: Metadata = {
  title: "Password Vault",
  description: "Mobile-first password manager with OTP, PIN and RBAC",
  icons: {
    icon: [{ url: LOGO_URL, type: "image/png" }],
    shortcut: [{ url: LOGO_URL, type: "image/png" }],
    apple: [{ url: LOGO_URL, type: "image/png" }],
 },
 appleWebApp: {
 capable: true,
 statusBarStyle: "default",
 title: "Password Vault",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

