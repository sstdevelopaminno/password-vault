import type { MetadataRoute } from "next";

const LOGO_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/Imagemaster" +
  String.fromCharCode(37) +
  "20password.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0ltYWdlbWFzdGVyIHBhc3N3b3JkLnBuZyIsImlhdCI6MTc3NDc3ODU5MywiZXhwIjoxODA2MzE0NTkzfQ.DtXXTBgybU6RG5SGG3YWocfxxdsbGFNdPW5p6i5Cszk";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Password Vault",
    short_name: "Vault",
    description: "Secure mobile-first password manager",
 id: "/",
 scope: "/",
    start_url: "/home",
    display: "standalone",
    background_color: "#f4f7ff",
    theme_color: "#2563eb",
    lang: "th",
    icons: [
      {
        src: LOGO_URL,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: LOGO_URL,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: LOGO_URL,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

